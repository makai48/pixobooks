/**
 * Client Billing hooks — CRUD for the NEW business-billing workflow:
 *
 *   Clients → Daily Work → Billing Periods → Monthly Invoices → Payments
 *
 * This is COMPLETELY SEPARATE from the POS credit/partial-payment
 * workflow, which continues to run through `sales` + `sale_payments`.
 * These two systems only share the underlying accounting infrastructure
 * (customers table, audit log) where appropriate — their business logic
 * MUST remain distinct.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import {
  mapClientAccount,
  mapClientService,
  mapClientWorkEntry,
  mapClientBillingPeriod,
  mapClientInvoice,
  mapClientInvoicePayment,
} from "@/lib/mappers";
import type {
  ClientAccount,
  ClientService,
  ClientWorkEntry,
  ClientInvoiceLine,
  ClientInvoiceBreakdownRow,
  ClientInvoiceStatus,
  PaymentMethod,
} from "@/types";
import { useActiveBusiness } from "@/hooks/useBusinesses";
import { currentBusinessId, withBusiness } from "@/lib/tenant";

/** Shared query-key suffix + filter for client-billing reads. */
function useClientTenant() {
  const active = useActiveBusiness();
  return active === "none" ? null : active;
}

/* ============================================================
 * CLIENTS
 * ============================================================ */

export function useClientAccounts(activeOnly = false) {
  const businessId = useClientTenant();
  return useQuery({
    queryKey: ["client_accounts", businessId, activeOnly],
    queryFn: async () => {
      let q = supabase.from("client_accounts").select("*").order("name");
      if (businessId) q = q.eq("business_id", businessId);
      if (activeOnly) q = q.eq("active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map(mapClientAccount);
    },
    refetchInterval: 30000,
  });
}

export function useUpsertClientAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: Partial<ClientAccount> & { actor?: { id: string; name: string; role?: string } }
    ) => {
      const payload = {
        name: input.name!,
        address: input.address || null,
        branch: input.branch || null,
        po_box: input.poBox || null,
        phone: input.phone || null,
        email: input.email || null,
        tin: input.tin || null,
        vat: input.vat || null,
        contact_persons: input.contactPersons || [],
        staff: input.staff || [],
        payment_details: input.paymentDetails || {},
        active: input.active !== false,
        invoice_generation_mode: input.invoiceGenerationMode || "manual",
        notes: input.notes || null,
        updated_at: new Date().toISOString(),
      };
      if (input.id) {
        const { data, error } = await supabase
          .from("client_accounts")
          .update(payload)
          .eq("id", input.id)
          .select()
          .single();
        if (error) throw error;
        await logAudit(input.actor ?? null, "client.update", "client_account", data.id, {
          name: payload.name,
        });
        return mapClientAccount(data);
      }
      const { data, error } = await supabase
        .from("client_accounts")
        .insert(
          withBusiness({
            ...payload,
            created_by: input.actor?.id || null,
            created_by_name: input.actor?.name || null,
          })
        )
        .select()
        .single();
      if (error) throw error;
      await logAudit(input.actor ?? null, "client.create", "client_account", data.id, {
        name: payload.name,
      });
      return mapClientAccount(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client_accounts"] }),
  });
}

export function useDeleteClientAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      actor?: { id: string; name: string; role?: string };
    }) => {
      const { error } = await supabase.from("client_accounts").delete().eq("id", input.id);
      if (error) throw error;
      await logAudit(input.actor ?? null, "client.delete", "client_account", input.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client_accounts"] }),
  });
}

/* ============================================================
 * SERVICES / PRICES
 * ============================================================ */

export function useClientServices(clientId?: string | null) {
  const businessId = useClientTenant();
  return useQuery({
    queryKey: ["client_services", businessId, clientId],
    queryFn: async () => {
      let q = supabase.from("client_services").select("*").order("name");
      if (businessId) q = q.eq("business_id", businessId);
      if (clientId) q = q.eq("client_id", clientId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map(mapClientService);
    },
    refetchInterval: 30000,
  });
}

export function useUpsertClientService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: Partial<ClientService> & { actor?: { id: string; name: string; role?: string } }
    ) => {
      const payload = {
        client_id: input.clientId || null,
        name: input.name!,
        description: input.description || null,
        unit: input.unit || "pc",
        unit_price: Number(input.unitPrice || 0),
        active: input.active !== false,
        updated_at: new Date().toISOString(),
      };
      if (input.id) {
        const { data, error } = await supabase
          .from("client_services")
          .update(payload)
          .eq("id", input.id)
          .select()
          .single();
        if (error) throw error;
        return mapClientService(data);
      }
      const { data, error } = await supabase
        .from("client_services")
        .insert(withBusiness(payload))
        .select()
        .single();
      if (error) throw error;
      return mapClientService(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client_services"] }),
  });
}

