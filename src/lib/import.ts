import { supabase } from "./supabase";
import { currentBusinessId } from "./tenant";
import { logAudit } from "./audit";
import type { Employee } from "@/types";
import { EXPORT_CATEGORIES, type ExportCategory } from "./export";

/** The import category set mirrors EXPORT_CATEGORIES exactly — every
 * exported category can be re-imported. The dropdown in Settings lists
 * these labels. */
export type ImportCategory = ExportCategory;

export const IMPORT_CATEGORIES = EXPORT_CATEGORIES;

/** Categories that are derived rollups rather than stored rows. They can be
 * exported, but importing them would write nothing meaningful. */
export const NON_IMPORTABLE_CATEGORIES: ImportCategory[] = ["statistics"];

/** Rows are written in batches of this size. PostgREST accepts an array in a
 * single upsert/insert call, so a 1000-row import costs a handful of
 * requests instead of one request per row. */
const BATCH_SIZE = 200;

/** A parsed import payload that may carry either a single category payload
 * or a full multi-category backup bundle (as produced by backup.ts). */
export type ImportPayload = {
  category?: string;
  count?: number;
  rows?: unknown[] | Record<string, unknown>;
  rollups?: unknown;
  shop?: unknown;
  shopLogoBase64?: string | null;
  exportedAt?: string;
  app?: string;
  categories?: Record<string, unknown>;
  [key: string]: unknown;
};

/** Result of importing a single table's rows. */
export type TableImportResult = {
  table: string;
  inserted: number;
  updated: number;
  errors: string[];
  /** Non-fatal changes made to keep the import valid, e.g. a document number
   *  that was already taken and had to be suffixed. */
  warnings: string[];
};

/** Aggregate result returned to the UI. */
export type ImportResult = {
  category: ImportCategory;
  results: TableImportResult[];
  totalInserted: number;
  totalUpdated: number;
  totalErrors: number;
  totalWarnings: number;
};

/** Live progress handed to the UI as the import runs. */
export type ImportProgress = {
  /** Table currently being written. */
  table: string;
  /** Rows written so far across all tables. */
  rowsDone: number;
  /** Total rows that will be written. */
  rowsTotal: number;
  /** Write batches completed so far. */
  batchesDone: number;
  /** Total write batches that will run. */
  batchesTotal: number;
};

type Actor = Pick<Employee, "id" | "name"> & { role?: string };

/** Choices the user makes on the import screen that change how rows land. */
export type ImportOptions = {
  /**
   * Keep the `created_at` timestamp carried by the file.
   *
   * The export always contains the real timestamp of each row, but import
   * used to strip every server-owned column — including `created_at` — so the
   * database stamped `now()` and every imported sale/expense/document showed
   * up on the import date. With this on (the default) the original
   * transaction date is written back verbatim, so reports, statements and
   * receipts stay on the days the transactions actually happened. Turn it off
   * to deliberately stamp the whole import with the current date.
   */
  keepOriginalDates?: boolean;
};

/** Shape of a timestamp we are willing to write back to a `timestamptz`
 *  column. Accepts the formats PostgREST/Postgres emit, including a bare hour
 *  offset (`+00`) that `Date.parse` itself rejects. */
const TIMESTAMP_RE =
  /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)?)?$/;

/**
 * Normalise a timestamp carried by an export to a canonical ISO string, or
 * return null when the value is not a usable date.
 *
 * Why not just `isTimestamp` + pass-through:
 *  • Postgres can serialise UTC as `+00` (no minutes) or `+0000`, both of
 *    which `Date.parse` rejects — those rows would silently lose their real
 *    transaction date and land on the import date.
 *  • Re-serialising through `toISOString()` guarantees PostgREST accepts the
 *    value verbatim.
 */
function normaliseTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!TIMESTAMP_RE.test(raw)) return null;

  const patched = raw
    .replace(/([+-]\d{2})(\d{2})$/, "$1:$2") // +0000 -> +00:00
    .replace(/([+-]\d{2})$/, "$1:00"); // +00   -> +00:00

  const ms = Date.parse(patched);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Map an export payload into the raw database rows array for a given category.
 * Mirrors buildExport in reverse: each export category has its own payload
 * shape that must be flattened into table rows.
 */
