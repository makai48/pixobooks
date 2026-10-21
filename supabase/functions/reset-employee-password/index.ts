// Reset an employee's password via a temporary credential + require them
// to set a permanent one on next sign-in.
//
// FLOW (invoked by Owner/authorized user from PasswordResets page):
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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { corsHeaders } from "../_shared/cors.ts";

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
    const approverName = String(body?.approverName || "Owner").trim();
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

    // 4. Update user_profiles — unlock, mark must_change_password, set expiry.
    const { error: upErr } = await admin
      .from("user_profiles")
      .update({
        must_change_password: true,
        temp_password_expires_at: expiresAt,
        failed_login_count: 0,
        locked_until: null,
        // Ensure account is active (previously-approved accounts stay
        // approved; explicitly-rejected ones should be re-approved by
        // the owner through Account Approvals — do not overwrite here).
      })
      .eq("id", resolvedUserId);
    if (upErr) {
      console.warn("profile update warning:", upErr.message);
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
