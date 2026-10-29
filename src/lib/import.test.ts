import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The import engine used to issue one upsert per row. A 1000-row sales
 * export therefore cost 1000 sequential HTTP round-trips, which is why the
 * UI looked frozen — and why this file exists: it pins the request count so
 * the batching cannot silently regress.
 */

type MockFn = ReturnType<typeof vi.fn>;

const upsert: MockFn = vi.fn();
const insert: MockFn = vi.fn();
const rpc: MockFn = vi.fn();

/** Which table each recorded call targeted. */
const callTables: string[] = [];
/** Last payload written per table. */
const callsByTable: Record<string, unknown> = {};
/** Existing (id, number) rows returned by the collision lookup, per table. */
const existingByTable: Record<string, { id: string; number: string }[]> = {};

/** Minimal PostgREST chain: from(t).select(...).eq(...).in(...) */
type LookupBuilder = {
  select: () => LookupBuilder;
  eq: () => LookupBuilder;
  in: (column: string, values: string[]) => LookupBuilder;
  then: (resolve: (value: unknown) => unknown) => Promise<unknown>;
};

function lookupChain(table: string): LookupBuilder {
  let column = "";
  let values: string[] = [];
  const builder: LookupBuilder = {
    select: () => builder,
    eq: () => builder,
    in: (col: string, vals: string[]) => {
      column = col;
      values = vals;
      return builder;
    },
    then: (resolve: (value: unknown) => unknown) => {
      const rows = (existingByTable[table] ?? []).filter((r) =>
        column === "id" ? values.includes(r.id) : values.includes(r.number)
      );
      return Promise.resolve({ data: rows, error: null }).then(resolve);
    },
  };
  return builder;
}

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => {
      callTables.push(table);
      const lookup = lookupChain(table);
      return {
        select: lookup.select,
        eq: lookup.eq,
        in: lookup.in,
        then: lookup.then,
        upsert: (...a: unknown[]) => {
          callsByTable[table] = a[0];
          return upsert(...a);
        },
        insert: (...a: unknown[]) => {
          callsByTable[table] = a[0];
          return insert(...a);
        },
        update: (...a: unknown[]) => {
          callsByTable[table] = a[0];
          return upsert(...a);
        },
      };
    },
    rpc: (...a: unknown[]) => rpc(...a),
  },
}));

vi.mock("@/lib/tenant", () => ({ currentBusinessId: () => "biz-1" }));

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(async () => undefined),
}));

const { importData, countImportRows, detectImportCategory } = await import("./import");

const ok = { error: null };
const firstBatch = (fn: MockFn): unknown[] => (fn.mock.calls[0] as unknown[][])[0];

function payload(rows: unknown[]) {
  return {
    exportedAt: new Date().toISOString(),
    category: "customers",
    count: rows.length,
    rows,
  };
}

function row(i: number) {
  return {
    id: `id-${i}`,
    name: `Customer ${i}`,
    phone: `0700000${i}`,
    email: `c${i}@example.com`,
    created_at: "2025-01-01T00:00:00Z",
  };
}