function extractRowsForCategory(
  payload: ImportPayload,
  category: ImportCategory
): Record<string, unknown[]> {
  if (payload.categories) {
    // Full backup bundle: pull the sub-payload for this category.
    const sub = payload.categories[category] as ImportPayload | undefined;
    if (!sub) return {};
    return extractRowsForCategory(sub, category);
  }

  switch (category) {
    case "sales":
    case "receipts": {
      // The export nests each sale's payment rows INSIDE the sale
      // (`rows[i].payments`), because payments are a child of the sale, not a
      // column. Writing the rows as-is fails with
      //   "Could not find the 'payments' column of 'sales' in the schema cache".
      // Split them into their real table instead. `sales` must come first:
      // sale_payments.sale_id references it.
      const rows = Array.isArray(payload.rows) ? payload.rows : [];
      const sales: Record<string, unknown>[] = [];
      const payments: Record<string, unknown>[] = [];
      for (const r of rows) {
        if (!r || typeof r !== "object") continue;
        const rec = { ...(r as Record<string, unknown>) };
        const nested = rec.payments;
        delete rec.payments;
        sales.push(rec);
        if (Array.isArray(nested)) {
          for (const p of nested) {
            if (p && typeof p === "object") {
              payments.push(p as Record<string, unknown>);
            }
          }
        }
      }
      return { sales, sale_payments: payments };
    }

    case "purchases":
      return { purchase_orders: Array.isArray(payload.rows) ? payload.rows : [] };

    case "inventory":
      return { items: Array.isArray(payload.rows) ? payload.rows : [] };

    case "boms":
      return { items: Array.isArray(payload.rows) ? payload.rows : [] };

    case "customers":
      return { customers: Array.isArray(payload.rows) ? payload.rows : [] };

    case "suppliers":
      return { suppliers: Array.isArray(payload.rows) ? payload.rows : [] };

    case "expenses":
      return { expenses: Array.isArray(payload.rows) ? payload.rows : [] };

    case "financial_statements": {
      // Mirror of buildExport: `rows` is an object keyed by table. Only these
      // three tables are accepted, and `bank_deposits` is written first
      // because `daily_balancing.bank_deposit_id` references it.
      const r = (payload.rows as Record<string, unknown>) || {};
      const out: Record<string, unknown[]> = {};
      for (const table of ["bank_deposits", "daily_balancing", "standing_orders"]) {
        const val = r[table];
        if (Array.isArray(val)) out[table] = val;
      }
      return out;
    }

    case "employees": {
      // The export nests each employee's attendance rows INSIDE the profile
      // (`rows[i].attendance`), because attendance is a child of the
      // employee, not a column of `user_profiles`. Flattening those rows as-is
      // would try to write an `attendance` column onto `user_profiles` and
      // fail with "Could not find the 'attendance' column of 'user_profiles'
      // in the schema cache". Split them into their real tables instead.
      const rows = Array.isArray(payload.rows) ? payload.rows : [];
      const profiles: Record<string, unknown>[] = [];
      const attendance: Record<string, unknown>[] = [];
      for (const r of rows) {
        if (!r || typeof r !== "object") continue;
        const rec = { ...(r as Record<string, unknown>) };
        const nested = rec.attendance;
        delete rec.attendance;
        profiles.push(rec);
        if (Array.isArray(nested)) {
          for (const a of nested) {
            if (a && typeof a === "object") attendance.push(a as Record<string, unknown>);
          }
        }
      }
      return { user_profiles: profiles, attendance };
    }

    case "statistics":
      // Statistics are derived rollups, not importable rows.
      return {};

    case "loyalty":
      return { loyalty_transactions: Array.isArray(payload.rows) ? payload.rows : [] };

    case "client_billing": {
      const r = (payload.rows as Record<string, unknown>) || {};
      const out: Record<string, unknown[]> = {};
      for (const [table, val] of Object.entries(r)) {
        if (Array.isArray(val)) out[table] = val;
      }
      return out;
    }

    case "audit":
      return { audit_logs: Array.isArray(payload.rows) ? payload.rows : [] };

    default:
      return {};
  }
}

