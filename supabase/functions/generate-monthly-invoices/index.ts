// Generate MONTHLY client invoices for a billing period.
// Defaults to the previous month in UTC. Idempotent: a client is skipped
// when a non-cancelled monthly invoice already exists for the period, or
// when there is no validated, unbilled work inside the period.
//
// Callable by an authenticated user, or by the pg_cron job which sends the
// service role key as its bearer token.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { corsHeaders } from "../_shared/cors.ts";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// Mirrors OWNER_EMAIL in src/types/index.ts.
const OWNER_EMAIL = "me.makai48@gmail.com";

type CallerProfile = {
  role?: string | null;
  permissions?: unknown;
  email?: string | null;
};

type BillingPeriod = {
  key: string; // YYYY-MM
  start: string; // YYYY-MM-01
  end: string; // YYYY-MM-DD
  label: string; // "October 2026"
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
    // Projects using the new API key system expose JSON dictionaries
    // (SUPABASE_SECRET_KEYS / SUPABASE_PUBLISHABLE_KEYS) while legacy projects
    // expose single keys. Support both.
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
      return json({ error: "Missing Supabase environment configuration" }, 500);
    }

    // The cron job authenticates with the service role key; everyone else
    // must be a signed-in user.
    const isServiceCall = token === serviceKey;
    if (!isServiceCall) {
      const caller = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const {
        data: { user },
        error: userErr,
      } = await caller.auth.getUser(token);
      if (userErr || !user) {
        return json({ error: "Unauthorized" }, 401);
      }

      // Manual runs are restricted to owners and managers. The pg_cron job
      // authenticates with the service role key and bypasses this check.
      const { data: profile } = await createClient(supabaseUrl, serviceKey)
        .from("user_profiles")
        .select("role, permissions, email")
        .eq("id", user.id)
        .maybeSingle();
      if (!canGenerateInvoices(profile, user.email)) {
        return json(
          { error: "Only owners and managers can generate invoices" },
          403
        );
      }
    }

    const body = await req.json().catch(() => ({}));
    const period = resolvePeriod(body?.period);
    if (!period) {
      return json({ error: "period must be YYYY-MM" }, 400);
    }
    const taxRate = Math.max(0, num(body?.taxRate));
    const otherCharges = Math.max(0, num(body?.otherCharges));

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: clientRows, error: clientErr } = await admin
      .from("client_accounts")
      .select("*")
      .eq("active", true)
      .eq("invoice_generation_mode", "automatic")
      .order("name", { ascending: true });
    if (clientErr) throw clientErr;

    const invoices: Array<{
      id: string;
      client: string;
      number: string;
      total: number;
    }> = [];
    const skipped: Array<{ client: string; reason: string }> = [];
    const errors: Array<{ client: string; error: string }> = [];

    for (const client of clientRows ?? []) {
      try {
        const billingPeriodId = await resolveBillingPeriod(
          admin,
          client,
          period
        );

        const { data: existingInv, error: dupErr } = await admin
          .from("client_invoices")
          .select("id")
          .eq("billing_period_id", billingPeriodId)
          .eq("invoice_type", "monthly")
          .neq("status", "cancelled")
          .maybeSingle();
        if (dupErr) throw dupErr;
        if (existingInv) {
          skipped.push({
            client: client.name,
            reason: "monthly invoice already exists",
          });
          continue;
        }

        const { data: workRows, error: workErr } = await admin
          .from("client_work_entries")
          .select("*")
          .eq("client_id", client.id)
          .eq("status", "unbilled")
          .eq("validated", true)
          .gte("work_date", period.start)
          .lte("work_date", period.end);
        if (workErr) throw workErr;
        if (!workRows || workRows.length === 0) {
          skipped.push({
            client: client.name,
            reason: "no validated unbilled work",
          });
          continue;
        }

        const { breakdown, lines, subtotal, discount } =
          consolidateWork(workRows);
        const taxable = Math.max(0, subtotal + otherCharges);
        const tax = taxable * (taxRate / 100);
        const total = Math.max(0, taxable + tax);
        const workEntryIds = workRows.map((e) => e.id as string);

        const clientSnapshot = {
          id: client.id,
          name: client.name,
          address: client.address,
          branch: client.branch,
          poBox: client.po_box,
          phone: client.phone,
          email: client.email,
          tin: client.tin,
          vat: client.vat,
          contactPersons: Array.isArray(client.contact_persons)
            ? client.contact_persons
            : [],
        };

        const invoice = await insertInvoiceWithNumber(admin, {
          ...(client.business_id ? { business_id: client.business_id } : {}),
          client_id: client.id,
          client_snapshot: clientSnapshot,
          invoice_type: "monthly",
          billing_period_id: billingPeriodId,
          billing_period_label: period.label,
          issue_date: new Date().toISOString().slice(0, 10),
          due_date: null,
          subtotal,
          discount,
          other_charges: otherCharges,
          tax,
          total,
          amount_paid: 0,
          amount_due: total,
          status: "unpaid",
          lines,
          breakdown,
          work_entry_ids: workEntryIds,
          payment_details: client.payment_details || {},
          notes: null,
          created_by: null,
          created_by_name: "System",
        });

        const { error: workUpdErr } = await admin
          .from("client_work_entries")
          .update({
            status: "billed",
            invoice_id: invoice.id,
            updated_at: new Date().toISOString(),
          })
          .in("id", workEntryIds);
        if (workUpdErr) {
          throw new Error(
            `Invoice ${invoice.number} was created but work entries were not marked billed: ${workUpdErr.message}`
          );
        }

        const { error: periodUpdErr } = await admin
          .from("client_billing_periods")
          .update({
            status: "invoiced",
            invoice_id: invoice.id,
            invoice_number: invoice.number,
            work_count: workRows.length,
            total_amount: total,
            updated_at: new Date().toISOString(),
          })
          .eq("id", billingPeriodId);
        if (periodUpdErr) {
          console.warn(
            `billing period update warning (${invoice.number}):`,
            periodUpdErr.message
          );
        }

        const { error: auditErr } = await admin.from("audit_logs").insert({
          ...(client.business_id ? { business_id: client.business_id } : {}),
          actor_id: null,
          actor_name: "System",
          actor_role: null,
          action: "invoice.generate_monthly",
          entity: "client_invoice",
          entity_id: invoice.id,
          meta: {
            client: client.name,
            period: period.label,
            total,
            count: workRows.length,
          },
        });
        if (auditErr) {
          console.warn(`audit warning (${invoice.number}):`, auditErr.message);
        }

        invoices.push({
          id: invoice.id,
          client: client.name,
          number: invoice.number,
          total,
        });
      } catch (err) {
        errors.push({
          client: client.name,
          error: errMessage(err),
        });
      }
    }

    const existingInvoices = await countExistingInvoices(admin, period);
    const periodUnbilled = await countPeriodWork(admin, period, false);
    const periodUnvalidated = await countPeriodWork(admin, period, true);

    return json({
      period: period.key,
      periodLabel: period.label,
      generated: invoices.length,
      skipped: skipped.length,
      existingInvoices,
      periodUnbilled,
      periodUnvalidated,
      invoices,
      skippedClients: skipped,
      errors,
    });
  } catch (err) {
    const msg = errMessage(err);
    console.error("generate-monthly-invoices error:", msg);
    return json({ error: msg }, 500);
  }
});

