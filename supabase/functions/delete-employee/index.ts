// Delete an employee's auth.users row + user_profiles row.
// Requires SERVICE_ROLE_KEY. Callable only by authenticated users.
//
// WHY THE DELETE GOES THROUGH SQL
// -------------------------------
// `auth.admin.deleteUser` makes GoTrue LOAD the user row into Go structs first.
// A NULL in any column it scans as a non-pointer (created_at, updated_at,
// raw_app_meta_data, …) aborts that load with "Database error loading user",
// which made the account undeletable. `public.admin_delete_user(uuid)`
// (supabase/migrations/20261028000001_auth_user_repair_v2.sql) removes the
// public rows, the auth child rows and the user itself without a load step, so
// it cannot fail that way. The GoTrue call remains only as a fallback for
// deployments that have not applied that migration yet — and it is preceded by
// a repair, because the same corrupt row is what breaks GoTrue's load.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

// CORS inlined (not imported from `../_shared/cors.ts`) so this file can be
// pasted as a single file into the Supabase Dashboard editor.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
};

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
    // Projects on the new API key system expose JSON dictionaries
    // (SUPABASE_SECRET_KEYS / SUPABASE_PUBLISHABLE_KEYS) instead of the legacy
    // single keys. Reading only the legacy names leaves the keys empty, which
    // made `auth.getUser` fail with 401 for every caller.
    const anonKey = readApiKey(
      "SUPABASE_ANON_KEY",
      "SUPABASE_PUBLISHABLE_KEYS",
      "SUPABASE_PUBLISHABLE_KEY"
    );
    const serviceKey = readApiKey(
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_SECRET_KEYS",
      "SUPABASE_SECRET_KEY"
    );
    if (!supabaseUrl || !serviceKey) {
      console.error("delete-employee: missing Supabase server configuration");
      return json({ error: "Missing Supabase environment configuration" }, 500);
    }

    // Verify caller is authenticated. The service key also works as the client
    // API key if no publishable/anon key is present.
    const client = createClient(supabaseUrl, anonKey || serviceKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userErr,
    } = await client.auth.getUser(token);
    if (userErr || !user) {
      console.error(
        "delete-employee: caller verification failed:",
        userErr?.message ?? "no user returned",
      );
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const userId: string | undefined = body?.userId;
    if (!userId) {
      return json({ error: "userId required" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Delete the auth user FIRST. If this fails we must not have already
    // removed the profile — that is what used to leave an unreachable
    // `auth.users` row behind while the app reported success.
    const { error: authErr } = await admin.rpc("admin_delete_user", {
      p_user_id: userId,
    });

    if (authErr) {
      const fnMissing = /could not find the function|PGRST202|does not exist/i.test(
        authErr.message ?? "",
      );
      if (!fnMissing) {
        throw new Error(`Auth user delete: ${authErr.message}`);
      }

      // Deployment predates the RPC. Repair the auth row first: a NULL or
      // non-object scanned column is exactly what makes GoTrue fail to load
      // (and therefore fail to delete) the user.
      console.warn("admin_delete_user missing, repairing auth row first");
      const repair = await admin.rpc("pixo_repair_auth_user", {
        p_user_id: userId,
        p_confirm: false,
      });
      if (repair.error) {
        console.warn("pixo_repair_auth_user skipped:", repair.error.message);
      }

      // Retry the SQL delete after the repair (covers a project where only the
      // repair function exists, e.g. a partial migration run).
      const retry = await admin.rpc("admin_delete_user", { p_user_id: userId });
      if (retry.error) {
        console.warn("admin_delete_user still missing, falling back to GoTrue");
        const { error: fallbackErr } = await admin.auth.admin.deleteUser(userId);
        if (fallbackErr && !/not found/i.test(fallbackErr.message ?? "")) {
          throw new Error(
            `Auth user delete: ${fallbackErr.message} — apply ` +
              `supabase/migrations/20261028000001_auth_user_repair_v2.sql ` +
              `in the Supabase SQL editor, then try again.`,
          );
        }
      }
    }

    // Auth row is gone, so tenant membership + profile can be removed safely.
    // Both are also deleted inside `admin_delete_user`, so these are
    // idempotent no-ops on a fully migrated project — they exist so a project
    // still on the older function cleans up too. A failure here must be
    // surfaced: leaving `user_profiles` behind keeps the employee visible.
    const { error: memberErr } = await admin
      .from("business_members")
      .delete()
      .eq("user_id", userId);
    if (memberErr) {
      throw new Error(`Membership delete: ${memberErr.message}`);
    }

    const { error: profileErr } = await admin
      .from("user_profiles")
      .delete()
      .eq("id", userId);
    if (profileErr) {
      throw new Error(`Profile delete: ${profileErr.message}`);
    }

    return json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("delete-employee error:", msg);
    return json({ error: msg }, 500);
  }
});

function readApiKey(
  legacyName: string,
  pluralName: string,
  singularName: string
): string {
  const legacy = Deno.env.get(legacyName);
  if (legacy) return legacy;

  const plural = Deno.env.get(pluralName);
  if (plural) {
    try {
      const parsed = JSON.parse(plural);
      const value = parsed?.default ?? Object.values(parsed ?? {})[0];
      if (typeof value === "string" && value) return value;
    } catch {
      // Ignore malformed JSON and fall through to the singular variable.
    }
  }

  return Deno.env.get(singularName) ?? "";
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
