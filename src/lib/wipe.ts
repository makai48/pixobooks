import { supabase } from "./supabase";
import { currentBusinessId } from "./tenant";
import { logAudit } from "./audit";
import { queryClient } from "./appQueryClient";
import { clearPersistedSnapshots } from "./queryPersist";
import type { Employee } from "@/types";
import type { ExportCategory } from "./export";

/**
 * Data wipe.
 *
 * The scopes mirror `EXPORT_CATEGORIES` exactly: anything PixoBooks can export
 * (and therefore re-import) can also be erased, plus an "all app data" option
 * that additionally clears dependent transactional tables which are not part
 * of an export but would otherwise be orphaned (held tickets, bank deposits,
 * daily balancing, quotes, standing orders, debt invoices).
 *
 * Deletion order matters: `client_invoice_payments.invoice_id` is
 * ON DELETE RESTRICT, and most child tables point at `sales`, `items`,
 * `customers` and `suppliers`. Every table is therefore deleted child-first.
 */

export type WipeScopeKey = "all" | ExportCategory;

export type WipeClear = { table: string; column: string };

export type WipeScope = {
  key: WipeScopeKey;
  label: string;
  description: string;
  /** Tables emptied for this scope. Resolved child-first by `wipeTables()`. */
  tables: string[];
  /** Columns reset in place instead of deleting rows (BOMs live on items). */
  clears?: WipeClear[];
  /** Extra explanation shown next to the scope. */
  note?: string;
};

/**
 * Canonical child-first delete order for every business table the app owns.
 * Config tables (`shop_settings`, `branches`, `uoms`, `business_members`, …)
 * are deliberately absent — a data wipe must never lock the owner out.
 */
export const WIPE_TABLE_ORDER = [
  "sale_payments",
  "sales",
  "client_invoice_payments",
  "client_work_entries",
  "client_invoices",
  "client_billing_periods",
  "client_services",
  "client_accounts",
  "quotes",
  "purchase_orders",
  "debt_invoices",
  "standing_orders",
  "stock_adjustments",
  "daily_balancing",
  "bank_deposits",
  "held_tickets",
  "loyalty_transactions",
  "expenses",
  "attendance",
  "items",
  "customers",
  "suppliers",
  "audit_logs",
] as const;

/** Every export category → the stored tables behind it. */
const SCOPE_DEFS: Record<WipeScopeKey, Omit<WipeScope, "key">> = {
  all: {
    label: "All app data",
    description:
      "Every importable dataset: sales, purchases, inventory, BOMs, customers, suppliers, expenses, attendance, loyalty, client billing and the audit log.",
    tables: [...WIPE_TABLE_ORDER],
    note: "Settings, branches, staff accounts and unit conversions are kept.",
  },
  sales: {
    label: "Sales",
    description: "Completed sales with their line items and payment history.",
    tables: ["sale_payments", "sales"],
  },
  purchases: {
    label: "Purchases",
    description: "Purchase orders with their line items and status.",
    tables: ["purchase_orders"],
  },
  inventory: {
    label: "Inventory",
    description: "The full item catalog, including pricing, stock and images.",
    tables: ["stock_adjustments", "items"],
    note: "Stock-adjustment history is cleared with the items.",
  },
  boms: {
    label: "BOQs & BOMs",
    description: "Bill-of-materials attached to items.",
    tables: [],
    clears: [{ table: "items", column: "bom" }],
    note: "Item records themselves are kept — only their BOM is emptied.",
  },
  customers: {
    label: "Customers",
    description: "The customer register with contacts and loyalty balances.",
    tables: ["loyalty_transactions", "customers"],
    note: "Loyalty transactions belong to these customers and are cleared too.",
  },
  suppliers: {
    label: "Suppliers",
    description: "The supplier list with contacts, photos and linked items.",
    tables: ["suppliers"],
  },
  expenses: {
    label: "Expenses",
    description: "Every expense entry, by date and category.",
    tables: ["expenses"],
  },
  financial_statements: {
    label: "Financial statements",
    description: "Daily banking snapshots, bank deposits, and standing orders/loans.",
    tables: ["daily_balancing", "bank_deposits", "standing_orders"],
    note: "The cashbook and P&L are calculated from Sales and Expenses — wipe those separately.",
  },
  employees: {
    label: "Employees",
    description: "Attendance records for the team.",
    tables: ["attendance"],
    note: "Staff accounts, roles and salaries are kept — this only clears attendance.",
  },
  statistics: {
    label: "Statistics",
    description: "Aggregated daily/monthly/annual performance.",
    tables: [],
    note: "Statistics are calculated live from sales and expenses — there is nothing stored to erase. Wipe Sales or Expenses instead.",
  },
  receipts: {
    label: "Receipts & invoices",
    description: "Sale documents with their payment history.",
    tables: ["sale_payments", "sales"],
    note: "Receipts are the sales themselves, so this removes the same rows as Sales.",
  },
  loyalty: {
    label: "Loyalty",
    description: "Loyalty points transactions.",
    tables: ["loyalty_transactions"],
  },
  client_billing: {
    label: "Client Billing",
    description: "Clients, services, work entries, billing periods, invoices and payments.",
    tables: [
      "client_invoice_payments",
      "client_work_entries",
      "client_invoices",
      "client_billing_periods",
      "client_services",
      "client_accounts",
    ],
  },
  audit: {
    label: "Audit log",
    description: "The owner-visible audit trail of who did what, and when.",
    tables: ["audit_logs"],
  },
};

