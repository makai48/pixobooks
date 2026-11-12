// Create / re-issue a temporary password for an employee AND persist their
// full profile (display name, job title, phone, email, address, hire date,
// emergency contact name + phone).
//
// WHY THIS FILE BYPASSES gotrue admin API
// ---------------------------------------
// The project's gotrue admin API is currently rejecting every write with:
//   status=400 code=invalid_host_protocol msg="ipNotInner"
// This is emitted by gotrue's built-in SSRF validator when the project's
// Site URL / redirect URLs fail its private-IP check. The validation runs
// BEFORE the user is inserted, so both `admin.createUser` and the raw
// REST `POST /auth/v1/admin/users` endpoints fail identically. To make
// invites work we bypass gotrue and write into `auth.users` +
// `auth.identities` via a `SECURITY DEFINER` SQL function:
// `public.admin_create_or_reset_user(email, password, metadata)`. The
// remainder of the profile is upserted directly into public.user_profiles.
//
// The SQL function is versioned in
// `supabase/migrations/20261027000001_auth_user_onboarding_fix.sql` — it must
// be applied for sign-in to work. After creating/resetting the user we verify
// the temporary password against GoTrue (the same endpoint the login form
// uses). If that verification fails we repair the row and retry, then refuse
// to return a password that cannot sign in.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

// CORS headers are inlined instead of imported from `../_shared/cors.ts` so the
// function is a single self-contained file: the Supabase Dashboard editor only
// deploys one file per function, and a relative import outside the function
// folder fails there. Keep this in sync with supabase/functions/_shared/cors.ts.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
};