/** Tables that intentionally carry NO `business_id` column. `user_profiles`
 *  is global (one row per user across shops) — membership lives in
 *  `business_members` instead, see supabase/migrations/20251006000012_tenant_rls.sql.
 *  Sending business_id to these raises
 *  "Could not find the 'business_id' column of '<t>' in the schema cache". */
const NO_BUSINESS_ID_TABLES = new Set<string>([
  "user_profiles",
  "businesses",
  "business_members",
]);

/** Tables whose document number is unique per business:
 *    sales             -> sales_business_number_key (business_id, number)
 *    purchase_orders   -> purchase_orders_biz_number_key
 *    quotes            -> quotes_biz_number_key
 *  Re-importing an export that contains the same number twice (or importing
 *  into a shop that already used those numbers) fails with
 *  "duplicate key value violates unique constraint". `resolveNumberCollisions`
 *  below repairs that before the write. */
const BUSINESS_NUMBER_TABLES = new Set<string>([
  "sales",
  "purchase_orders",
  "quotes",
]);

/** Columns the export adds for offline image round-tripping. They are derived
 *  from real columns (`image_url` → `image_url_base64`, `avatar_url` →
 *  `avatar_url_base64`) and have NO counterpart column in the database, so an
 *  upsert carrying them is rejected with
 *  "Could not find the '<col>' column of '<table>' in the schema cache".
 *  They are always safe to drop on import. */
const EXPORT_DERIVED_SUFFIX = "_base64";

/** Fields the server generates — never import these. */
const SERVER_OWNED_FIELDS = [
  "created_at",
  "updated_at",
  "created_by",
  "created_by_name",
  "business_id",
];

/** Normalise a single DB row: strip read-only server fields and export-only
 *  derived columns, and stamp the active business_id — but only on tables that
 *  actually have that column. */
function normaliseRow(
  row: Record<string, unknown>,
  table?: string,
  keepOriginalDates = true
): Record<string, unknown> {
  const businessId = currentBusinessId();
  const out: Record<string, unknown> = { ...row };

  for (const f of SERVER_OWNED_FIELDS) {
    // `created_at` is the only server-owned column that carries the real
    // transaction date. Keep it when the file has a usable timestamp so the
    // row lands on the day it happened rather than on the import date.
    if (f === "created_at" && keepOriginalDates) {
      const ts = normaliseTimestamp(out.created_at);
      if (ts) {
        out.created_at = ts;
        continue;
      }
    }
    delete out[f];
  }
  for (const k of Object.keys(out)) {
    if (k.endsWith(EXPORT_DERIVED_SUFFIX)) delete out[k];
  }

  // Ensure the row belongs to the active business — where that is meaningful.
  if (businessId && !NO_BUSINESS_ID_TABLES.has(table ?? "")) {
    out.business_id = businessId;
  }

  return out;
}

/** Keep only the last row per id. PostgREST cannot touch the same row twice
 * in one statement, and re-importing an export must stay idempotent. */
function dedupeById(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const seen = new Map<string, Record<string, unknown>>();
  for (const r of rows) {
    if (r.id === undefined || r.id === null) continue;
    seen.set(String(r.id), r);
  }
  return [...seen.values()];
}

/** Write one batch of rows. If the batch is rejected outright, fall back to
 * row-by-row so a single bad row costs that row, not the whole batch. */