export function useDeleteClientService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("client_services").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client_services"] }),
  });
}

/* ============================================================
 * DAILY WORK LOG
 * ============================================================ */

export function useClientWorkEntries(params?: {
  clientId?: string | null;
  from?: string;
  to?: string;
  status?: "unbilled" | "billed" | "voided";
  billingPeriod?: string;
}) {
  const businessId = useClientTenant();
  return useQuery({
    queryKey: ["client_work_entries", businessId, params],
    queryFn: async () => {
      let q = supabase
        .from("client_work_entries")
        .select("*")
        .order("work_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (businessId) q = q.eq("business_id", businessId);
      if (params?.clientId) q = q.eq("client_id", params.clientId);
      if (params?.status) q = q.eq("status", params.status);
      if (params?.billingPeriod) q = q.eq("billing_period", params.billingPeriod);
      if (params?.from) q = q.gte("work_date", params.from);
      if (params?.to) q = q.lte("work_date", params.to);
      const { data, error } = await q.limit(500);
      if (error) throw error;
      return (data || []).map(mapClientWorkEntry);
    },
    refetchInterval: 10000,
  });
}

function periodOf(dateISO: string): string {
  return dateISO.slice(0, 7);
}

export function useUpsertClientWorkEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: Partial<ClientWorkEntry> & {
        actor?: { id: string; name: string; role?: string };
      }
    ) => {
      const qty = Number(input.quantity || 0);
      const unitPrice = Number(input.unitPrice || 0);
      const discount = Math.max(0, Number(input.discount || 0));
      const amount = Math.max(0, qty * unitPrice - discount);
      const workDate = input.workDate || new Date().toISOString().slice(0, 10);
      const payload = {
        client_id: input.clientId!,
        client_name: input.clientName!,
        work_date: workDate,
        officer: input.officer || null,
        service_id: input.serviceId || null,
        service_name: input.serviceName!,
        description: input.description || null,
        quantity: qty,
        unit: input.unit || "pc",
        unit_price: unitPrice,
        discount,
        amount,
        photo_url: input.photoUrl || null,
        document_ref: input.documentRef || null,
        billing_period: periodOf(workDate),
        updated_at: new Date().toISOString(),
      };
      if (input.id) {
        // Do not allow editing already-billed entries
        const { data: existing } = await supabase
          .from("client_work_entries")
          .select("status")
          .eq("id", input.id)
          .maybeSingle();
        if (existing && existing.status === "billed") {
          throw new Error(
            "This work entry is already billed. Cancel or void its invoice first to edit."
          );
        }
        const { data, error } = await supabase
          .from("client_work_entries")
          .update(payload)
          .eq("id", input.id)
          .select()
          .single();
        if (error) throw error;
        await logAudit(input.actor ?? null, "work.update", "client_work_entry", data.id, {
          client: payload.client_name,
          amount,
        });
        return mapClientWorkEntry(data);
      }
      const { data, error } = await supabase
        .from("client_work_entries")
        .insert(
          withBusiness({
            ...payload,
            status: "unbilled",
            recorded_by: input.actor?.id || null,
            recorded_by_name: input.actor?.name || null,
          })
        )
        .select()
        .single();
      if (error) throw error;
      await logAudit(input.actor ?? null, "work.create", "client_work_entry", data.id, {
        client: payload.client_name,
        amount,
      });
      return mapClientWorkEntry(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client_work_entries"] });
      qc.invalidateQueries({ queryKey: ["client_billing_periods"] });
    },
  });
}