const DEFAULT_STAFF_PERMISSIONS = ["pos.sell", "inventory.view"];
const ADMIN_EMAIL = "me.makai48@gmail.com";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);
    const token = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    // Verify caller is authenticated
    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await caller.auth.getUser(token);
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || "").trim().toLowerCase();
    const name = String(body?.name || "").trim() || email.split("@")[0];
    const fullName = String(body?.fullName || "").trim() || name;
    const role = String(body?.role || "").trim() || "Staff";
    const phone = orNull(body?.phone);
    const address = orNull(body?.address);
    const hireDate = orNull(body?.hireDate);
    const emergencyContact = orNull(body?.emergencyContact);
    const emergencyContactPhone = orNull(body?.emergencyContactPhone);
    const permissions =
      Array.isArray(body?.permissions) && body.permissions.length > 0
        ? body.permissions
        : DEFAULT_STAFF_PERMISSIONS;
    const expirationHours = clamp(Number(body?.expirationHours || 72), 1, 720);
    const inviterName = String(body?.inviterName || "Admin").trim();
    const businessId = orNull(body?.businessId);
    const shopName = String(body?.shopName || "").trim() || "your shop";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "A valid email address is required" }, 400);
    }
    if (email === ADMIN_EMAIL) {
      return json({ error: "The app admin account is not invitable" }, 400);
    }

    // The caller may only add staff to a business they manage. RLS on
    // business_members lets members read their own row.
    if (businessId) {
      const { data: membership, error: memErr } = await caller
        .from("business_members")
        .select("role")
        .eq("business_id", businessId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (memErr) throw new Error(`Membership check failed: ${memErr.message}`);
      if (!membership || !["owner", "manager"].includes(String(membership.role))) {
        return json({ error: "You cannot invite staff to this business" }, 403);
      }
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const tempPassword = generateSecurePassword();
    const expiresAt = new Date(Date.now() + expirationHours * 3600 * 1000).toISOString();
    const metadata = { username: name, display_name: name, full_name: fullName, role, permissions };

    // Detect any pre-existing profile so we can clean it up if it's
    // orphaned (points to a different auth.users id than we're about
    // to write).
    const { data: existingProfile, error: profLookupErr } = await admin
      .from("user_profiles")
      .select("id, email")
      .ilike("email", email)
      .maybeSingle();
    if (profLookupErr) {
      console.warn("profile lookup warning:", profLookupErr.message);
    }

    console.log("invite-employee state:", {
      email,
      profileFound: !!existingProfile,
      profileId: existingProfile?.id ?? null,
    });

    // === Authoritative user creation via SQL RPC (bypasses gotrue) ===
    const rpc = await admin.rpc("admin_create_or_reset_user", {
      p_email: email,
      p_password: tempPassword,
      p_metadata: metadata,
    });
    if (rpc.error) {
      throw new Error(
        `SQL create/reset failed: ${rpc.error.message}${
          rpc.error.details ? " | " + rpc.error.details : ""
        }${rpc.error.hint ? " | hint=" + rpc.error.hint : ""}`,
      );
    }
    const userId = String(rpc.data || "");
    if (!userId) throw new Error("SQL create/reset returned no user id");
    console.log("invite-employee: SQL RPC OK", userId);

    // Clean up an orphan profile row (email matches but points to a
    // different auth.users id than the one we just resolved).
    if (existingProfile?.id && existingProfile.id !== userId) {
      const { error: delErr } = await admin
        .from("user_profiles")
        .delete()
        .eq("id", existingProfile.id);
      if (delErr) console.warn("orphan profile delete failed:", delErr.message);
    }

    // === Best-effort finalize via gotrue admin API ===
    try {
      const finalize = await admin.auth.admin.updateUserById(userId, {
        password: tempPassword,
        email_confirm: true,
        user_metadata: metadata,
      });
      if (finalize.error) {
        console.warn(
          "gotrue finalize skipped:",
          describeAuthError(finalize.error),
        );
      }
    } catch (e) {
      console.warn("gotrue finalize threw (ignored):", (e as Error).message);
    }

    // === Verify the temporary password can actually sign in ===
    // GoTrue reads auth.users directly on sign-in, so a row written by SQL is
    // only usable once the bcrypt hash, confirmation and NULL-sensitive
    // columns are all correct. Prove it here rather than handing out a
    // password that fails on the employee's first attempt.
    let authError = await verifyTempPassword(
      supabaseUrl,
      anonKey,
      email,
      tempPassword,
    );
    if (authError) {
      console.warn("temp password verification failed, repairing:", authError);
      const repair = await admin.rpc("pixo_repair_auth_user", {
        p_user_id: userId,
        p_confirm: true,
      });
      if (repair.error) {
        console.warn("auth user repair failed:", repair.error.message);
      }
      authError = await verifyTempPassword(
        supabaseUrl,
        anonKey,
        email,
        tempPassword,
      );
    }
    if (authError) {
      throw new Error(
        `Account created, but the temporary password cannot sign in yet (${authError}). ` +
          `Apply supabase/migrations/20261027000001_auth_user_onboarding_fix.sql ` +
          `in the Supabase SQL editor, then invite this employee again.`,
      );
    }
    console.log("invite-employee: temp password verified with GoTrue");

    // === Upsert the profile with the full invite payload ===
    const { error: profErr } = await admin
      .from("user_profiles")
      .upsert(
        {
          id: userId,
          email,
          username: name,
          display_name: name,
          full_name: fullName,
          role,
          permissions,
          phone,
          address,
          hire_date: hireDate,
          emergency_contact: emergencyContact,
          emergency_contact_phone: emergencyContactPhone,
          // No approval gate. An invited employee is usable as soon as they
          // have the temp password; Login sends them straight to
          // /change-password and nothing else works until they set a permanent
          // one. `must_change_password` is the only gate that remains.
          active: true,
          approval_status: "approved",
          approved_at: new Date().toISOString(),
          must_change_password: true,
          temp_password_expires_at: expiresAt,
          invited_by: user.id,
          invited_by_name: inviterName,
          invited_at: new Date().toISOString(),
          failed_login_count: 0,
          locked_until: null,
        },
        { onConflict: "id" },
      );
    if (profErr) throw new Error(`Profile upsert: ${profErr.message}`);

    // Attach the invitee to the active business so tenant RLS grants access.
    // The tenant role must mirror the profile tier: Admin/Owner are privileged,
    // Manager gets manager rights, everyone else is staff.
    if (businessId) {
      const tier = role.trim().toLowerCase();
      const memberRole =
        tier === "owner" ? "owner" : tier === "admin" ? "admin" : tier === "manager" ? "manager" : "staff";
      const { error: memberErr } = await admin
        .from("business_members")
        .upsert(
          { business_id: businessId, user_id: userId, role: memberRole },
          { onConflict: "business_id,user_id" },
        );
      if (memberErr) throw new Error(`Membership upsert: ${memberErr.message}`);
    }

    // === Deliver the invite from the server ============================
    // Sending happens here (not in the browser) so the admin does not have to
    // copy anything, and so the send is recorded against the same request.
    // Providers are optional: without credentials the invite still succeeds and
    // the response says `not_configured`, which the UI turns into "share these
    // credentials manually" plus pre-filled mail/SMS links.
    const loginUrl =
      Deno.env.get("INVITE_LOGIN_URL") ??
      Deno.env.get("APP_URL") ??
      Deno.env.get("SITE_URL") ??
      "";
    const inviteMessage = buildInviteMessage({
      name,
      shopName,
      inviterName,
      email,
      tempPassword,
      expiresAt,
      loginUrl,
    });
    const subject = `Welcome to ${shopName} — your account is ready`;

    const [emailDelivery, smsDelivery] = await Promise.all([
      sendInviteEmail({ to: email, subject, text: inviteMessage }),
      phone
        ? sendInviteSms({
            to: phone,
            text: buildInviteSmsMessage({
              shopName,
              inviterName,
              loginUrl,
              tempPassword,
              expiresAt,
            }),
          })
        : Promise.resolve<DeliveryResult>({
            status: "no_recipient",
            detail: "No phone number on this invite",
          }),
    ]);

    console.log("invite-employee delivery:", {
      email: emailDelivery.status,
      sms: smsDelivery.status,
    });

    return json({
      success: true,
      userId,
      email,
      name,
      role,
      tempPassword,
      expiresAt,
      expirationHours,
      delivery: { email: emailDelivery, sms: smsDelivery },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("invite-employee error:", msg);
    return json({ error: msg }, 500);
  }
});

/**
 * Attempt a real password grant against GoTrue and revoke the session.
 * Returns null on success, or a short diagnostic string on failure.
 */
async function verifyTempPassword(
  supabaseUrl: string,
  anonKey: string,
  email: string,
  password: string,
): Promise<string | null> {
  if (!supabaseUrl || !anonKey) return "auth endpoint is not configured";

  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ email, password }),
    });
    const text = await res.text();
    if (!res.ok) return `[${res.status}] ${shortAuthError(text)}`;

    try {
      const parsed = JSON.parse(text) as { access_token?: string };
      if (parsed.access_token) {
        await fetch(`${supabaseUrl}/auth/v1/logout`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: anonKey,
            Authorization: `Bearer ${parsed.access_token}`,
          },
        });
      }
    } catch {
      // Session cleanup is best effort — never fail the invite on it.
    }
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