async function writeBatch(
  table: string,
  batch: Record<string, unknown>[],
  upsert: boolean,
  result: TableImportResult
): Promise<void> {
  const { error } = upsert
    ? await supabase.from(table).upsert(batch, { onConflict: "id" })
    : await supabase.from(table).insert(batch);

  if (!error) {
    if (upsert) result.updated += batch.length;
    else result.inserted += batch.length;
    return;
  }

  for (const row of batch) {
    const { error: rowError } = upsert
      ? await supabase.from(table).upsert(row, { onConflict: "id" })
      : await supabase.from(table).insert(row);
    if (rowError) {
      result.errors.push(`${table}: ${rowError.message}`);
    } else if (upsert) {
      result.updated++;
    } else {
      result.inserted++;
    }
  }
}

/** Number of document numbers fetched per collision-check request. */
const NUMBER_LOOKUP_CHUNK = 150;

/**
 * Keep every document number unique within the business before writing.
 *
 * `sales` carries `sales_business_number_key` — a unique index on
 * `(business_id, number)`. Two situations break an import:
 *
 *   1. The export itself repeats a number. Older builds generated receipt
 *      numbers from a counter that could hand the same value to two sales
 *      (two tills, a retried checkout), so a file can legitimately contain
 *      `PI5643` five times with different totals.
 *   2. The target shop already used that number for a different record.
 *
 * Upserting on `id` cannot absorb either case, so the write dies with
 * "duplicate key value violates unique constraint". Here the first row keeps
 * the number and later ones are suffixed `-2`, `-3`, … and reported as
 * warnings — no sale is dropped and no number is silently overwritten.
 *
 * Re-running an import is stable: a row whose `id` already exists keeps the
 * number currently stored in the database, so the second run cannot fight
 * with the rows the first run renumbered.
 */
async function resolveNumberCollisions(
  table: string,
  rows: Record<string, unknown>[],
  businessId: string,
  result: TableImportResult
): Promise<void> {
  const wanted = [
    ...new Set(
      rows
        .map((r) => String(r.number ?? "").trim())
        .filter(Boolean)
    ),
  ];
  if (!wanted.length) return;

  /** Numbers already used in this business. */
  const taken = new Set<string>();
  /** id -> number currently stored, for rows that were imported before. */
  const storedNumber = new Map<string, string>();

  // 1. Rows that were already imported. Their stored number may differ from
  //    the file (a previous run renumbered them), and that number must win —
  //    otherwise a re-import would move the row back onto a taken number.
  const ids = rows.map((r) => (r.id ? String(r.id) : "")).filter(Boolean);
  for (const part of chunk(ids, NUMBER_LOOKUP_CHUNK)) {
    const { data, error } = await supabase
      .from(table)
      .select("id,number")
      .eq("business_id", businessId)
      .in("id", part);

    if (error) return;

    for (const row of (data || []) as { id?: unknown; number?: unknown }[]) {
      const number = String(row.number ?? "").trim();
      if (!row.id || !number) continue;
      storedNumber.set(String(row.id), number);
      taken.add(number);
    }
  }

  // 2. Numbers that belong to some other record in this business.
  for (const part of chunk(wanted, NUMBER_LOOKUP_CHUNK)) {
    const { data, error } = await supabase
      .from(table)
      .select("id,number")
      .eq("business_id", businessId)
      .in("number", part);

    if (error) {
      // Without the lookup we cannot tell a real collision from a free
      // number. Leave the rows untouched; the write reports the constraint
      // error itself if one occurs.
      return;
    }

    for (const row of (data || []) as { id?: unknown; number?: unknown }[]) {
      const number = String(row.number ?? "").trim();
      if (!number) continue;
      taken.add(number);
      if (row.id) storedNumber.set(String(row.id), number);
    }
  }

  for (const row of rows) {
    const id = row.id ? String(row.id) : "";
    const stored = id ? storedNumber.get(id) : undefined;

    if (stored) {
      // Already imported: keep the number that is actually in the database.
      row.number = stored;
      continue;
    }

    const number = String(row.number ?? "").trim();
    if (!number) continue;
    if (!taken.has(number)) {
      taken.add(number);
      continue;
    }

    let suffix = 2;
    let candidate = `${number}-${suffix}`;
    while (taken.has(candidate)) candidate = `${number}-${++suffix}`;
    taken.add(candidate);
    row.number = candidate;
    result.warnings.push(
      `${table}: ${number} was already used — imported as ${candidate}`
    );
  }
}