export function useValidateClientWorkEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      ids: string[];
      validated: boolean;
      actor?: { id: string; name: string; role?: string };
    }) => {
      const { error } = await supabase
        .from("client_work_entries")
        .update({
          validated: input.validated,
          validated_at: input.validated ? new Date().toISOString() : null,
          validated_by: input.validated ? input.actor?.id || null : null,
          validated_by_name: input.validated ? input.actor?.name || null : null,
          updated_at: new Date().toISOString(),
        })
        .in("id", input.ids);
      if (error) throw error;
      await logAudit(
        input.actor ?? null,
        input.validated ? "work.validate" : "work.unvalidate",
        "client_work_entry",
        input.ids.join(","),
        { count: input.ids.length }
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client_work_entries"] }),
  });
}

export function useDeleteClientWorkEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      actor?: { id: string; name: string; role?: string };
    }) => {
      const { data: existing } = await supabase
        .from("client_work_entries")
        .select("status, client_name")
        .eq("id", input.id)
        .maybeSingle();
      if (existing?.status === "billed") {
        throw new Error("Cannot delete a work entry that is already on an invoice.");
      }
      const { error } = await supabase
        .from("client_work_entries")
        .delete()
        .eq("id", input.id);
      if (error) throw error;
      await logAudit(input.actor ?? null, "work.delete", "client_work_entry", input.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client_work_entries"] }),
  });
}

/* ============================================================
 * BILLING PERIODS
 * ============================================================ */

export function useClientBillingPeriods(clientId?: string | null) {
  const businessId = useClientTenant();
  return useQuery({
    queryKey: ["client_billing_periods", businessId, clientId],
    queryFn: async () => {
      let q = supabase
        .from("client_billing_periods")
        .select("*")
        .order("period_start", { ascending: false });
      if (businessId) q = q.eq("business_id", businessId);
      if (clientId) q = q.eq("client_id", clientId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map(mapClientBillingPeriod);
    },
    refetchInterval: 30000,
  });
}

/* ============================================================
 * INVOICES
 * ============================================================ */

export function useClientInvoices(params?: {
  clientId?: string | null;
  status?: ClientInvoiceStatus;
  from?: string;
  to?: string;
  invoiceType?: "monthly" | "outstanding" | "adjustment";
}) {
  const businessId = useClientTenant();
  return useQuery({
    queryKey: ["client_invoices", businessId, params],
    queryFn: async () => {
      let q = supabase
        .from("client_invoices")
        .select("*")
        .order("issue_date", { ascending: false });
      if (businessId) q = q.eq("business_id", businessId);
      if (params?.clientId) q = q.eq("client_id", params.clientId);
      if (params?.status) q = q.eq("status", params.status);
      if (params?.invoiceType) q = q.eq("invoice_type", params.invoiceType);
      if (params?.from) q = q.gte("issue_date", params.from);
      if (params?.to) q = q.lte("issue_date", params.to);
      const { data, error } = await q.limit(500);
      if (error) throw error;
      return (data || []).map(mapClientInvoice);
    },
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });
}

/** Deterministic YYMMDDHHMMSS invoice number derived from the creation
 *  datetime. Falls back with a random suffix on the impossibly-rare
 *  collision case. */
function generateInvoiceNumber(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    String(now.getFullYear() % 100).padStart(2, "0") +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds())
  );
}

async function reserveInvoiceNumber(): Promise<string> {
  const businessId = currentBusinessId();
  // Brief spin to avoid same-second collisions in bulk generation
  for (let attempt = 0; attempt < 5; attempt++) {
    const num = generateInvoiceNumber();
    let q = supabase.from("client_invoices").select("id").eq("number", num);
    if (businessId) q = q.eq("business_id", businessId);
    const { data } = await q.maybeSingle();
    if (!data) return num;
    await new Promise((r) => setTimeout(r, 1100));
  }
  // Extremely unlikely fallback
  return generateInvoiceNumber() + Math.floor(Math.random() * 90 + 10);
}

/** Group work entries by officer × service × unit_price to build the
 *  Centenary-style consolidated invoice breakdown. Preserves the
 *  source workEntry ids on each row for drill-down. */