/** Pull GoTrue's message out of an error body so the admin sees something useful. */
function shortAuthError(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const msg =
      parsed.msg || parsed.message || parsed.error_description || parsed.error;
    if (msg) return String(msg);
  } catch {
    // Not JSON — fall through to the raw body.
  }
  return raw.slice(0, 240);
}

/** Turn an opaque auth error into a rich, greppable diagnostic string. */
function describeAuthError(err: unknown): string {  if (!err) return "unknown error";
  const anyErr = err as Record<string, unknown>;
  const parts: string[] = [];
  if (anyErr.status !== undefined) parts.push(`status=${String(anyErr.status)}`);
  if (anyErr.code !== undefined && anyErr.code !== "") parts.push(`code=${String(anyErr.code)}`);
  if (anyErr.name && anyErr.name !== "Error") parts.push(`name=${String(anyErr.name)}`);
  if (anyErr.message) parts.push(`msg="${String(anyErr.message)}"`);
  return parts.join(" | ") || "unknown auth error";
}

function orNull(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function generateSecurePassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%*-_";
  const all = upper + lower + digits + symbols;
  const chars: string[] = [
    pick(upper), pick(upper),
    pick(lower), pick(lower),
    pick(digits), pick(digits),
    pick(symbols),
  ];
  for (let i = 0; i < 7; i++) chars.push(pick(all));
  return shuffle(chars).join("");
}
function pick(pool: string): string {
  return pool[randInt(pool.length)];
}
function randInt(max: number): number {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0] % max;
}
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function clamp(v: number, lo: number, hi: number) {
  if (Number.isNaN(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}

/* ------------------------------------------------------------------ *
 * Invite delivery
 *
 * Providers are read from function secrets so no credential ever reaches
 * the browser:
 *   email  RESEND_API_KEY + INVITE_EMAIL_FROM
 *   sms    TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM_NUMBER
 *   link   INVITE_LOGIN_URL (defaults to APP_URL / SITE_URL)
 *
 * A missing provider is NOT an error. The account is already usable; the UI
 * falls back to showing the credentials and opening the device's mail/SMS
 * app pre-filled.
 * ------------------------------------------------------------------ */
type DeliveryStatus = "sent" | "not_configured" | "no_recipient" | "failed";

type DeliveryResult = { status: DeliveryStatus; detail?: string };

function buildInviteMessage(opts: {
  name: string;
  shopName: string;
  inviterName: string;
  email: string;
  tempPassword: string;
  expiresAt: string;
  loginUrl: string;
}): string {
  const expires = new Date(opts.expiresAt).toUTCString();
  return [
    `Hi ${opts.name},`,
    "",
    `Welcome aboard. ${opts.inviterName} has set you up on PixoBooks, the system we use`,
    `for sales, stock and daily records at ${opts.shopName}.`,
    "",
    "Getting started takes about a minute:",
    "",
    `  1. Open ${opts.loginUrl || "the PixoBooks app"}`,
    `  2. Sign in with ${opts.email}`,
    "  3. Use the temporary password below",
    "  4. Choose your own password when prompted",
    "",
    `  Temporary password: ${opts.tempPassword}`,
    `  Valid until:        ${expires}`,
    "",
    "That's it — you're in. If anything looks off on your first day, just ask",
    `${opts.inviterName}.`,
    "",
    `— The ${opts.shopName} team`,
  ].join("\n");
}

/** SMS is a different medium: the email body is four segments long and reads
 *  badly as a text. Keep the same facts in a compact form. */
function buildInviteSmsMessage(opts: {
  shopName: string;
  inviterName: string;
  loginUrl: string;
  tempPassword: string;
  expiresAt: string;
}): string {
  const expires = new Date(opts.expiresAt).toUTCString();
  return [
    `${opts.shopName}: ${opts.inviterName} added you to PixoBooks.`,
    opts.loginUrl ? `Sign in: ${opts.loginUrl}` : "",
    `Temp password: ${opts.tempPassword}`,
    `Expires: ${expires}`,
    "You'll set your own password on first sign-in.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function sendInviteEmail(opts: {
  to: string;
  subject: string;
  text: string;
}): Promise<DeliveryResult> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("INVITE_EMAIL_FROM");
  if (!apiKey || !from) {
    // Say exactly which secret is invisible, otherwise "not configured" sends
    // you hunting through both names and both projects.
    const missing = [
      !apiKey ? "RESEND_API_KEY" : null,
      !from ? "INVITE_EMAIL_FROM" : null,
    ]
      .filter(Boolean)
      .join(" and ");
    return {
      status: "not_configured",
      detail:
        `${missing} is not visible to this function. Add it in Project Settings ` +
        `→ Edge Functions → Secrets for this project, then redeploy the function ` +
        `(secrets are injected when the function starts).`,
    };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: opts.subject,
        text: opts.text,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { status: "failed", detail: `[${res.status}] ${body.slice(0, 240)}` };
    }
    return { status: "sent" };
  } catch (e) {
    return { status: "failed", detail: (e as Error).message };
  }
}

async function sendInviteSms(opts: {
  to: string;
  text: string;
}): Promise<DeliveryResult> {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_FROM_NUMBER");
  if (!sid || !token || !from) {
    return {
      status: "not_configured",
      detail:
        "Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER to send SMS automatically",
    };
  }

  try {
    const body = new URLSearchParams({
      To: opts.to,
      From: from,
      // SMS has a hard 1600-char limit; the message is well under it.
      Body: opts.text.slice(0, 1500),
    });
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { status: "failed", detail: `[${res.status}] ${text.slice(0, 240)}` };
    }
    return { status: "sent" };
  } catch (e) {
    return { status: "failed", detail: (e as Error).message };
  }
}