/**
 * Items carry two codes that must be settled before the write.
 *
 * `(business_id, sku)` is unique (`items_biz_sku_key`), so a file that repeats
 * a SKU — or brings one the target shop already uses — makes the whole batch
 * fail with
 *   "duplicate key value violates unique constraint \"items_biz_sku_key\"".
 * Barcodes are not unique in the schema, but two items sharing one barcode
 * makes scanning ambiguous, so duplicates are cleared rather than imported.
 *
 * Rules, mirroring `resolveNumberCollisions`:
 *   • a row whose `id` already exists keeps the codes stored in the database;
 *   • a taken SKU is imported as `SKU-2`, `SKU-3`, … (the SKU is the item's
 *     identity, so it must survive; dropping the row would lose stock);
 *   • a blank SKU becomes null (many blank rows would all collide on "");
 *   • a duplicate barcode becomes null, because a wrong barcode is worse than
 *     none and barcodes have no meaningful numeric suffix.
 * Every change is reported as a warning, never silently.
 */
async function resolveItemCodeCollisions(
  rows: Record<string, unknown>[],
  businessId: string,
  result: TableImportResult
): Promise<void> {
  const ids = [...new Set(rows.map((r) => (r.id ? String(r.id) : "")).filter(Boolean))];
  const wantedSkus = [
    ...new Set(rows.map((r) => String(r.sku ?? "").trim()).filter(Boolean)),
  ];
  const wantedBarcodes = [
    ...new Set(rows.map((r) => String(r.barcode ?? "").trim()).filter(Boolean)),
  ];

  /** Codes already used in this business. */
  const takenSku = new Set<string>();
  const takenBarcode = new Set<string>();
  /** id -> non-empty code currently stored, for rows imported before. */
  const storedSku = new Map<string, string>();
  const storedBarcode = new Map<string, string>();
  /** Older deployments may not expose `barcode`; skip those checks then. */
  let canCheckBarcode = true;

  // 1. Rows that were already imported. A previous run may have suffixed the
  //    SKU or cleared the barcode; a stored code must win, otherwise a
  //    re-import fights the rows the first run already fixed. A stored NULL is
  //    not a value: fall through so the file can supply one.
  for (const part of chunk(ids, NUMBER_LOOKUP_CHUNK)) {
    const { data, error } = await supabase
      .from("items")
      .select("id,sku,barcode")
      .eq("business_id", businessId)
      .in("id", part);

    if (error) return;

    for (const row of (data || []) as {
      id?: unknown;
      sku?: unknown;
      barcode?: unknown;
    }[]) {
      if (!row.id) continue;
      const id = String(row.id);
      const sku = String(row.sku ?? "").trim();
      const barcode = String(row.barcode ?? "").trim();
      if (sku) {
        storedSku.set(id, sku);
        takenSku.add(sku);
      }
      if (barcode) {
        storedBarcode.set(id, barcode);
        takenBarcode.add(barcode);
      }
    }
  }

  // 2. SKUs that belong to some other item in this business.
  for (const part of chunk(wantedSkus, NUMBER_LOOKUP_CHUNK)) {
    const { data, error } = await supabase
      .from("items")
      .select("id,sku")
      .eq("business_id", businessId)
      .in("sku", part);

    if (error) {
      // Without the lookup we cannot tell a real collision from a free SKU.
      // Leave the rows untouched; the write reports the constraint error.
      return;
    }

    for (const row of (data || []) as { sku?: unknown }[]) {
      const sku = String(row.sku ?? "").trim();
      if (sku) takenSku.add(sku);
    }
  }

  // 3. Barcodes already used by another item. Best-effort: a schema without
  //    the column (or without permission to read it) must not block the import.
  for (const part of chunk(wantedBarcodes, NUMBER_LOOKUP_CHUNK)) {
    const { data, error } = await supabase
      .from("items")
      .select("id,barcode")
      .eq("business_id", businessId)
      .in("barcode", part);

    if (error) {
      canCheckBarcode = false;
      break;
    }

    for (const row of (data || []) as { barcode?: unknown }[]) {
      const barcode = String(row.barcode ?? "").trim();
      if (barcode) takenBarcode.add(barcode);
    }
  }

  for (const row of rows) {
    const id = row.id ? String(row.id) : "";

    // ---- SKU -------------------------------------------------------------
    const savedSku = id ? storedSku.get(id) : undefined;
    if (savedSku !== undefined) {
      row.sku = savedSku;
    } else {
      const sku = String(row.sku ?? "").trim();
      if (!sku) {
        row.sku = null;
      } else if (!takenSku.has(sku)) {
        takenSku.add(sku);
        row.sku = sku;
      } else {
        let suffix = 2;
        let candidate = `${sku}-${suffix}`;
        while (takenSku.has(candidate)) candidate = `${sku}-${++suffix}`;
        takenSku.add(candidate);
        row.sku = candidate;
        result.warnings.push(
          `items: SKU ${sku} was already used — imported as ${candidate}`
        );
      }
    }

    // ---- Barcode ---------------------------------------------------------
    if (!canCheckBarcode) continue;

    const savedBarcode = id ? storedBarcode.get(id) : undefined;
    if (savedBarcode !== undefined) {
      row.barcode = savedBarcode;
      continue;
    }

    const barcode = String(row.barcode ?? "").trim();
    if (!barcode) {
      row.barcode = null;
    } else if (!takenBarcode.has(barcode)) {
      takenBarcode.add(barcode);
      row.barcode = barcode;
    } else {
      row.barcode = null;
      result.warnings.push(
        `items: barcode ${barcode} is already used — imported without a barcode`
      );
    }
  }
}

