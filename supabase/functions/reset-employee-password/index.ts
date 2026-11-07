// Reset an employee's password via a temporary credential + require them
// to set a permanent one on next sign-in.
//
// FLOW (invoked by Admin/authorized user from PasswordResets page):
//  1. Verify caller has an active session (edge-runtime side).
//  2. Load the pending password_reset_requests row.
//  3. Resolve the target user by employee_id or email.
//  4. Generate a secure temp password and reset the auth password via
//     `public.admin_create_or_reset_user` SQL RPC (bypasses gotrue admin
//     API for the same ipNotInner reasons as invite-employee).
//  5. Update user_profiles: must_change_password=true,
//     temp_password_expires_at, clear failed_login_count and locked_until,
//     force approval_status='approved' so a previously locked account
//     is unlocked immediately.
//  6. Mark the request approved, stamp approver + expiry, and store the
//     temp password so the admin can re-display / re-share it until it
//     expires (frontend clears it from view after the modal is dismissed).
//  7. Return the temp password + expiry so the caller can show it in a
//     secure result modal for copy / email / WhatsApp share.
//
// The SQL function is versioned in
// `supabase/migrations/20261027000001_auth_user_onboarding_fix.sql`. After
// resetting we verify the temp password against GoTrue, repair + retry once on
// failure, and refuse to mark the request approved if the credential cannot
// sign in.

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

    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userErr,
    } = await caller.auth.getUser(token);
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const requestId = String(body?.requestId || "").trim();
    const approverName = String(body?.approverName || "Admin").trim();
    const expirationHours = clamp(Number(body?.expirationHours || 24), 1, 720);
    if (!requestId) return json({ error: "requestId is required" }, 400);

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Fetch the reset request
    const { data: request, error: reqErr } = await admin
      .from("password_reset_requests")
      .select("*")
      .eq("id", requestId)
      .maybeSingle();
    if (reqErr || !request) {
      return json(
        { error: reqErr?.message || "Reset request not found" },
        404,
      );
    }
    if (request.status !== "pending") {
      return json(
        { error: `Request is already ${request.status}` },
        400,
      );
    }

    const email = String(request.email || "").trim().toLowerCase();
    if (!email) return json({ error: "Request has no email" }, 400);

    // 2. Resolve target user
    let targetUserId: string | null = request.employee_id || null;
    let targetName: string = request.employee_name || email;
    if (!targetUserId) {
      const { data: prof, error: profErr } = await admin
        .from("user_profiles")
        .select("id, username")
        .ilike("email", email)
        .maybeSingle();
      if (profErr || !prof) {
        return json(
          { error: `No employee account found for ${email}` },
          404,
        );
      }
      targetUserId = prof.id;
      targetName = prof.username || email;
    }

    // 3. Generate new temp password and reset auth password via SQL RPC
    const tempPassword = generateSecurePassword();
    const expiresAt = new Date(
      Date.now() + expirationHours * 3600 * 1000,
    ).toISOString();

    const rpc = await admin.rpc("admin_create_or_reset_user", {
      p_email: email,
      p_password: tempPassword,
      p_metadata: {},
    });
    if (rpc.error) {
      throw new Error(
        `Password reset failed: ${rpc.error.message}${
          rpc.error.details ? " | " + rpc.error.details : ""
        }`,
      );
    }
    const resolvedUserId = String(rpc.data || targetUserId);
    if (!resolvedUserId) {
      throw new Error("Password reset returned no user id");
    }

    // 3b. Prove the new temp password works before claiming success. This is
    // the exact grant the login form performs, so a broken auth row surfaces
    // here instead of in front of the employee.
    let authError = await verifyTempPassword(
      supabaseUrl,
      anonKey,
      email,
      tempPassword,
    );
    if (authError) {
      console.warn("temp password verification failed, repairing:", authError);
      const repair = await admin.rpc("pixo_repair_auth_user", {
        p_user_id: resolvedUserId,
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
        `Password reset applied, but the temporary password cannot sign in yet (${authError}). ` +
          `Apply supabase/migrations/20261027000001_auth_user_onboarding_fix.sql ` +
          `in the Supabase SQL editor, then approve this request again.`,
      );
    }

    // 4. Update user_profiles — unlock, mark must_change_password, set expiry.
    const { data: profRows, error: upErr } = await admin
      .from("user_profiles")
      .update({
        must_change_password: true,
        temp_password_expires_at: expiresAt,
        failed_login_count: 0,
        locked_until: null,
        // Ensure account is active (previously-approved accounts stay
        // approved; explicitly-rejected ones should be re-approved by
        // the admin through Account Approvals — do not overwrite here).
      })
      .eq("id", resolvedUserId)
      .select("id");
    if (upErr) {
      throw new Error(`Profile update: ${upErr.message}`);
    }
    if (!profRows || profRows.length === 0) {
      throw new Error(
        `No employee profile found for ${email}. Re-invite the employee instead of resetting the password.`,
      );
    }

    // 5. Update the request row — stamp approval + store temp password
    const { error: reqUpdErr } = await admin
      .from("password_reset_requests")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: user.id,
        approved_by_name: approverName,
        temp_password: tempPassword,
        temp_password_expires_at: expiresAt,
      })
      .eq("id", requestId);
    if (reqUpdErr) {
      throw new Error(`Request update: ${reqUpdErr.message}`);
    }

    // 6. Audit log (soft-fail)
    try {
      await admin.from("audit_logs").insert({
        actor_id: user.id,
        actor_name: approverName,
        action: "password_reset.approve",
        entity: "user",
        entity_id: resolvedUserId,
        meta: {
          email,
          request_id: requestId,
          expires_at: expiresAt,
          expiration_hours: expirationHours,
        },
      });
    } catch (auditErr) {
      console.warn("audit log write failed:", (auditErr as Error).message);
    }

    return json({
      success: true,
      requestId,
      userId: resolvedUserId,
      email,
      employeeName: targetName,
      tempPassword,
      expiresAt,
      expirationHours,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("reset-employee-password error:", msg);
    return json({ error: msg }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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
      // Session cleanup is best effort.
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