describe("importData batching", () => {
  beforeEach(() => {
    upsert.mockReset().mockResolvedValue(ok);
    insert.mockReset().mockResolvedValue(ok);
    rpc.mockReset().mockImplementation(async (_fn: unknown, args: unknown) => {
      const rows = (args as { p_rows?: unknown[] })?.p_rows ?? [];
      return { data: { imported: rows.length, skipped: 0, errors: [] }, error: null };
    });
  });

  it("writes 1000 rows in a handful of requests, not one per row", async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => row(i));
    await importData("customers", payload(rows));

    // 1000 rows / BATCH_SIZE(200) = 5 batches.
    expect(upsert).toHaveBeenCalledTimes(5);
  });

  it("sends the whole batch in a single upsert payload", async () => {
    const rows = Array.from({ length: 250 }, (_, i) => row(i));
    await importData("customers", payload(rows));

    // 250 rows -> 2 batches of 200 + 50.
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(firstBatch(upsert)).toHaveLength(200);
  });

  it("counts rows without touching the database", () => {
    const rows = Array.from({ length: 42 }, (_, i) => row(i));
    expect(countImportRows(payload(rows), "customers")).toBe(42);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("does not double-write duplicate ids inside one batch", async () => {
    const rows = [row(1), row(1), row(1)];
    await importData("customers", payload(rows));

    // Duplicate ids collapse to one row -> one batch.
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(firstBatch(upsert)).toHaveLength(1);
  });

  it("falls back to row-by-row when a batch is rejected", async () => {
    let call = 0;
    upsert.mockImplementation(async () => {
      call++;
      // Reject the first (batched) attempt only; individual retries succeed.
      return call === 1 ? { error: { message: "batch too large" } } : ok;
    });

    const rows = Array.from({ length: 10 }, (_, i) => row(i));
    const res = await importData("customers", payload(rows));

    // 1 failed batch attempt + 10 individual retries.
    expect(upsert).toHaveBeenCalledTimes(11);
    expect(res.totalUpdated).toBe(10);
    expect(res.totalErrors).toBe(0);
  });

  it("reports bad rows without aborting the rest of the batch", async () => {
    upsert.mockImplementation(async (arg: unknown) => {
      // Batched call: reject so the engine falls back to row-by-row.
      if (Array.isArray(arg)) return { error: { message: "invalid row" } };
      const r = arg as { name?: string };
      return r.name === "bad"
        ? { error: { message: "NOT NULL violation" } }
        : ok;
    });

    const rows = [row(1), { ...row(2), name: "bad" }, row(3)];
    const res = await importData("customers", payload(rows));

    expect(res.totalErrors).toBe(1);
    expect(res.totalUpdated).toBe(2);
  });

  it("stamps the active business_id and strips server-owned fields", async () => {
    const rows = Array.from({ length: 3 }, (_, i) => row(i));
    await importData("customers", payload(rows), null, undefined, {
      keepOriginalDates: false,
    });

    for (const r of firstBatch(upsert) as Record<string, unknown>[]) {
      expect(r.business_id).toBe("biz-1");
      expect(r.created_at).toBeUndefined();
      expect(r.created_by).toBeUndefined();
    }
  });

  it("keeps the original transaction date by default", async () => {
    const rows = Array.from({ length: 3 }, (_, i) => row(i));
    await importData("customers", payload(rows));

    for (const r of firstBatch(upsert) as Record<string, unknown>[]) {
      // Without this the row would land on the import date, so every report
      // and statement would attribute historic data to today.
      expect(r.created_at).toBe("2025-01-01T00:00:00.000Z");
    }
  });

  it("accepts Postgres' bare hour offset instead of dropping the date", async () => {
    // Postgres can serialise UTC as `+00` (no minutes). `Date.parse` rejects
    // that, which used to make the whole timestamp look unusable and stamp the
    // row with the import date.
    await importData("customers", payload([
      { id: "c1", name: "Bare offset", created_at: "2024-03-15 08:30:00+00" },
      { id: "c2", name: "Compact offset", created_at: "2024-03-15T08:30:00+0000" },
    ]));

    const written = firstBatch(upsert) as Record<string, unknown>[];
    expect(written[0].created_at).toBe("2024-03-15T08:30:00.000Z");
    expect(written[1].created_at).toBe("2024-03-15T08:30:00.000Z");
  });

  it("keeps imported sales on their real transaction date", async () => {    await importData("sales", {
      category: "sales",
      rows: [
        {
          id: "s1",
          number: "R1",
          total: 10,
          created_at: "2023-07-04T09:15:00+00:00",
          payments: [{ id: "p1", sale_id: "s1", amount: 10, created_at: "2023-07-04T09:15:00+00:00" }],
        },
      ],
    });

    // `sales` must be written first (payments reference it) and both keep the
    // original timestamp, otherwise the Sales Report files them under the
    // import date.
    expect(upsert).toHaveBeenCalled();
    const salesBatch = firstBatch(upsert) as Record<string, unknown>[];
    expect(salesBatch[0].created_at).toBe("2023-07-04T09:15:00.000Z");
    expect(salesBatch[0].payments).toBeUndefined();
  });

  it("imports financial statements into their three tables, deposits first", async () => {
    await importData("financial_statements", {
      category: "financial_statements",
      rows: {
        bank_deposits: [
          {
            id: "d1",
            amount: 100,
            deposited_at: "2024-05-01T09:00:00+00:00",
            created_at: "2024-05-01T09:00:00+00:00",
          },
        ],
        daily_balancing: [
          {
            id: "b1",
            balance_date: "2024-05-01",
            bank_deposit_id: "d1",
            created_at: "2024-05-01T18:00:00+00:00",
            updated_at: "2024-05-02T00:00:00+00:00",
          },
        ],
        standing_orders: [
          {
            id: "o1",
            amount: 50,
            next_run_date: "2024-06-01",
            created_at: "2024-05-01T08:00:00+00:00",
          },
        ],
      },
    });

    // bank_deposits must land before daily_balancing (bank_deposit_id FK).
    expect(callTables.slice(-3)).toEqual([
      "bank_deposits",
      "daily_balancing",
      "standing_orders",
    ]);

    const deposit = (callsByTable.bank_deposits as Record<string, unknown>[])[0];
    const balancing = (callsByTable.daily_balancing as Record<string, unknown>[])[0];
    expect(deposit.created_at).toBe("2024-05-01T09:00:00.000Z");
    expect(balancing.created_at).toBe("2024-05-01T18:00:00.000Z");
    // Server-owned columns are still stripped.
    expect(balancing.updated_at).toBeUndefined();
    expect(balancing.business_id).toBe("biz-1");
  });

  it("counts financial-statement rows across all three tables", () => {
    expect(
      countImportRows(
        {
          category: "financial_statements",
          rows: {
            bank_deposits: [{}, {}],
            daily_balancing: [{}],
            standing_orders: [{}, {}, {}],
          },
        },
        "financial_statements"
      )
    ).toBe(6);
  });

  it("drops an unusable created_at instead of failing the row", async () => {    await importData("customers", payload([
      { id: "c1", name: "Bad date", created_at: "not-a-date" },
    ]));

    const written = (firstBatch(upsert) as Record<string, unknown>[])[0];
    expect(written.created_at).toBeUndefined();
    expect(written.name).toBe("Bad date");
  });

  it("reports live progress per batch", async () => {
    const seen: number[] = [];
    const rows = Array.from({ length: 500 }, (_, i) => row(i));
    await importData("customers", payload(rows), null, (p) => seen.push(p.rowsDone));

    // 1 initial "starting point" callback + 500 rows / 200 = 3 batches.
    expect(seen).toEqual([0, 200, 400, 500]);
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]).toBeGreaterThan(seen[i - 1]);
    }
  });

  it("counts rows for a multi-table category", () => {
    const p = {
      exportedAt: new Date().toISOString(),
      category: "client_billing",
      rows: {
        client_accounts: [{}, {}],
        client_invoices: [{}, {}, {}],
      },
    };
    expect(countImportRows(p, "client_billing")).toBe(5);
  });

  it("returns null for a full multi-category backup bundle", () => {
    const bundle = {
      exportedAt: new Date().toISOString(),
      categories: { sales: {}, customers: {} },
    };
    expect(detectImportCategory(bundle)).toBeNull();
  });

  it("detects a single-category bundle", () => {
    expect(
      detectImportCategory({
        exportedAt: new Date().toISOString(),
        categories: { customers: {} },
      })
    ).toBe("customers");
  });
});