/** Import all rows for a single table via batched upsert-by-id.
 *  Rows that omit `id` are inserted as new rows; rows with an `id` are
 *  upserted (matched on conflict). Errors for individual rows are collected
 *  and reported — one bad row never aborts the whole batch. */
async function importTable(
  table: string,
  rows: unknown[],
  result: TableImportResult,
  onProgress?: (p: ImportProgress) => void,
  state?: {
    rowsDone: number;
    rowsTotal: number;
    batchesDone: number;
    batchesTotal: number;
  },
  options?: ImportOptions
): Promise<void> {
  if (!rows.length || !state) return;

  const keepOriginalDates = options?.keepOriginalDates !== false;

  const normal = rows
    .map((r) =>
      r && typeof r === "object"
        ? normaliseRow(r as Record<string, unknown>, table, keepOriginalDates)
        : null
    )
    .filter((r): r is Record<string, unknown> => r !== null);

  // Split into id'd (upsert) and id-less (insert) batches.
  const withId = dedupeById(normal.filter((r) => r.id));
  const withoutId = normal.filter((r) => !r.id);

  // A business-scoped unique document number must be settled before writing,
  // otherwise the upsert dies on the constraint instead of importing.
  const businessId = currentBusinessId();
  if (businessId && BUSINESS_NUMBER_TABLES.has(table)) {
    await resolveNumberCollisions(
      table,
      [...withId, ...withoutId],
      businessId,
      result
    );
  }

  // Items have their own unique key — `(business_id, sku)` — plus barcodes
  // that must stay unambiguous. Same failure mode, different columns.
  if (businessId && table === "items") {
    await resolveItemCodeCollisions([...withId, ...withoutId], businessId, result);
  }

  const batches: { batch: Record<string, unknown>[]; upsert: boolean }[] = [
    ...chunk(withId, BATCH_SIZE).map((batch) => ({ batch, upsert: true })),
    ...chunk(withoutId, BATCH_SIZE).map((batch) => ({ batch, upsert: false })),
  ];

  state.batchesTotal += batches.length;

  for (const { batch, upsert } of batches) {
    await writeBatch(table, batch, upsert, result);
    state.rowsDone += batch.length;
    state.batchesDone++;
    onProgress?.({
      table,
      rowsDone: state.rowsDone,
      rowsTotal: state.rowsTotal,
      batchesDone: state.batchesDone,
      batchesTotal: state.batchesTotal,
    });
  }
}