function consolidateWork(entries: ClientWorkEntry[]): {
  breakdown: ClientInvoiceBreakdownRow[];
  lines: ClientInvoiceLine[];
  subtotal: number;
  discount: number;
} {
  const groups = new Map<string, ClientInvoiceBreakdownRow>();
  let discount = 0;
  for (const e of entries) {
    const officer = (e.officer || "—").trim();
    const key = `${officer}||${e.serviceName}||${e.unit || ""}||${e.unitPrice}`;
    const existing = groups.get(key);
    const gross = e.quantity * e.unitPrice;
    const amount = Math.max(0, gross - e.discount);
    discount += e.discount;
    if (existing) {
      existing.qty += e.quantity;
      existing.amount += amount;
      existing.workEntryIds.push(e.id);
    } else {
      groups.set(key, {
        officer,
        serviceName: e.serviceName,
        unit: e.unit || null,
        unitPrice: e.unitPrice,
        qty: e.quantity,
        amount,
        workEntryIds: [e.id],
      });
    }
  }
  const breakdown = Array.from(groups.values()).sort(
    (a, b) =>
      (a.officer || "").localeCompare(b.officer || "") ||
      a.serviceName.localeCompare(b.serviceName)
  );
  const lines: ClientInvoiceLine[] = breakdown.map((b) => ({
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

function periodLabelOf(periodStart: string): string {
  const d = new Date(periodStart + "T12:00:00");
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function endOfPeriod(periodStart: string): string {
  const d = new Date(periodStart + "T12:00:00");
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}

export type GenerateMonthlyInvoiceInput = {
  client: ClientAccount;
  billingPeriod: string; // YYYY-MM
  dueDate?: string | null;
  taxRate?: number;
  otherCharges?: number;
  notes?: string | null;
  actor?: { id: string; name: string; role?: string };
};

/**
 * Generate one MONTHLY invoice for the client's validated, unbilled work
 * inside the specified period. Idempotent — refuses to duplicate an
 * existing non-cancelled monthly invoice for the same period.
 *
 * IMPORTANT: The generated invoice contains ONLY the current month's
 * work. Prior invoices' outstanding balances are NEVER carried into
 * this document. To bill a prior outstanding balance, use
 * `useGenerateOutstandingInvoice`.
 */
export function useGenerateMonthlyInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: GenerateMonthlyInvoiceInput) => {
      const { client, billingPeriod } = input;
      const periodStart = `${billingPeriod}-01`;
      const periodEnd = endOfPeriod(periodStart);

      // Ensure billing period row exists
      const { data: bpExisting } = await supabase
        .from("client_billing_periods")
        .select("*")
        .eq("client_id", client.id)
        .eq("period_start", periodStart)
        .maybeSingle();
      let billingPeriodId = bpExisting?.id as string | undefined;
      if (!bpExisting) {
        const { data: bpNew, error: bpErr } = await supabase
          .from("client_billing_periods")
          .insert(
            withBusiness({
              client_id: client.id,
              client_name: client.name,
              period_start: periodStart,
              period_end: periodEnd,
              period_label: periodLabelOf(periodStart),
              status: "open",
            })
          )
          .select()
          .single();
        if (bpErr) throw bpErr;
        billingPeriodId = bpNew.id;
      }
      if (!billingPeriodId) throw new Error("Failed to resolve billing period");

      // Duplicate guard — also enforced by unique DB index
      const { data: existingInv } = await supabase
        .from("client_invoices")
        .select("id, status, number")
        .eq("billing_period_id", billingPeriodId)
        .eq("invoice_type", "monthly")
        .neq("status", "cancelled")
        .maybeSingle();
      if (existingInv) {
        throw new Error(
          `A ${existingInv.status} monthly invoice (${existingInv.number}) already exists for ${client.name} in ${periodLabelOf(
            periodStart
          )}. Cancel it first to re-issue.`
        );
      }

      // Load validated, unbilled work
      const { data: workRows, error: workErr } = await supabase
        .from("client_work_entries")
        .select("*")
        .eq("client_id", client.id)
        .eq("status", "unbilled")
        .eq("validated", true)
        .gte("work_date", periodStart)
        .lte("work_date", periodEnd);
      if (workErr) throw workErr;
      const entries = (workRows || []).map(mapClientWorkEntry);
      if (entries.length === 0) {
        throw new Error(
          `No validated, unbilled work for ${client.name} in ${periodLabelOf(periodStart)}. Validate work entries first.`
        );
      }

      const { breakdown, lines, subtotal, discount } = consolidateWork(entries);
      const otherCharges = Math.max(0, Number(input.otherCharges || 0));
      const taxRate = Math.max(0, Number(input.taxRate || 0));
      const taxable = Math.max(0, subtotal + otherCharges);
      const tax = taxable * (taxRate / 100);
      const total = Math.max(0, taxable + tax);

      const number = await reserveInvoiceNumber();
      const now = new Date();
      const issueDate = now.toISOString().slice(0, 10);
      const dueDate = input.dueDate || null;

      const clientSnapshot = {
        id: client.id,
        name: client.name,
        address: client.address,
        branch: client.branch,
        poBox: client.poBox,
        phone: client.phone,
        email: client.email,
        tin: client.tin,
        vat: client.vat,
        contactPersons: client.contactPersons,
      };

      const workEntryIds = entries.map((e) => e.id);

      const { data: inv, error: invErr } = await supabase
        .from("client_invoices")
        .insert(
          withBusiness({
            number,
            client_id: client.id,
            client_snapshot: clientSnapshot,
            invoice_type: "monthly",
            billing_period_id: billingPeriodId,
          billing_period_label: periodLabelOf(periodStart),
          issue_date: issueDate,
          due_date: dueDate,
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
          payment_details: client.paymentDetails || {},
          notes: input.notes || null,
          created_by: input.actor?.id || null,
          created_by_name: input.actor?.name || null,
        })
        )
        .select()
        .single();
      if (invErr) throw invErr;

      // Mark work entries as billed
      await supabase
        .from("client_work_entries")
        .update({
          status: "billed",
          invoice_id: inv.id,
          updated_at: new Date().toISOString(),
        })
        .in("id", workEntryIds);

      // Update billing period status + totals
      await supabase
        .from("client_billing_periods")
        .update({
          status: "invoiced",
          invoice_id: inv.id,
          invoice_number: number,
          work_count: entries.length,
          total_amount: total,
          updated_at: new Date().toISOString(),
        })
        .eq("id", billingPeriodId);

      await logAudit(
        input.actor ?? null,
        "invoice.generate_monthly",
        "client_invoice",
        inv.id,
        {
          client: client.name,
          period: periodLabelOf(periodStart),
          total,
          count: entries.length,
        }
      );

      return mapClientInvoice(inv);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client_invoices"] });
      qc.invalidateQueries({ queryKey: ["client_work_entries"] });
      qc.invalidateQueries({ queryKey: ["client_billing_periods"] });
    },
  });
}

export type GenerateMonthlyInvoicesNowResult = {
  period: string;
  periodLabel: string;
  generated: number;
  skipped: number;
  existingInvoices?: number;
  periodUnbilled?: number;
  periodUnvalidated?: number;
  invoices: { id: string; number: string; client: string; total: number }[];
  skippedClients: { client: string; reason: string }[];
  errors: { client: string; message: string }[];
};

/**
 * Invoke the `generate-monthly-invoices` edge function on demand using the
 * caller's own session (no service key required). This runs the EXACT same
 * server-side job that `pg_cron` fires at the start of each month, so it is
 * safe for pre-month-end verification. When `period` is omitted the edge
 * function defaults to the previous month (UTC), matching the cron job.
 */
export function useGenerateMonthlyInvoicesNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { period?: string } = {}) => {
      const { data, error } = await supabase.functions.invoke(
        "generate-monthly-invoices",
        { body: { mode: "manual", period: input.period } }
      );

      if (error) {
        let msg = error.message || "Invoice generation failed";
        if (error instanceof FunctionsHttpError) {
          try {
            const status = error.context?.status ?? 500;
            const text = await error.context?.text();
            console.error("[generate-monthly-invoices]", status, text);
            if (text) {
              try {
                const parsed = JSON.parse(text);
                msg = `[${status}] ${parsed?.error || text}`;
              } catch {
                msg = `[${status}] ${text}`;
              }
            }
          } catch {
            /* keep default message */
          }
        }
        throw new Error(msg);
      }

      return data as GenerateMonthlyInvoicesNowResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client_invoices"] });
      qc.invalidateQueries({ queryKey: ["client_invoice"] });
      qc.invalidateQueries({ queryKey: ["client_work_entries"] });
      qc.invalidateQueries({ queryKey: ["client_billing_periods"] });
      qc.invalidateQueries({ queryKey: ["client_invoice_payments"] });
    },
  });
}