describe("sales import splits nested payments", () => {
  /**
   * Regression: export.ts nests each sale's payment rows under `payments`.
   * Writing that payload straight into `sales` failed with
   *   "Could not find the 'payments' column of 'sales' in the schema cache".
   */
  it("writes the sale to sales and its payments to sale_payments", async () => {
    callTables.length = 0;
    for (const k of Object.keys(callsByTable)) delete callsByTable[k];
    upsert.mockClear();
    insert.mockClear();

    await importData("sales", {
      exportedAt: new Date().toISOString(),
      category: "sales",
      rows: [
        {
          id: "s1",
          number: "PI5011",
          total: 274000,
          payments: [
            { id: "p1", sale_id: "s1", amount: 274000, payment_method: "cash" },
          ],
        },
      ],
    });

    const sale = (callsByTable["sales"] as Record<string, unknown>[])[0];
    expect(sale).toBeTruthy();
    expect(sale).not.toHaveProperty("payments");

    const payments = callsByTable["sale_payments"] as Record<string, unknown>[];
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ id: "p1", sale_id: "s1", business_id: "biz-1" });

    // The parent sale must be written first (FK: sale_payments.sale_id).
    expect(callTables.indexOf("sales")).toBeLessThan(
      callTables.indexOf("sale_payments")
    );
  });
});

