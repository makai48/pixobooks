import { supabase } from "./supabase";
import { download } from "./utils";
import { isMissingBillingTable } from "./clientBillingSchema";
import { currentBusinessId } from "./tenant";

export type ExportCategory =
  | "sales"
  | "purchases"
  | "inventory"
  | "boms"
  | "customers"
  | "suppliers"
  | "expenses"
  | "employees"
  | "statistics"
  | "receipts"
  | "loyalty"
  | "client_billing"
  | "audit";

export const EXPORT_CATEGORIES: {
  key: ExportCategory;
  label: string;
  description: string;
}[] = [
  { key: "sales", label: "Sales", description: "All completed sales with line items and payments." },
  { key: "purchases", label: "Purchases", description: "Purchase orders with line items and status." },
  { key: "inventory", label: "Inventory", description: "Full item catalog with pricing, stock and images." },
  { key: "boms", label: "BOQs & BOMs", description: "Bill-of-materials with vendors and quantities." },
  { key: "customers", label: "Customers", description: "Customer register with contacts and loyalty." },
  { key: "suppliers", label: "Suppliers", description: "Supplier list with contacts, photos and items." },
  { key: "expenses", label: "Expenses", description: "All expense entries by date and category." },
  { key: "employees", label: "Employees", description: "Team members, roles, salaries and permissions." },
  { key: "statistics", label: "Statistics", description: "Aggregated daily/monthly/annual performance." },
  { key: "receipts", label: "Receipts & invoices", description: "Sale documents with payment history." },
{ key: "loyalty", label: "Loyalty", description: "Loyalty points transactions." },
  { key: "client_billing", label: "Client Billing", description: "Clients, work entries, billing periods, invoices, payments and services." },
  { key: "audit", label: "Audit log", description: "Owner-visible audit trail (who did what, when)." },
  ];