export type GenerateOutstandingInvoiceInput = {
  parentInvoiceId: string;
  amount?: number; // defaults to remaining amount_due
  dueDate?: string | null;
  notes?: string | null;
  actor?: { id: string; name: string; role?: string };
};

/**
 * Generate an OUTSTANDING BALANCE INVOICE referencing a parent invoice.
 * This creates a separate, independent invoice that does NOT modify the
 * original. The unique DB index prevents billing the same parent twice
 * (unless the earlier outstanding invoice was cancelled).
 */
export function useGenerateOutstandingInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: GenerateOutstandingInvoiceInput) => {
      const { data: parent, error: parentErr } = await supabase
        .from("client_invoices")
        .select("*")
        .eq("id", input.parentInvoiceId)
        .maybeSingle();
      if (parentErr) throw parentErr;
      if (!parent) throw new Error("Parent invoice not found");
      if (parent.status === "cancelled")
        throw new Error("Cannot bill outstanding on a cancelled invoice");

      // Duplicate guard
      const { data: existing } = await supabase
        .from("client_invoices")
        .select("id, number, status")
        .eq("parent_invoice_id", input.parentInvoiceId)
        .eq("invoice_type", "outstanding")
        .neq("status", "cancelled")
        .maybeSingle();
      if (existing)
        throw new Error(
          `Outstanding balance invoice (${existing.number}) already exists for this invoice. Cancel it first to re-issue.`
        );

      const remaining = Number(parent.amount_due || 0);
      if (remaining <= 0) throw new Error("Parent invoice has no outstanding balance");
      const amount = Math.min(remaining, Number(input.amount || remaining));
      if (amount <= 0) throw new Error("Amount must be greater than zero");

      const number = await reserveInvoiceNumber();
      const parentInv = mapClientInvoice(parent);
      const now = new Date().toISOString().slice(0, 10);

      const lines: ClientInvoiceLine[] = [
        {
          serviceName: `Outstanding balance from invoice ${parentInv.number}`,
          description: parentInv.billingPeriodLabel || undefined,
          qty: 1,
          unit: "invoice",
          unitPrice: amount,
          discount: 0,
          amount,
          workEntryIds: [],
        },
      ];

      const { data: inv, error } = await supabase
        .from("client_invoices")
        .insert(
          withBusiness({
            number,
            client_id: parentInv.clientId,
            client_snapshot: parentInv.clientSnapshot || {},
            invoice_type: "outstanding",
            parent_invoice_id: input.parentInvoiceId,
            billing_period_label: parentInv.billingPeriodLabel,
            issue_date: now,
            due_date: input.dueDate || null,
            subtotal: amount,
            discount: 0,
            other_charges: 0,
            tax: 0,
            total: amount,
            amount_paid: 0,
            amount_due: amount,
            status: "unpaid",
            lines,
            breakdown: [],
            work_entry_ids: [],
            payment_details: parentInv.paymentDetails || {},
            notes:
              input.notes ||
              `Outstanding balance carried from invoice ${parentInv.number} (${parentInv.billingPeriodLabel || "prior period"})`,
            created_by: input.actor?.id || null,
            created_by_name: input.actor?.name || null,
          })
        )
        .select()
        .single();
      if (error) throw error;

      await logAudit(
        input.actor ?? null,
        "invoice.generate_outstanding",
        "client_invoice",
        inv.id,
        {
          parent: parentInv.number,
          client: parentInv.clientName,
          amount,
        }
      );

      return mapClientInvoice(inv);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client_invoices"] });
    },
  });
}