describe("sales import resolves duplicate document numbers", () => {
  /**
   * Regression: `sales` has `sales_business_number_key`, a unique index on
   * (business_id, number). An export can contain the same receipt number more
   * than once (older builds handed one number to two sales), which failed with
   *   "duplicate key value violates unique constraint
   *    \"sales_business_number_key\"".
   * Every sale must still be imported; only the repeated number changes.
   */
  beforeEach(() => {
    upsert.mockReset().mockResolvedValue(ok);
    insert.mockReset().mockResolvedValue(ok);
    for (const k of Object.keys(existingByTable)) delete existingByTable[k];
    callTables.length = 0;
    for (const k of Object.keys(callsByTable)) delete callsByTable[k];
  });

  it("suffixes a number repeated inside the file", async () => {
    const res = await importData("sales", {
      exportedAt: new Date().toISOString(),
      category: "sales",
      rows: [
        { id: "s1", number: "PI5643", total: 3000 },
        { id: "s2", number: "PI5643", total: 500 },
        { id: "s3", number: "PI5643", total: 500 },
        { id: "s4", number: "PI5644", total: 100 },
      ],
    });

    const rows = callsByTable["sales"] as Record<string, unknown>[];
    expect(rows.map((r) => r.number)).toEqual([
      "PI5643",
      "PI5643-2",
      "PI5643-3",
      "PI5644",
    ]);
    expect(res.totalWarnings).toBe(2);
    expect(res.results[0].warnings[0]).toContain("PI5643-2");
    expect(res.totalErrors).toBe(0);
  });

  it("suffixes a number already used by a different record", async () => {
    existingByTable["sales"] = [{ id: "other", number: "PI5643" }];

    const res = await importData("sales", {
      exportedAt: new Date().toISOString(),
      category: "sales",
      rows: [{ id: "s1", number: "PI5643", total: 3000 }],
    });

    const rows = callsByTable["sales"] as Record<string, unknown>[];
    expect(rows[0].number).toBe("PI5643-2");
    expect(res.totalWarnings).toBe(1);
    expect(res.totalErrors).toBe(0);
  });

  it("keeps the stored number when the same sale is imported again", async () => {
    // A previous run already renumbered this sale to PI5643-2.
    existingByTable["sales"] = [{ id: "s1", number: "PI5643-2" }];

    const res = await importData("sales", {
      exportedAt: new Date().toISOString(),
      category: "sales",
      rows: [{ id: "s1", number: "PI5643", total: 3000 }],
    });

    const rows = callsByTable["sales"] as Record<string, unknown>[];
    expect(rows[0].number).toBe("PI5643-2");
    expect(res.totalWarnings).toBe(0);
  });
});

