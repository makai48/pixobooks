// Delete an employee's auth.users row + user_profiles row.
// Requires SERVICE_ROLE_KEY. Callable only by authenticated users.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }
    const token = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    // Verify caller is authenticated
    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userErr,
    } = await client.auth.getUser(token);
    if (userErr || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const userId: string | undefined = body?.userId;
    if (!userId) {
      return json({ error: "userId required" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Delete profile row first (defensively, in case cascade misfires)
    const { error: profileErr } = await admin
      .from("user_profiles")
      .delete()
      .eq("id", userId);
    if (profileErr) {
      console.warn("profile delete warning:", profileErr.message);
    }

    // Delete auth user (this cascades to user_profiles via FK if still present)
    const { error: authErr } = await admin.auth.admin.deleteUser(userId);
    if (authErr && !authErr.message?.toLowerCase().includes("not found")) {
      throw authErr;
    }

    return json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("delete-employee error:", msg);
    return json({ error: msg }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