async function countExistingInvoices(
  // deno-lint-ignore no-explicit-any
  admin: any,
  period: BillingPeriod
): Promise<number> {
  const { count, error } = await admin
    .from("client_invoices")
    .select("id", { count: "exact", head: true })
    .eq("invoice_type", "monthly")
    .eq("billing_period_label", period.label)
    .neq("status", "cancelled");
  if (error) {
    console.warn("existing invoice count warning:", error.message);
    return 0;
  }
  return typeof count === "number" ? count : 0;
}

async function countPeriodWork(
  // deno-lint-ignore no-explicit-any
  admin: any,
  period: BillingPeriod,
  unvalidatedOnly: boolean
): Promise<number> {
  let query = admin
    .from("client_work_entries")
    .select("id", { count: "exact", head: true })
    .eq("status", "unbilled")
    .gte("work_date", period.start)
    .lte("work_date", period.end);
  if (unvalidatedOnly) query = query.eq("validated", false);
  const { count, error } = await query;
  if (error) {
    console.warn("period work count warning:", error.message);
    return 0;
  }
  return typeof count === "number" ? count : 0;
}

async function resolveBillingPeriod(
  // deno-lint-ignore no-explicit-any
  admin: any,
  // deno-lint-ignore no-explicit-any
  client: any,
  period: BillingPeriod
): Promise<string> {
  const { data: existing, error } = await admin
    .from("client_billing_periods")
    .select("id")
    .eq("client_id", client.id)
    .eq("period_start", period.start)
    .maybeSingle();
  if (error) throw error;
  if (existing) return existing.id as string;

  const { data: created, error: insErr } = await admin
    .from("client_billing_periods")
    .insert({
      ...(client.business_id ? { business_id: client.business_id } : {}),
      client_id: client.id,
      client_name: client.name,
      period_start: period.start,
      period_end: period.end,
      period_label: period.label,
      status: "open",
    })
    .select("id")
    .single();
  if (!insErr && created) return created.id as string;

  // Unique (client_id, period_start) may have been created concurrently.
  if (insErr?.code === "23505") {
    const { data: raced } = await admin
      .from("client_billing_periods")
      .select("id")
      .eq("client_id", client.id)
      .eq("period_start", period.start)
      .maybeSingle();
    if (raced) return raced.id as string;
  }

  throw insErr ?? new Error("Failed to create billing period");
}