export const WIPE_SCOPES: WipeScope[] = (Object.keys(SCOPE_DEFS) as WipeScopeKey[]).map(
  (key) => ({ key, ...SCOPE_DEFS[key] })
);

export function wipeScope(key: WipeScopeKey): WipeScope {
  return WIPE_SCOPES.find((s) => s.key === key) ?? WIPE_SCOPES[0];
}

/**
 * Tables for a scope, de-duplicated and sorted into the canonical child-first
 * order. `sales` and `receipts` overlap; so does `all` with every scope, and a
 * naive loop would try to delete `sales` twice.
 */
export function wipeTables(scope: WipeScopeKey): string[] {
  const wanted = new Set(wipeScope(scope).tables);
  return WIPE_TABLE_ORDER.filter((table) => wanted.has(table));
}

export type WipeTableOutcome = {
  table: string;
  deleted: number;
  /** True when the table does not exist in this environment (skipped). */
  skipped: boolean;
  error?: string;
};

export type WipeClearOutcome = {
  table: string;
  column: string;
  updated: number;
  skipped: boolean;
  error?: string;
};

export type WipeResult = {
  scope: WipeScopeKey;
  tables: WipeTableOutcome[];
  cleared: WipeClearOutcome[];
  totalDeleted: number;
  errors: string[];
};

type ErrorLike = { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };

function errorText(error: unknown): string {
  if (!error) return "";
  if (error instanceof Error) return error.message;
  const e = error as ErrorLike;
  return [e.message, e.details, e.hint]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ");
}

/**
 * True when PostgREST/Postgres says the table is absent. Optional modules
 * (client billing) may not be installed, and a wipe should skip them instead
 * of aborting halfway through with a confusing error.
 */
export function isMissingTable(error: unknown): boolean {
  const e = error as ErrorLike | null;
  if (e && (e.code === "PGRST205" || e.code === "42P01")) return true;
  return /Could not find the table|relation "public\.[a-z_]+" does not exist/i.test(
    errorText(error)
  );
}

export type WipeActor = Pick<Employee, "id" | "name"> & { role?: string };

/**
 * Permanently delete every row belonging to the active business for the given
 * scope.
 *
 * Refuses to run without an active business: an unscoped `.delete()` would
 * remove rows from every workspace the signed-in user belongs to.
 */
export async function runWipe(
  scope: WipeScopeKey,
  actor?: WipeActor | null
): Promise<WipeResult> {
  const businessId = currentBusinessId();
  if (!businessId) {
    throw new Error(
      "Select a business before wiping data — refusing to delete across every workspace."
    );
  }

  const def = wipeScope(scope);
  const tables = wipeTables(scope);
  const result: WipeResult = {
    scope,
    tables: [],
    cleared: [],
    totalDeleted: 0,
    errors: [],
  };

  for (const table of tables) {
    const { error, count } = await supabase
      .from(table)
      .delete({ count: "exact" })
      .eq("business_id", businessId);

    if (error) {
      if (isMissingTable(error)) {
        result.tables.push({ table, deleted: 0, skipped: true });
        continue;
      }
      const message = errorText(error) || `Could not clear ${table}`;
      result.tables.push({ table, deleted: 0, skipped: false, error: message });
      result.errors.push(`${table}: ${message}`);
      continue;
    }

    const deleted = count ?? 0;
    result.tables.push({ table, deleted, skipped: false });
    result.totalDeleted += deleted;
  }

  for (const clear of def.clears ?? []) {
    const { error, count } = await supabase
      .from(clear.table)
      .update({ [clear.column]: [] }, { count: "exact" })
      .eq("business_id", businessId);

    if (error) {
      if (isMissingTable(error)) {
        result.cleared.push({ ...clear, updated: 0, skipped: true });
        continue;
      }
      const message = errorText(error) || `Could not clear ${clear.table}.${clear.column}`;
      result.cleared.push({ ...clear, updated: 0, skipped: false, error: message });
      result.errors.push(`${clear.table}.${clear.column}: ${message}`);
      continue;
    }

    result.cleared.push({ ...clear, updated: count ?? 0, skipped: false });
  }

  // Rows were deleted outside every mutation hook. Drop the offline snapshots
  // first (so a reload cannot resurrect the deleted rows) and then refetch the
  // mounted screens.
  clearPersistedSnapshots();
  void queryClient.invalidateQueries();

  // Written last, so wiping the audit log still leaves a record of the wipe.
  await logAudit(actor ?? null, "data.wipe", scope, null, {
    tables: result.tables.filter((t) => t.deleted > 0).map((t) => `${t.table}:${t.deleted}`),
    cleared: result.cleared.map((c) => `${c.table}.${c.column}`),
    totalDeleted: result.totalDeleted,
    errors: result.errors.length,
  });

  return result;
}