async function urlToBase64(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function inlineImages<T extends Record<string, unknown>>(
  rows: T[],
  urlKeys: string[]
): Promise<T[]> {
  return Promise.all(
    rows.map(async (row) => {
      const patch: Record<string, string | null> = {};
      for (const k of urlKeys) {
        const v = row[k];
        if (typeof v === "string" && v) patch[`${k}_base64`] = await urlToBase64(v);
      }
      return { ...row, ...patch };
    })
  );
}

async function tableRows(table: string, order: string) {
  const businessId = currentBusinessId();
  let q = supabase.from(table).select("*").order(order);
  if (businessId) {
    if (table === "user_profiles") {
      const { data: members, error: memErr } = await supabase
        .from("business_members")
        .select("user_id")
        .eq("business_id", businessId);
      if (memErr) throw memErr;
      const ids = (members || []).map((m) => m.user_id as string);
      if (ids.length === 0) return [];
      q = q.in("id", ids);
    } else {
      q = q.eq("business_id", businessId);
    }
  }
  const { data, error } = await q;
  if (error) {
    // Billing tables may not be installed yet; export an empty sheet instead
    // of failing the whole workbook.
    if (isMissingBillingTable(error)) return [];
    throw error;
  }
  return data || [];
}

export async function buildExport(category: ExportCategory): Promise<Record<string, unknown>> {
  switch (category) {
    case "sales": {
      const sales = await tableRows("sales", "created_at");
      const payments = await tableRows("sale_payments", "created_at");
      const bySale = new Map<string, Record<string, unknown>[]>();
      for (const p of payments as Record<string, unknown>[]) {
        const sid = String((p as { sale_id?: unknown }).sale_id ?? "");
        if (!sid) continue;
        const arr = bySale.get(sid) ?? [];
        arr.push(p);
        bySale.set(sid, arr);
      }
      return {
        exportedAt: new Date().toISOString(),
        category,
        count: sales.length,
        rows: (sales as Record<string, unknown>[]).map((s) => ({
          ...s,
          payments: bySale.get(String((s as { id?: unknown }).id ?? "")) ?? [],
        })),
      };
    }
    case "purchases": {
      const rows = await tableRows("purchase_orders", "created_at");
      return { exportedAt: new Date().toISOString(), category, count: rows.length, rows };
    }
    case "inventory": {
      const rows = await tableRows("items", "name");
      const withImages = await inlineImages(rows as Record<string, unknown>[], ["image_url"]);
      return { exportedAt: new Date().toISOString(), category, count: rows.length, rows: withImages };
    }
    case "boms": {
      const items = (await tableRows("items", "name")) as Record<string, unknown>[];
      const rows = items
        .filter((i) => Array.isArray((i as { bom?: unknown }).bom) && ((i as { bom: unknown[] }).bom.length > 0))
        .map((i) => {
          const r = i as { id?: unknown; name?: unknown; sku?: unknown; base_unit?: unknown; suppliers?: unknown; bom?: unknown };
          return {
            item_id: r.id,
            item_name: r.name,
            sku: r.sku,
            base_unit: r.base_unit,
            suppliers: r.suppliers,
            bom: r.bom,
          };
        });
      return { exportedAt: new Date().toISOString(), category, count: rows.length, rows };
    }
    case "customers": {
      const rows = await tableRows("customers", "name");
      const withImages = await inlineImages(rows as Record<string, unknown>[], ["avatar_url"]);
      return { exportedAt: new Date().toISOString(), category, count: rows.length, rows: withImages };
    }
    case "suppliers": {
      const rows = await tableRows("suppliers", "name");
      const withImages = await inlineImages(rows as Record<string, unknown>[], ["avatar_url"]);
      return { exportedAt: new Date().toISOString(), category, count: rows.length, rows: withImages };
    }
    case "expenses": {
      const rows = await tableRows("expenses", "expense_date");
      return { exportedAt: new Date().toISOString(), category, count: rows.length, rows };
    }
    case "employees": {
      const rows = await tableRows("user_profiles", "username");
      const withImages = await inlineImages(rows as Record<string, unknown>[], ["avatar_url"]);
      const attendance = (await tableRows("attendance", "date")) as Record<string, unknown>[];
      return {
        exportedAt: new Date().toISOString(),
        category,
        count: rows.length,
        rows: withImages.map((r) => {
          const rec = r as Record<string, unknown> & { id?: unknown };
          return {
            ...r,
            attendance: attendance.filter((a) => (a as { employee_id?: unknown }).employee_id === rec.id),
          };
        }),
      };
    }
    case "statistics": {
      const sales = (await tableRows("sales", "created_at")) as Record<string, unknown>[];
      const expenses = (await tableRows("expenses", "expense_date")) as Record<string, unknown>[];
      const byDay = bucketBy(sales, (s) => String((s as { created_at?: unknown }).created_at ?? "").slice(0, 10));
      const byMonth = bucketBy(sales, (s) => String((s as { created_at?: unknown }).created_at ?? "").slice(0, 7));
      const byYear = bucketBy(sales, (s) => String((s as { created_at?: unknown }).created_at ?? "").slice(0, 4));
      const expDay = bucketBy(expenses, (e) => String((e as { expense_date?: unknown }).expense_date ?? "").slice(0, 10));
      const expMonth = bucketBy(expenses, (e) => String((e as { expense_date?: unknown }).expense_date ?? "").slice(0, 7));
      return {
        exportedAt: new Date().toISOString(),
        category,
        rollups: {
          salesByDay: summarize(byDay, "total"),
          salesByMonth: summarize(byMonth, "total"),
          salesByYear: summarize(byYear, "total"),
          expensesByDay: summarize(expDay, "amount"),
          expensesByMonth: summarize(expMonth, "amount"),
        },
      };
    }
    case "receipts": {
      const sales = await tableRows("sales", "created_at");
      const settings = await tableRows("shop_settings", "id");
      const logo = (settings[0] as { logo_url?: string | null } | undefined)?.logo_url;
      const logoBase64 = await urlToBase64(logo);
      return {
        exportedAt: new Date().toISOString(),
        category,
        shop: settings[0] || null,
        shopLogoBase64: logoBase64,
        rows: sales,
      };
    }
    case "loyalty": {
      const rows = await tableRows("loyalty_transactions", "created_at");
      return { exportedAt: new Date().toISOString(), category, count: rows.length, rows };
    }
    case "client_billing": {
      const accounts = await tableRows("client_accounts", "name");
      const services = await tableRows("client_services", "name");
      const workEntries = await tableRows("client_work_entries", "work_date");
      const periods = await tableRows("client_billing_periods", "period_start");
      const invoices = await tableRows("client_invoices", "issue_date");
      const payments = await tableRows("client_invoice_payments", "payment_date");
      return {
        exportedAt: new Date().toISOString(),
        category,
        count: accounts.length + services.length + workEntries.length + periods.length + invoices.length + payments.length,
        rows: {
          client_accounts: accounts,
          client_services: services,
          client_work_entries: workEntries,
          client_billing_periods: periods,
          client_invoices: invoices,
          client_invoice_payments: payments,
        },
      };
    }
    case "audit": {
      const rows = await tableRows("audit_logs", "created_at");
      return { exportedAt: new Date().toISOString(), category, count: rows.length, rows };
    }
  }
}

function bucketBy<T>(arr: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of arr) {
    const k = key(x);
    if (!k) continue;
    const list = m.get(k);
    if (list) list.push(x);
    else m.set(k, [x]);
  }
  return m;
}

function summarize(m: Map<string, Record<string, unknown>[]>, numericField: string) {
  const out: Record<string, { count: number; total: number }> = {};
  for (const [k, rows] of m) {
    out[k] = {
      count: rows.length,
      total: rows.reduce((s, r) => s + Number(r[numericField] || 0), 0),
    };
  }
  return out;
}

export async function downloadExport(category: ExportCategory) {
  const payload = await buildExport(category);
  const stamp = new Date().toISOString().slice(0, 10);
  const name = `pixobooks-${category}-${stamp}.json`;
  download(name, JSON.stringify(payload, null, 2), "application/json");
  return payload;
}