async function insertInvoiceWithNumber(
  // deno-lint-ignore no-explicit-any
  admin: any,
  // deno-lint-ignore no-explicit-any
  payload: Record<string, any>
  // deno-lint-ignore no-explicit-any
): Promise<any> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const number = generateInvoiceNumber();
    const { data, error } = await admin
      .from("client_invoices")
      .insert({ ...payload, number })
      .select()
      .single();
    if (!error) return data;
    lastError = error;
    if (error.code !== "23505") throw error;
    await new Promise((r) => setTimeout(r, 1100));
  }

  // Extremely unlikely fallback
  const number = generateInvoiceNumber() + randomTwoDigits();
  const { data, error } = await admin
    .from("client_invoices")
    .insert({ ...payload, number })
    .select()
    .single();
  if (error) throw lastError ?? error;
  return data;
}

function generateInvoiceNumber(now = new Date()): string {
  const pad = (v: number) => String(v).padStart(2, "0");
  return (
    String(now.getUTCFullYear() % 100).padStart(2, "0") +
    pad(now.getUTCMonth() + 1) +
    pad(now.getUTCDate()) +
    pad(now.getUTCHours()) +
    pad(now.getUTCMinutes()) +
    pad(now.getUTCSeconds())
  );
}

function randomTwoDigits(): number {
  return Math.floor(Math.random() * 90 + 10);
}

/** Group work entries by officer / service / unit / unit price, mirroring
 *  the client-side consolidateWork helper in src/hooks/useClients.ts. */
// deno-lint-ignore no-explicit-any
function consolidateWork(entries: any[]) {
  type Row = {
    officer: string;
    serviceName: string;
    unit: string | null;
    unitPrice: number;
    qty: number;
    amount: number;
    workEntryIds: string[];
  };

  const groups = new Map<string, Row>();
  let discount = 0;

  for (const e of entries) {
    const officer = String(e.officer || "—").trim();
    const serviceName = String(e.service_name || "");
    const unitPrice = num(e.unit_price);
    const quantity = num(e.quantity);
    const entryDiscount = num(e.discount);

    const key = `${officer}||${serviceName}||${e.unit || ""}||${unitPrice}`;
    const gross = quantity * unitPrice;
    const amount = Math.max(0, gross - entryDiscount);
    discount += entryDiscount;

    const existing = groups.get(key);
    if (existing) {
      existing.qty += quantity;
      existing.amount += amount;
      existing.workEntryIds.push(e.id);
    } else {
      groups.set(key, {
        officer,
        serviceName,
        unit: e.unit || null,
        unitPrice,
        qty: quantity,
        amount,
        workEntryIds: [e.id],
      });
    }
  }

  const breakdown = Array.from(groups.values()).sort(
    (a, b) =>
      a.officer.localeCompare(b.officer) ||
      a.serviceName.localeCompare(b.serviceName)
  );

  const lines = breakdown.map((b) => ({
    officer: b.officer,
    serviceName: b.serviceName,
    qty: b.qty,
    unit: b.unit,
    unitPrice: b.unitPrice,
    discount: 0,
    amount: b.amount,
    workEntryIds: b.workEntryIds,
  }));

  const subtotal = breakdown.reduce((s, r) => s + r.amount, 0);

  return { breakdown, lines, subtotal, discount };
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    const parts = [e.message, e.details, e.hint]
      .filter((p): p is string => typeof p === "string" && p.trim() !== "")
      .join(" — ");
    const code = typeof e.code === "string" ? ` (${e.code})` : "";
    if (parts) return parts + code;
  }
  return "Unknown error";
}

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

function canGenerateInvoices(
  profile: CallerProfile | null,
  userEmail?: string | null
): boolean {
  const role = String(profile?.role ?? "").trim().toLowerCase();
  if (role === "owner") return true;

  const email = String(profile?.email || userEmail || "").trim().toLowerCase();
  if (email && email === OWNER_EMAIL.toLowerCase()) return true;

  const permissions = Array.isArray(profile?.permissions)
    ? profile.permissions
    : [];
  return permissions
    .map((permission) => String(permission).trim().toLowerCase())
    .includes("finance.manage");
}

function resolvePeriod(input: unknown): BillingPeriod | null {
  let year: number;
  let month: number; // 1-12

  if (typeof input === "string" && input.trim() !== "") {
    const match = /^(\d{4})-(\d{2})$/.exec(input.trim());
    if (!match) return null;
    year = Number(match[1]);
    month = Number(match[2]);
    if (month < 1 || month > 12) return null;
  } else {
    const now = new Date();
    const previous = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)
    );
    year = previous.getUTCFullYear();
    month = previous.getUTCMonth() + 1;
  }

  const key = `${year}-${String(month).padStart(2, "0")}`;

  return {
    key,
    start: `${key}-01`,
    end: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10),
    label: `${MONTH_NAMES[month - 1]} ${year}`,
  };
}

function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
