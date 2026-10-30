// Physical stock-count worksheet — download / print / upload round-trip.
//
// The inventory officer gets a sheet listing every stocked item with its
// system quantity, fills in the counted quantities (on paper or in Excel),
// and the filled file is uploaded back here. Uploaded rows become
// `stocktake` adjustments via the normal stock write path (so UOM rules,
// audit and offline queue all behave exactly like a manual adjustment).
//
// Identity = SKU (trimmed, case-insensitive), falling back to an exact
// (case-insensitive) item-name match for hand-typed sheets. A blank
// counted cell means "not counted" — the row is skipped, never zeroed.

export const WORKSHEET_HEADERS = [
  "SKU",
  "Item",
  "Category",
  "Unit",
  "System Qty",
  "Counted Qty",
  "Notes",
] as const;

export type WorksheetItem = {
  id: string;
  sku: string;
  name: string;
  category: string;
  baseUnit: string;
  stock: number;
};

export function buildWorksheetRows(items: WorksheetItem[]): string[][] {
  return items.map((i) => [
    i.sku,
    i.name,
    i.category,
    i.baseUnit,
    String(Number(i.stock || 0)),
    "",
    "",
  ]);
}

function csvCell(v: string): string {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

export function worksheetToCsv(rows: string[][]): string {
  return [WORKSHEET_HEADERS.join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n");
}

/** Minimal RFC-4180 reader: quoted cells, escaped quotes, commas and
 *  CRLF inside quotes. Returns rows of raw cell strings (header included). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let i = 0;
  const pushCell = () => {
    row.push(cell);
    cell = "";
  };
  const pushRow = () => {
    // Skip the trailing empty row a final newline would create.
    if (!(row.length === 1 && row[0] === "")) rows.push(row);
    row = [];
  };
  const s = String(text || "").replace(/^\uFEFF/, "");
  while (i < s.length) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i += 2;
        } else {
          quoted = false;
          i++;
        }
      } else {
        cell += ch;
        i++;
      }
    } else if (ch === '"') {
      quoted = true;
      i++;
    } else if (ch === ",") {
      pushCell();
      i++;
    } else if (ch === "\r" || ch === "\n") {
      pushCell();
      pushRow();
      if (ch === "\r" && s[i + 1] === "\n") i += 2;
      else i++;
    } else {
      cell += ch;
      i++;
    }
  }
  pushCell();
  pushRow();
  return rows;
}

export type WorksheetPlan = {
  /** Rows that resolve to an item with a numeric counted quantity. */
  planned: { item: WorksheetItem; counted: number; delta: number; note: string }[];
  /** Rows with a blank counted cell — not counted, skipped silently. */
  skippedBlank: number;
  /** Rows whose SKU/name matches nothing in the catalog. */
  unknown: string[];
  /** Rows with an unusable counted value. */
  invalid: { ref: string; reason: string }[];
  /** Duplicate SKU lines in the file (last copy wins). */
  duplicates: string[];
};

function headerIndex(header: string[], names: string[]): number {
  const norm = (v: string) => String(v || "").trim().toLowerCase();
  for (const n of names) {
    const ix = header.findIndex((h) => norm(h) === n);
    if (ix >= 0) return ix;
  }
  return -1;
}

/** Match uploaded rows to catalog items. Pure — safe to unit test against
 *  real export files. `countedAt` is informational only; the caller stamps
 *  the adjustment date at apply time from the live item stock. */
export function planWorksheetUpload(
  rows: string[][],
  items: WorksheetItem[]
): WorksheetPlan {
  const plan: WorksheetPlan = {
    planned: [],
    skippedBlank: 0,
    unknown: [],
    invalid: [],
    duplicates: [],
  };
  if (rows.length === 0) return plan;

  const header = rows[0].map((h) => String(h || ""));
  const hasHeader = header.some((h) =>
    ["sku", "item", "counted qty", "counted", "system qty"].includes(h.trim().toLowerCase())
  );
  const body = hasHeader ? rows.slice(1) : rows;
  // Positional fallback matches buildWorksheetRows column order.
  const skuIx = hasHeader ? headerIndex(header, ["sku"]) : 0;
  const nameIx = hasHeader ? headerIndex(header, ["item", "item name", "name"]) : 1;
  const countedIx = hasHeader ? headerIndex(header, ["counted qty", "counted", "count"]) : 5;
  const notesIx = hasHeader ? headerIndex(header, ["notes", "note", "reason"]) : 6;

  const bySku = new Map(items.map((it) => [String(it.sku || "").trim().toLowerCase(), it]));
  // Name fallback is punctuation-insensitive ("Black Ink 1L" matches
  // "Black Ink, 1L") because officers hand-type these sheets.
  const normName = (v: unknown) => String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const byName = new Map(items.map((it) => [normName(it.name), it]));
  const seen = new Set<string>();

  body.forEach((cells, r) => {
    const lineNo = r + (hasHeader ? 2 : 1);
    const sku = String(cells[skuIx >= 0 ? skuIx : 0] ?? "").trim();
    const name = String(cells[nameIx >= 0 ? nameIx : 1] ?? "").trim();
    const countedRaw = String(cells[countedIx >= 0 ? countedIx : 5] ?? "").trim();
    const note = String(cells[notesIx >= 0 ? notesIx : 6] ?? "").trim();
    const ref = sku || name || `line ${lineNo}`;

    if (!sku && !name && !countedRaw && !note) return; // stray empty line
    if (countedRaw === "") {
      plan.skippedBlank++;
      return;
    }
    const item =
      (sku && bySku.get(sku.toLowerCase())) ||
      (name && byName.get(normName(name))) ||
      null;
    if (!item) {
      plan.unknown.push(ref);
      return;
    }
    const counted = Number(countedRaw);
    if (!Number.isFinite(counted) || counted < 0) {
      plan.invalid.push({ ref, reason: `"${countedRaw}" is not a valid quantity` });
      return;
    }
    const key = item.id;
    if (seen.has(key)) {
      if (!plan.duplicates.includes(item.sku)) plan.duplicates.push(item.sku);
      const prev = plan.planned.findIndex((p) => p.item.id === key);
      if (prev >= 0) plan.planned.splice(prev, 1);
    }
    seen.add(key);
    plan.planned.push({
      item,
      counted,
      delta: counted - Number(item.stock || 0),
      note,
    });
  });

  return plan;
}