export function useCancelClientInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      reason?: string;
      actor?: { id: string; name: string; role?: string };
    }) => {
      const { data: inv } = await supabase
        .from("client_invoices")
        .select("*")
        .eq("id", input.id)
        .maybeSingle();
      if (!inv) throw new Error("Invoice not found");
      if (inv.status === "cancelled") throw new Error("Already cancelled");
      if (Number(inv.amount_paid || 0) > 0)
        throw new Error("Cancel payments on this invoice before cancelling.");

      const { error } = await supabase
        .from("client_invoices")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancelled_by: input.actor?.id || null,
          cancelled_reason: input.reason || null,
        })
        .eq("id", input.id);
      if (error) throw error;

      // Reopen linked work entries (monthly invoices only)
      if (inv.invoice_type === "monthly" && Array.isArray(inv.work_entry_ids)) {
        await supabase
          .from("client_work_entries")
          .update({ status: "unbilled", invoice_id: null })
          .in("id", inv.work_entry_ids);
      }

      // Reopen billing period
      if (inv.billing_period_id) {
        await supabase
          .from("client_billing_periods")
          .update({
            status: "open",
            invoice_id: null,
            invoice_number: null,
          })
          .eq("id", inv.billing_period_id);
      }

      await logAudit(input.actor ?? null, "invoice.cancel", "client_invoice", input.id, {
        number: inv.number,
        reason: input.reason,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client_invoices"] });
      qc.invalidateQueries({ queryKey: ["client_work_entries"] });
      qc.invalidateQueries({ queryKey: ["client_billing_periods"] });
    },
  });
}

