import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Wipe engine coverage.
 *
 * The dangerous part of "delete all data" is ordering: payments must go before
 * invoices (ON DELETE RESTRICT), children before `sales` / `items` /
 * `customers`, and the wipe must never touch config tables. These tests pin the
 * order, the business scoping, the missing-table fallback and the cache reset.
 */

type MockFn = ReturnType<typeof vi.fn<(...args: any[]) => any>>;

let bizId: string | null = "biz-1";

const deleteFn: MockFn = vi.fn();
const updateFn: MockFn = vi.fn();
const fromCalls: string[] = [];
/** Per-table response returned by the `.eq()` terminator. */
const responses: Record<string, { count?: number | null; error?: unknown }> = {};

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => {
      fromCalls.push(table);
      const eq = (column: string, value: unknown) => {
        expect(column).toBe("business_id");
        expect(value).toBe("biz-1");
        return Promise.resolve(responses[table] ?? { count: 0, error: null });
      };
      return {
        delete: (opts: unknown) => {
          deleteFn(table, opts);
          return { eq };
        },
        update: (patch: unknown, opts: unknown) => {
          updateFn(table, patch, opts);
          return { eq };
        },
      };
    },
  },
}));

vi.mock("@/lib/tenant", () => ({ currentBusinessId: () => bizId }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => undefined) }));
vi.mock("@/lib/appQueryClient", () => ({
  queryClient: { invalidateQueries: vi.fn() },
}));
vi.mock("@/lib/queryPersist", () => ({
  clearPersistedSnapshots: vi.fn(() => 4),
}));

const {
  WIPE_SCOPES,
  WIPE_TABLE_ORDER,
  isMissingTable,
  runWipe,
  wipeScope,
  wipeTables,
} = await import("./wipe");
const { EXPORT_CATEGORIES } = await import("./export");
const { logAudit } = await import("./audit");
const { queryClient } = await import("@/lib/appQueryClient");
const { clearPersistedSnapshots } = await import("@/lib/queryPersist");

beforeEach(() => {
  bizId = "biz-1";
  deleteFn.mockReset();
  updateFn.mockReset();
  fromCalls.length = 0;
  for (const key of Object.keys(responses)) delete responses[key];
  vi.mocked(logAudit).mockClear();
  vi.mocked(queryClient.invalidateQueries).mockClear();
  vi.mocked(clearPersistedSnapshots).mockClear();
});

describe("wipe scopes", () => {
  it("offers every exportable dataset plus an all-data option", () => {
    const keys = WIPE_SCOPES.map((s) => s.key);
    expect(keys[0]).toBe("all");
    for (const category of EXPORT_CATEGORIES) {
      expect(keys).toContain(category.key);
    }
  });

  it("lists sales children before sales", () => {
    expect(wipeTables("sales")).toEqual(["sale_payments", "sales"]);
  });

  it("de-duplicates overlapping scopes", () => {
    // Receipts are the sales themselves; both categories must not try to
    // delete `sales` twice.
    expect(wipeTables("receipts")).toEqual(["sale_payments", "sales"]);
  });

  it("orders financial statements child-first", () => {
    const tables = wipeTables("financial_statements");
    // daily_balancing.bank_deposit_id references bank_deposits.
    expect(tables).toEqual([
      "standing_orders",
      "daily_balancing",
      "bank_deposits",
    ]);
    expect(tables.indexOf("daily_balancing")).toBeLessThan(
      tables.indexOf("bank_deposits")
    );
  });

  it("orders client-billing payments before invoices", () => {    const tables = wipeTables("client_billing");
    expect(tables.indexOf("client_invoice_payments")).toBeLessThan(
      tables.indexOf("client_invoices")
    );
    expect(tables.indexOf("client_invoices")).toBeLessThan(
      tables.indexOf("client_accounts")
    );
  });

  it("keeps every master table after its dependants in the all-data plan", () => {
    const tables = wipeTables("all");
    expect(tables).toEqual([...WIPE_TABLE_ORDER]);

    const at = (t: string) => tables.indexOf(t);
    expect(at("sale_payments")).toBeLessThan(at("sales"));
    expect(at("sales")).toBeLessThan(at("customers"));
    expect(at("stock_adjustments")).toBeLessThan(at("items"));
    expect(at("purchase_orders")).toBeLessThan(at("suppliers"));
    expect(at("loyalty_transactions")).toBeLessThan(at("customers"));
  });

  it("never includes configuration tables", () => {
    const tables = wipeTables("all");
    for (const config of [
      "shop_settings",
      "branches",
      "uoms",
      "uom_categories",
      "unit_conversions",
      "business_members",
      "businesses",
      "user_profiles",
    ]) {
      expect(tables).not.toContain(config);
    }
  });

  it("marks derived statistics as having nothing stored", () => {
    const stats = wipeScope("statistics");
    expect(wipeTables("statistics")).toEqual([]);
    expect(stats.clears ?? []).toEqual([]);
  });

  it("clears BOMs in place instead of deleting items", () => {
    const boms = wipeScope("boms");
    expect(wipeTables("boms")).toEqual([]);
    expect(boms.clears).toEqual([{ table: "items", column: "bom" }]);
  });
});