/**
 * Employee profiles are imported through a SECURITY DEFINER RPC.
 *
 * `user_profiles` RLS only allows INSERT for `id = auth.uid()`, so writing a
 * teammate's profile with the caller's key failed with
 * "new row violates row-level security policy for table user_profiles".
 * `public.import_employee_profiles(jsonb)` re-checks that the caller owns or
 * manages each member, then upserts as the function owner.
 *
 * The RPC also skips ids that have no `auth.users` account: a profile without
 * a login cannot sign in, so those must be created with Invite instead.
 */
async function importEmployeeProfiles(
  rows: unknown[],
  result: TableImportResult,
  onProgress?: (p: ImportProgress) => void,
  state?: {
    rowsDone: number;
    rowsTotal: number;
    batchesDone: number;
    batchesTotal: number;
  },
  options?: ImportOptions
): Promise<void> {
  if (!rows.length || !state) return;

  const keepOriginalDates = options?.keepOriginalDates !== false;

  const normal = rows
    .map((r) =>
      r && typeof r === "object"
        ? normaliseRow(r as Record<string, unknown>, "user_profiles", keepOriginalDates)
        : null
    )
    .filter((r): r is Record<string, unknown> => r !== null);

  const withId = dedupeById(normal.filter((r) => r.id));
  const withoutId = normal.filter((r) => !r.id);

  if (withoutId.length) {
    result.errors.push(
      `user_profiles: ${withoutId.length} row(s) have no id — invite the employee first`
    );
  }

  const batches = chunk(withId, BATCH_SIZE);
  state.batchesTotal += batches.length;

  for (const batch of batches) {
    const { data, error } = await supabase.rpc("import_employee_profiles", {
      p_rows: batch,
    });

    if (error) {
      const missing = /could not find the function|PGRST202|does not exist/i.test(
        error.message ?? ""
      );
      if (missing) {
        // Older deployment: fall back to RLS-safe updates. This can refresh
        // existing profiles but cannot create missing ones.
        await updateProfilesOnly(batch, result);
      } else {
        result.errors.push(`user_profiles: ${error.message}`);
      }
    } else {
      const summary = (data || {}) as {
        imported?: number;
        skipped?: number;
        errors?: { id?: string | null; error?: string }[];
      };
      result.updated += Number(summary.imported || 0);
      for (const e of summary.errors || []) {
        result.errors.push(
          `user_profiles${e.id ? ` (${e.id})` : ""}: ${e.error || "skipped"}`
        );
      }
    }

    state.rowsDone += batch.length;
    state.batchesDone++;
    onProgress?.({
      table: "user_profiles",
      rowsDone: state.rowsDone,
      rowsTotal: state.rowsTotal,
      batchesDone: state.batchesDone,
      batchesTotal: state.batchesTotal,
    });
  }
}

/** Update-only fallback for a project that has not applied
 *  `20261028000002_invite_phone_and_employee_import.sql`. RLS permits owners
 *  and managers to update member profiles, so this is safe — but it cannot
 *  insert a missing row, and says so instead of pretending. */
async function updateProfilesOnly(
  batch: Record<string, unknown>[],
  result: TableImportResult
): Promise<void> {
  for (const row of batch) {
    const id = String(row.id);
    const { id: _ignored, ...patch } = row;
    void _ignored;
    const { data, error } = await supabase
      .from("user_profiles")
      .update(patch)
      .eq("id", id)
      .select("id");

    if (error) {
      result.errors.push(`user_profiles (${id}): ${error.message}`);
    } else if (!data || data.length === 0) {
      result.errors.push(
        `user_profiles (${id}): no matching profile — apply 20261028000002 or invite the employee`
      );
    } else {
      result.updated++;
    }
  }
}