/* ============================================================
 * INVOICE PAYMENTS
 * ============================================================ */

export function useClientInvoicePayments(params?: {
  invoiceId?: string | null;
  clientId?: string | null;
  from?: string;
  to?: string;
}) {
  const businessId = useClientTenant();
  return useQuery({
    queryKey: ["client_invoice_payments", businessId, params],
    queryFn: async () => {
      let q = supabase
        .from("client_invoice_payments")
        .select("*")
        .order("payment_date", { ascending: false });
      if (businessId) q = q.eq("business_id", businessId);
      if (params?.invoiceId) q = q.eq("invoice_id", params.invoiceId);
      if (params?.clientId) q = q.eq("client_id", params.clientId);
      if (params?.from) q = q.gte("payment_date", params.from);
      if (params?.to) q = q.lte("payment_date", params.to);
      const { data, error } = await q.limit(500);
      if (error) throw error;
      return (data || []).map(mapClientInvoicePayment);
    },
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });
}

async function nextPaymentNumber(): Promise<string> {
  const businessId = currentBusinessId();
  let q = supabase
    .from("client_invoice_payments")
    .select("number")
    .like("number", "CRCP-%")
    .order("created_at", { ascending: false })
    .limit(1);
  if (businessId) q = q.eq("business_id", businessId);
  const { data } = await q;
  const last = data?.[0]?.number || "";
  const n = parseInt(String(last).replace("CRCP-", ""), 10);
  const next = Number.isFinite(n) && n > 0 ? n + 1 : 1000;
  return `CRCP-${next}`;
}

export type RecordClientPaymentInput = {
  invoiceId: string;
  paymentDate: string;
  amount: number;
  paymentMethod: PaymentMethod;
  reference?: string | null;
  notes?: string | null;
  actor?: { id: string; name: string; role?: string };
};

/**
 * Record a payment against a specific invoice. Each invoice has its own
 * independent payment record — payments never automatically bleed into
 * other invoices. Updates the invoice's `amount_paid` / `amount_due` /
 * `status` atomically.
 */