describe("employees import splits nested attendance", () => {
  /**
   * Regression: the employees export nests each employee's attendance rows
   * INSIDE the profile row. Writing those rows straight onto `user_profiles`
   * produced:
   *   "Could not find the 'attendance' column of 'user_profiles' in the
   *    schema cache"
   * The engine must strip the nested array and write it to `attendance`.
   *
   * Profiles now go through `import_employee_profiles` because RLS on
   * user_profiles only permits `id = auth.uid()` inserts.
   */
  beforeEach(() => {
    rpc.mockReset().mockImplementation(async (_fn: unknown, args: unknown) => {
      const rows = (args as { p_rows?: unknown[] })?.p_rows ?? [];
      return { data: { imported: rows.length, skipped: 0, errors: [] }, error: null };
    });
  });

  it("writes profiles through the RPC and attendance to attendance", async () => {
    callTables.length = 0;
    for (const k of Object.keys(callsByTable)) delete callsByTable[k];
    upsert.mockClear();
    insert.mockClear();
    rpc.mockClear();

    const payload = {
      exportedAt: new Date().toISOString(),
      category: "employees",
      count: 2,
      rows: [
        {
          id: "emp-1",
          name: "Alice",
          username: "alice",
          role: "Cashier",
          // nested child rows, exactly as export.ts produces them
          attendance: [
            { id: "a1", employee_id: "emp-1", date: "2026-10-01", status: "present" },
            { id: "a2", employee_id: "emp-1", date: "2026-10-02", status: "absent" },
          ],
        },
        {
          id: "emp-2",
          name: "Bob",
          username: "bob",
          role: "Manager",
          attendance: [],
        },
      ],
    };

    await importData("employees", payload);

    const profiles = (
      (rpc.mock.calls[0] as unknown[])[1] as { p_rows: Record<string, unknown>[] }
    ).p_rows;
    const attendance = callsByTable["attendance"] as Record<string, unknown>[];

    expect(profiles, "profiles were sent to the RPC").toBeTruthy();
    expect(attendance, "attendance was written").toBeTruthy();

    // Profiles must NOT carry an `attendance` key.
    for (const p of profiles) {
      expect(p).not.toHaveProperty("attendance");
    }
    expect(profiles).toHaveLength(2);
    expect(attendance).toHaveLength(2);
    // user_profiles is never written directly (RLS blocks it).
    expect(callTables).not.toContain("user_profiles");
    expect(callTables).toContain("attendance");
    expect(rpc.mock.calls[0][0]).toBe("import_employee_profiles");
  });
});

describe("schema-safety on import", () => {
  beforeEach(() => {
    rpc.mockReset().mockImplementation(async (_fn: unknown, args: unknown) => {
      const rows = (args as { p_rows?: unknown[] })?.p_rows ?? [];
      return { data: { imported: rows.length, skipped: 0, errors: [] }, error: null };
    });
  });

  /** user_profiles is global and has no business_id column (membership lives in
   *  business_members). Stamping it raises
   *  "Could not find the 'business_id' column of 'user_profiles' in the schema
   *  cache" and fails the whole batch. */
  it("does not stamp business_id onto user_profiles", async () => {
    callTables.length = 0;
    for (const k of Object.keys(callsByTable)) delete callsByTable[k];
    upsert.mockClear();
    insert.mockClear();
    rpc.mockClear();

    await importData("employees", {
      exportedAt: new Date().toISOString(),
      category: "employees",
      rows: [{ id: "e1", name: "Alice", username: "alice", attendance: [] }],
    });

    const profiles = (
      (rpc.mock.calls[0] as unknown[])[1] as { p_rows: Record<string, unknown>[] }
    ).p_rows;
    expect(profiles).toBeTruthy();
    for (const p of profiles) {
      expect(p).not.toHaveProperty("business_id");
    }
  });

  it("stamps business_id onto tables that do have the column", async () => {
    callTables.length = 0;
    for (const k of Object.keys(callsByTable)) delete callsByTable[k];
    upsert.mockClear();
    insert.mockClear();

    await importData("customers", payload([{ id: "c1", name: "Alice" }]));

    const rows = callsByTable["customers"] as Record<string, unknown>[];
    expect(rows).toBeTruthy();
    expect(rows[0].business_id).toBe("biz-1");
  });

  /** Exports carry `image_url_base64` / `avatar_url_base64` which are derived
   *  for offline round-tripping and are NOT real columns. */
  it("drops export-only *_base64 columns before writing", async () => {
    callTables.length = 0;
    for (const k of Object.keys(callsByTable)) delete callsByTable[k];
    upsert.mockClear();
    insert.mockClear();

    await importData("customers", payload([
      { id: "c1", name: "Alice", avatar_url: "https://x/y.png", avatar_url_base64: "data:image/png;base64,AAAA" },
    ]));

    const rows = callsByTable["customers"] as Record<string, unknown>[];
    expect(rows).toBeTruthy();
    expect(rows[0]).not.toHaveProperty("avatar_url_base64");
    expect(rows[0]).toHaveProperty("avatar_url");
  });
});
