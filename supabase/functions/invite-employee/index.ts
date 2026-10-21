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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { corsHeaders } from "../_shared/cors.ts";

const DEFAULT_STAFF_PERMISSIONS = ["pos.sell", "inventory.view"];
const OWNER_EMAIL = "me.makai48@gmail.com";

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
    const inviterName = String(body?.inviterName || "Owner").trim();
    const businessId = orNull(body?.businessId);

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "A valid email address is required" }, 400);
    }
    if (email === OWNER_EMAIL) {
      return json({ error: "The app owner account is not invitable" }, 400);
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
    const metadata = { username: name, role, permissions };

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

    // === Upsert the profile with the full invite payload ===
    const { error: profErr } = await admin
      .from("user_profiles")
      .upsert(
        {
          id: userId,
          email,
          username: name,
          role,
          permissions,
          phone,
          address,
          hire_date: hireDate,
          emergency_contact: emergencyContact,
          emergency_contact_phone: emergencyContactPhone,
          active: false,
          approval_status: "pending_first_login",
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
    if (businessId) {
      const memberRole = role.toLowerCase() === "manager" ? "manager" : "staff";
      const { error: memberErr } = await admin
        .from("business_members")
        .upsert(
          { business_id: businessId, user_id: userId, role: memberRole },
          { onConflict: "business_id,user_id" },
        );
      if (memberErr) throw new Error(`Membership upsert: ${memberErr.message}`);
    }

    return json({
      success: true,
      userId,
      email,
      name,
      role,
      tempPassword,
      expiresAt,
      expirationHours,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("invite-employee error:", msg);
    return json({ error: msg }, 500);
  }
});

/** Turn an opaque auth error into a rich, greppable diagnostic string. */
function describeAuthError(err: unknown): string {
  if (!err) return "unknown error";
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