/** Import a single category from a parsed JSON payload. This is the
 *  entry point called by the Settings Data Import UI. */
export async function importData(
  category: ImportCategory,
  payload: ImportPayload,
  actor?: Actor | null,
  onProgress?: (p: ImportProgress) => void,
  options?: ImportOptions
): Promise<ImportResult> {
  const tableRows = extractRowsForCategory(payload, category);
  const results: TableImportResult[] = [];
  const state = {
    rowsDone: 0,
    rowsTotal: Object.values(tableRows).reduce((s, r) => s + r.length, 0),
    batchesDone: 0,
    batchesTotal: 0,
  };

  // Report the starting point so the UI can render a determinate bar.
  onProgress?.({
    table: Object.keys(tableRows)[0] || "",
    rowsDone: 0,
    rowsTotal: state.rowsTotal,
    batchesDone: 0,
    batchesTotal: 0,
  });

  for (const [table, rows] of Object.entries(tableRows)) {
    if (!rows.length) continue;
    const result: TableImportResult = {
      table,
      inserted: 0,
      updated: 0,
      errors: [],
      warnings: [],
    };
    if (table === "user_profiles") {
      await importEmployeeProfiles(rows, result, onProgress, state, options);
    } else {
      await importTable(table, rows, result, onProgress, state, options);
    }
    results.push(result);
  }

  const totalInserted = results.reduce((s, r) => s + r.inserted, 0);
  const totalUpdated = results.reduce((s, r) => s + r.updated, 0);
  const totalErrors = results.reduce((s, r) => s + r.errors.length, 0);
  const totalWarnings = results.reduce((s, r) => s + r.warnings.length, 0);

  // Audit trail
  await logAudit(
    actor ?? null,
    `${category}.import`,
    null,
    null,
    {
      category,
      inserted: totalInserted,
      updated: totalUpdated,
      errors: totalErrors,
      warnings: totalWarnings,
      keepOriginalDates: options?.keepOriginalDates !== false,
    }
  ).catch(() => undefined);

  return {
    category,
    results,
    totalInserted,
    totalUpdated,
    totalErrors,
    totalWarnings,
  };
}

/** How many rows a payload holds for a category — shown before the user
 *  commits, so they can see the size of what they are about to import. */
export function countImportRows(payload: ImportPayload, category: ImportCategory): number {
  return Object.values(extractRowsForCategory(payload, category)).reduce(
    (s, r) => s + r.length,
    0
  );
}

/** Parse + validate a JSON file as a PixoBooks import payload. */
export async function parseImportFile(file: File): Promise<ImportPayload> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("File is not valid JSON");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("File does not contain a JSON object");
  }

  const payload = parsed as ImportPayload;

  // Validate it looks like a PixoBooks export
  if (payload.exportedAt === undefined && payload.categories === undefined) {
    // Might be a bare rows array or a single-category payload without envelope
    if (!payload.rows) {
      throw new Error("File does not look like a PixoBooks export (missing exportedAt / rows / categories)");
    }
  }

  return payload;
}

/** Detect which import category a file carries — used so the dropdown can
 *  pre-select when the file names its category. A full multi-category backup
 *  bundle carries no single category, so it returns null and the user picks. */
export function detectImportCategory(payload: ImportPayload): ImportCategory | null {
  if (payload.categories && typeof payload.categories === "object") {
    const keys = Object.keys(payload.categories);
    if (keys.length === 1) return keys[0] as ImportCategory;
    // Full backup bundle — more than one category, let the user choose.
    return null;
  }
  if (payload.category && typeof payload.category === "string") {
    return payload.category as ImportCategory;
  }
  return null;
}
/** Measure the longest option label in a category list — used to size a
 * dropdown so it hugs its content instead of stretching to the full column
 * width. Applied to every select in the app (see settings.css `.st select`). */
export function longestCategoryLabel(
  categories: readonly { label: string }[]
): string {
  let longest = "";
  for (const c of categories) {
    if (c.label.length > longest.length) longest = c.label;
  }
  return longest;
}
