// Evaluate the business notification rules and deliver the results to the
// devices that asked for them.
//
// The rules themselves live in `public.evaluate_notification_rules()` so the
// open app and this scheduled job always agree. This function only adds the
// delivery step: it finds notifications that have not been pushed yet and
// sends them with Web Push.
//
// Callable by the pg_cron job (service role) or by a signed-in user.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

// The CORS headers are INLINED on purpose. A `../_shared/cors.ts` import
// only resolves when the whole `supabase/functions` tree is bundled (the
// CLI). Deploying this function on its own — from the dashboard editor, or
// from a pipeline that uploads a single file — fails with
// "Module not found ../_shared/cors.ts". Keeping the function
// self-contained means it deploys either way.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
};

type NotificationRow = {
  id: string;
  business_id: string;
  user_id: string;
  kind: string;
  severity: string;
  title: string;
  body: string;
  link: string | null;
  created_at: string;
  delivered_at: string | null;
};

type SubscriptionRow = {
  id: string;
  business_id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type PolicyRow = {
  business_id: string;
  kind: string;
  push_enabled: boolean;
  quiet_hours_exempt: boolean;
};

type SettingsRow = {
  business_id: string;
  quiet_hours_enabled: boolean;
  quiet_start: string;
  quiet_end: string;
};

function readApiKey(...names: string[]): string {
  for (const name of names) {
    const value = Deno.env.get(name);
    if (value && value.trim()) return value.trim();
  }
  return "";
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Minutes past midnight for a "HH:MM:SS" / "HH:MM" string. */
function clockMinutes(value: string | null | undefined, fallback: number): number {
  if (!value) return fallback;
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return fallback;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Is the workspace inside its quiet hours right now? */
function withinQuietHours(
  settings: SettingsRow | null,
  timezone: string,
  now: Date,
): boolean {
  if (!settings || !settings.quiet_hours_enabled) return false;
  let local = now;
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    const minutes = (hour % 24) * 60 + minute;
    const start = clockMinutes(settings.quiet_start, 20 * 60);
    const end = clockMinutes(settings.quiet_end, 6 * 60);
    if (start === end) return false;
    if (start < end) return minutes >= start && minutes < end;
    return minutes >= start || minutes < end;
  } catch {
    return false;
  }
}

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
    const anonKey = readApiKey(
      "SUPABASE_ANON_KEY",
      "SUPABASE_PUBLISHABLE_KEYS",
      "SUPABASE_PUBLISHABLE_KEY",
    );
    const serviceKey = readApiKey(
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_SECRET_KEYS",
      "SUPABASE_SECRET_KEY",
    );
    if (!supabaseUrl || !serviceKey) {
      return json({ error: "Missing Supabase environment configuration" }, 500);
    }

    const isServiceCall = token === serviceKey;
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    let businessId: string | null = null;
    if (!isServiceCall) {
      const caller = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const {
        data: { user },
        error: userErr,
      } = await caller.auth.getUser();
      if (userErr || !user) {
        return json({ error: "Invalid or missing session" }, 401);
      }
      const body = await readBody(req);
      businessId = typeof body?.business_id === "string" ? body.business_id : null;
      if (!businessId) {
        const { data: memberships } = await admin
          .from("business_members")
          .select("business_id")
          .eq("user_id", user.id)
          .limit(1);
        businessId = memberships?.[0]?.business_id ?? null;
      }
    }

    // 1. Re-evaluate the rules. The database owns the catalogue, the gate and
    //    the recipients.
    const { error: evalError } = await admin.rpc(
      "evaluate_notification_rules",
      businessId ? { p_business_id: businessId } : {},
    );
    if (evalError) {
      return json({ error: `Rule evaluation failed: ${evalError.message}` }, 500);
    }

    // 2. Collect what still has to be pushed.
    const since = new Date(Date.now() - 10 * 60_000).toISOString();
    let pendingQuery = admin
      .from("notifications")
      .select(
        "id, business_id, user_id, kind, severity, title, body, link, created_at, delivered_at",
      )
      .is("delivered_at", null)
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(500);
    if (businessId) pendingQuery = pendingQuery.eq("business_id", businessId);
    const { data: pending, error: pendingError } = await pendingQuery;
    if (pendingError) {
      return json({ error: `Could not read notifications: ${pendingError.message}` }, 500);
    }

    const rows = (pending || []) as NotificationRow[];
    if (rows.length === 0) {
      return json({ evaluated: true, pushed: 0, skipped: 0 });
    }

    const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
    const { data: subscriptions } = await admin
      .from("push_subscriptions")
      .select("id, business_id, user_id, endpoint, p256dh, auth")
      .in("user_id", userIds);

    const subs = (subscriptions || []) as SubscriptionRow[];
    if (subs.length === 0) {
      // Nothing to push to — but the inbox is already written, so the rows
      // are still "handled" and must not be retried forever.
      await markDelivered(admin, rows.map((r) => r.id));
      return json({ evaluated: true, pushed: 0, skipped: rows.length });
    }

    const { data: policies } = await admin
      .from("notification_policies")
      .select("business_id, kind, push_enabled, quiet_hours_exempt");
    const policyMap = new Map<string, PolicyRow>();
    for (const policy of (policies || []) as PolicyRow[]) {
      policyMap.set(`${policy.business_id}:${policy.kind}`, policy);
    }

    const { data: settings } = await admin
      .from("notification_settings")
      .select("business_id, quiet_hours_enabled, quiet_start, quiet_end");
    const settingsMap = new Map<string, SettingsRow>();
    for (const setting of (settings || []) as SettingsRow[]) {
      settingsMap.set(setting.business_id, setting);
    }

    const { data: timezones } = await admin
      .from("shop_settings")
      .select("business_id, timezone");
    const timezoneMap = new Map<string, string>();
    for (const row of (timezones || []) as { business_id: string; timezone: string }[]) {
      timezoneMap.set(row.business_id, row.timezone || "UTC");
    }

    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";
    if (!vapidPublic || !vapidPrivate) {
      // No push key configured: the inbox still works, the device channel
      // simply cannot be used. Mark nothing as delivered so a later run can
      // pick it up once the key exists.
      return json({
        evaluated: true,
        pushed: 0,
        skipped: rows.length,
        note: "VAPID keys are not configured",
      });
    }

    const webpush = await import("npm:web-push@3.6.7");
    webpush.default.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

    let pushed = 0;
    let skipped = 0;
    const deliveredIds: string[] = [];
    const deadEndpoints: string[] = [];

    for (const row of rows) {
      const policy = policyMap.get(`${row.business_id}:${row.kind}`);
      if (policy && !policy.push_enabled) {
        skipped += 1;
        deliveredIds.push(row.id);
        continue;
      }

      const timezone = timezoneMap.get(row.business_id) || "UTC";
      const quiet = withinQuietHours(settingsMap.get(row.business_id) ?? null, timezone, new Date());
      if (quiet && !(policy?.quiet_hours_exempt ?? false)) {
        // Held back until quiet hours end. It stays undelivered on purpose.
        skipped += 1;
        continue;
      }

      const targets = subs.filter(
        (s) => s.user_id === row.user_id && s.business_id === row.business_id,
      );
      if (targets.length === 0) {
        deliveredIds.push(row.id);
        continue;
      }

      let sent = false;
      for (const target of targets) {
        try {
          await webpush.default.sendNotification(
            {
              endpoint: target.endpoint,
              keys: { p256dh: target.p256dh, auth: target.auth },
            },
            JSON.stringify({
              title: row.title,
              body: row.body,
              link: row.link || "/notifications",
              severity: row.severity,
              tag: row.id,
            }),
          );
          sent = true;
        } catch (error) {
          const status = (error as { statusCode?: number })?.statusCode;
          if (status === 404 || status === 410) {
            deadEndpoints.push(target.endpoint);
          }
        }
      }
      if (sent) {
        pushed += 1;
        deliveredIds.push(row.id);
      }
    }

    if (deadEndpoints.length > 0) {
      await admin.from("push_subscriptions").delete().in("endpoint", deadEndpoints);
    }
    await markDelivered(admin, deliveredIds);

    return json({ evaluated: true, pushed, skipped });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Digest failed" },
      500,
    );
  }
});

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const text = await req.text();
    if (!text) return null;
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function markDelivered(
  admin: ReturnType<typeof createClient>,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  await admin
    .from("notifications")
    .update({ delivered_at: new Date().toISOString() })
    .in("id", ids);
}