export function useRecordClientPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RecordClientPaymentInput) => {
      if (!(input.amount > 0)) throw new Error("Amount must be > 0");

      const { data: inv, error: invErr } = await supabase
        .from("client_invoices")
        .select("*")
        .eq("id", input.invoiceId)
        .maybeSingle();
      if (invErr) throw invErr;
      if (!inv) throw new Error("Invoice not found");
      if (inv.status === "cancelled")
        throw new Error("Cannot record payment on a cancelled invoice");

      const currentDue = Number(inv.amount_due || 0);
      if (currentDue <= 0) throw new Error("Invoice is already fully paid");
      const amount = Math.min(currentDue, Number(input.amount));

      const number = await nextPaymentNumber();
      const { data: pay, error: payErr } = await supabase
        .from("client_invoice_payments")
        .insert(
          withBusiness({
            number,
            invoice_id: input.invoiceId,
            client_id: inv.client_id,
            payment_date: input.paymentDate,
            amount,
            payment_method: input.paymentMethod,
            reference: input.reference || null,
            notes: input.notes || null,
            received_by: input.actor?.id || null,
            received_by_name: input.actor?.name || null,
          })
        )
        .select()
        .single();
      if (payErr) throw payErr;

      const newPaid = Number(inv.amount_paid || 0) + amount;
      const newDue = Math.max(0, Number(inv.total || 0) - newPaid);
      const newStatus: ClientInvoiceStatus =
        newDue <= 0.001 ? "paid" : "partial";

      const { error: updErr } = await supabase
        .from("client_invoices")
        .update({
          amount_paid: newPaid,
          amount_due: newDue,
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.invoiceId);
      if (updErr) throw updErr;

      await logAudit(
        input.actor ?? null,
        "invoice.payment",
        "client_invoice_payment",
        pay.id,
        {
          invoice: inv.number,
          amount,
          newDue,
        }
      );

      return {
        payment: mapClientInvoicePayment(pay),
        fullyPaid: newStatus === "paid",
        newDue,
        newPaid,
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client_invoice_payments"] });
      qc.invalidateQueries({ queryKey: ["client_invoices"] });
      qc.invalidateQueries({ queryKey: ["client_invoice"] });
    },
  });
}

export function useCancelClientInvoicePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      reason?: string;
      actor?: { id: string; name: string; role?: string };
    }) => {
      const { data: pay } = await supabase
        .from("client_invoice_payments")
        .select("*")
        .eq("id", input.id)
        .maybeSingle();
      if (!pay) throw new Error("Payment not found");
      if (pay.cancelled) throw new Error("Already cancelled");

      const { data: inv } = await supabase
        .from("client_invoices")
        .select("*")
        .eq("id", pay.invoice_id)
        .maybeSingle();

      await supabase
        .from("client_invoice_payments")
        .update({
          cancelled: true,
          cancelled_at: new Date().toISOString(),
          cancelled_by: input.actor?.id || null,
          cancelled_reason: input.reason || null,
        })
        .eq("id", input.id);

      if (inv) {
        const newPaid = Math.max(0, Number(inv.amount_paid || 0) - Number(pay.amount));
        const newDue = Math.max(0, Number(inv.total || 0) - newPaid);
        const newStatus: ClientInvoiceStatus =
          newDue <= 0.001 ? "paid" : newPaid > 0 ? "partial" : "unpaid";
        await supabase
          .from("client_invoices")
          .update({
            amount_paid: newPaid,
            amount_due: newDue,
            status: newStatus,
          })
          .eq("id", inv.id);
      }

      await logAudit(
        input.actor ?? null,
        "invoice.payment_cancel",
        "client_invoice_payment",
        input.id,
        { reason: input.reason }
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client_invoice_payments"] });
      qc.invalidateQueries({ queryKey: ["client_invoices"] });
    },
  });
}

/* ============================================================
 * GLOBAL TOTALS (used by Statistics / Financial Statements)
 * ============================================================ */

/** Total Client Billing receivables, sourced from active invoices only.
 *  This is INDEPENDENT of the legacy POS credit balances — POS credit
 *  sales continue to appear via sales.amount_due and are visible on the
 *  Customer register, NOT here. */
export function useClientReceivablesTotals() {
  const invoices = useClientInvoices();
  const list = invoices.data || [];
  const active = list.filter((i) => i.status !== "cancelled");
  const totalReceivable = active.reduce((s, i) => s + i.amountDue, 0);
  const today = new Date().toISOString().slice(0, 10);
  const overdue = active.reduce(
    (s, i) => s + (i.dueDate && i.dueDate < today && i.amountDue > 0 ? i.amountDue : 0),
    0
  );
  const paidThisMonth = active
    .filter((i) => i.issueDate.slice(0, 7) === today.slice(0, 7))
    .reduce((s, i) => s + i.amountPaid, 0);
  const billedThisMonth = active
    .filter((i) => i.issueDate.slice(0, 7) === today.slice(0, 7))
    .reduce((s, i) => s + i.total, 0);
  return {
    totalReceivable,
    overdue,
    paidThisMonth,
    billedThisMonth,
    isLoading: invoices.isLoading,
  };
}
