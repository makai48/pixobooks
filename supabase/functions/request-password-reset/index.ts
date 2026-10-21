import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * Anonymous-safe password reset request endpoint.
 *
 * The Login screen has no session, so RLS blocks it from reading
 * `user_profiles` directly. This function runs with the service-role key,
 * validates the email against real employee accounts, then writes a
 * pending row to `password_reset_requests` that the shop owner can approve
 * from their Password Requests page.
 */
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || "").trim().toLowerCase();
    if (!email) {
      return json({ error: "Email is required" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Validate the email is a registered employee
    const { data: emp, error: empErr } = await admin
      .from("user_profiles")
      .select("id, username, email")
      .ilike("email", email)
      .maybeSingle();

    if (empErr) {
      console.error("profile lookup failed:", empErr);
      return json({ error: "Server: " + empErr.message }, 500);
    }

    if (!emp) {
      return json({
        error:
          "That email is not registered as an employee. Ask the shop owner to invite you first.",
      }, 404);
    }

    // Prevent flooding the owner: if there is already a pending request in the
    // last 10 minutes for this email, just reuse it instead of piling more up.
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: existing } = await admin
      .from("password_reset_requests")
      .select("*")
      .eq("email", emp.email)
      .eq("status", "pending")
      .gte("requested_at", tenMinAgo)
      .maybeSingle();

    if (existing) {
      return json({ success: true, request: existing, deduped: true }, 200);
    }

    const { data, error } = await admin
      .from("password_reset_requests")
      .insert({
        email: emp.email,
        employee_id: emp.id,
        employee_name: emp.username || emp.email,
        status: "pending",
      })
      .select()
      .single();

    if (error) {
      console.error("insert failed:", error);
      return json({ error: "Server: " + error.message }, 500);
    }

    return json({ success: true, request: data }, 200);
  } catch (err) {
    console.error("request-password-reset fatal:", err);
    return json({ error: err instanceof Error ? err.message : "Server error" }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