describe("isMissingTable", () => {
  it("recognises PostgREST and Postgres missing-table errors", () => {
    expect(isMissingTable({ code: "PGRST205", message: "nope" })).toBe(true);
    expect(isMissingTable({ code: "42P01" })).toBe(true);
    expect(
      isMissingTable({ message: "Could not find the table 'public.client_invoices'" })
    ).toBe(true);
    expect(
      isMissingTable({
        message: 'relation "public.client_accounts" does not exist',
      })
    ).toBe(true);
  });

  it("does not treat a permission error as a missing table", () => {
    expect(isMissingTable({ code: "42501", message: "permission denied" })).toBe(
      false
    );
  });
});

describe("runWipe", () => {
  it("deletes each table child-first, scoped to the active business", async () => {
    responses.sale_payments = { count: 3, error: null };
    responses.sales = { count: 2, error: null };

    const result = await runWipe("sales");

    expect(fromCalls).toEqual(["sale_payments", "sales"]);
    expect(deleteFn).toHaveBeenCalledTimes(2);
    expect(deleteFn).toHaveBeenCalledWith("sale_payments", { count: "exact" });
    expect(result.totalDeleted).toBe(5);
    expect(result.errors).toEqual([]);
    expect(result.tables).toEqual([
      { table: "sale_payments", deleted: 3, skipped: false },
      { table: "sales", deleted: 2, skipped: false },
    ]);
  });

  it("skips optional tables that are not installed and keeps going", async () => {
    responses.client_invoice_payments = {
      error: { code: "PGRST205", message: "Could not find the table" },
    };
    responses.client_invoices = { count: 1, error: null };

    const result = await runWipe("client_billing");

    expect(result.tables[0]).toEqual({
      table: "client_invoice_payments",
      deleted: 0,
      skipped: true,
    });
    expect(result.errors).toEqual([]);
    expect(result.totalDeleted).toBe(1);
  });

  it("reports a failing table without aborting the rest", async () => {
    responses.sale_payments = {
      error: { code: "23503", message: "violates foreign key constraint" },
    };
    responses.sales = { count: 4, error: null };

    const result = await runWipe("sales");

    expect(result.totalDeleted).toBe(4);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("sale_payments");
    expect(result.errors[0]).toContain("foreign key");
  });

  it("empties BOMs with an update instead of deleting items", async () => {
    responses.items = { count: 7, error: null };

    const result = await runWipe("boms");

    expect(deleteFn).not.toHaveBeenCalled();
    expect(updateFn).toHaveBeenCalledWith("items", { bom: [] }, { count: "exact" });
    expect(result.totalDeleted).toBe(0);
    expect(result.cleared).toEqual([
      { table: "items", column: "bom", updated: 7, skipped: false },
    ]);
  });

  it("refuses to run without an active business", async () => {
    bizId = null;
    await expect(runWipe("all")).rejects.toThrow(/select a business/i);
    expect(deleteFn).not.toHaveBeenCalled();
  });

  it("drops offline snapshots, refetches and records the wipe", async () => {
    responses.sales = { count: 1, error: null };

    await runWipe("sales", { id: "u1", name: "Owner" });

    expect(clearPersistedSnapshots).toHaveBeenCalledTimes(1);
    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(1);
    expect(logAudit).toHaveBeenCalledWith(
      { id: "u1", name: "Owner" },
      "data.wipe",
      "sales",
      null,
      expect.objectContaining({ totalDeleted: 1 })
    );
  });
});
