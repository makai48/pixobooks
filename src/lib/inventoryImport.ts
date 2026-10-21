// Cross-shop inventory import engine (pure functions — unit-tested against real
// export files). Accepts the Settings → Export JSON shape:
//   { exportedAt, category: "inventory", count, rows: [...] } or a bare row array.
// Rows are DB-shaped (snake_case). Pictures, stock, cost, selling price and
// supplier *records* carry over; cross-shop ids never do (see below).
//
// Integrity rules:
// - Identity = normalized SKU (trimmed, case-insensitive). Duplicates inside
//   the file: last wins, warned.
// - New server-side UUIDs for every insert (source ids dropped).
// - BOM materialIds belong to the SOURCE shop: remapped via SKU in a materials-
//   first two-pass import; unresolvable lines are dropped + reported (never
//   dangling foreign ids).
// - preferred_supplier_id nulled (supplier directory isn't part of the file);
//   preferred_supplier_name + suppliers[] kept for reference.
// - image_url / image_url_base64 (offline-export key) re-uploaded to our own
//   bucket by the caller; data-URL images are handled too.

export type ImportRow = Record<string, unknown>;

export type ParsedImport = { rows: ImportRow[]; warnings: string[] };

const VALID_TYPES = ["material", "product", "ready", "intermediate"];

export function normSku(sku: unknown): string {
  return String(sku || "").trim();
}

export function parseInventoryFile(json: unknown): ParsedImport {
  const warnings: string[] = [];
  const raw: unknown = (json as { rows?: unknown } | null)?.rows ?? json;
  if (!Array.isArray(raw)) throw new Error("Not an inventory file: expected {rows:[...]} or [...]");
  const bySku = new Map<string, ImportRow>();
  raw.forEach((r: unknown, i: number) => {
    if (!r || typeof r !== "object") {
      warnings.push(`Row ${i + 1}: not an object — skipped`);
      return;
    }
    const row = r as ImportRow;
    const sku = normSku(row.sku);
    if (!sku) {
      warnings.push(`Row ${i + 1} (${String(row.name || "unnamed")}): missing SKU — skipped`);
      return;
    }
    if (!row.name || !String(row.name).trim()) {
      warnings.push(`Row ${i + 1} (${sku}): missing name — skipped`);
      return;
    }
    const key = sku.toLowerCase();
    if (bySku.has(key)) warnings.push(`${sku}: appears twice in file — last copy wins`);
    bySku.set(key, row);
  });
  return { rows: [...bySku.values()], warnings };
}

export type StockMode = "set" | "add";

export type PlannedRow =
  | { kind: "insert"; row: ImportRow }
  | { kind: "update"; id: string; row: ImportRow; existingStock: number }
  | { kind: "skip"; row: ImportRow; reason: string };

export function planImport(
  rows: ImportRow[],
  existing: { id: string; sku: string; stock: number }[],
  opts: { updateExisting: boolean; stockMode: StockMode }
): PlannedRow[] {
  const have = new Map(existing.map((e) => [normSku(e.sku).toLowerCase(), e]));
  return rows.map((row) => {
    const hit = have.get(normSku(row.sku).toLowerCase());
    if (!hit) return { kind: "insert", row };
    if (!opts.updateExisting) return { kind: "skip", row, reason: "SKU already exists" };
    return { kind: "update", id: hit.id, row, existingStock: Number(hit.stock || 0) };
  });
}

export function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function toItemPayload(
  row: ImportRow,
  opts: { stock: number; imageUrl: string | null; selectedColumns?: Set<string> }
): Record<string, unknown> {
  const rawType = typeof row.item_type === "string" ? row.item_type : "product";
  const itemType = VALID_TYPES.includes(rawType) ? rawType : "product";
  const isMaterial = itemType === "material" || itemType === "intermediate";
  
  const allFields: Record<string, unknown> = {
    sku: normSku(row.sku),
    barcode: row.barcode || null,
    name: String(row.name),
    category: row.category || "General",
    price: num(row.price),
    cost: num(row.cost),
    stock: Math.max(0, opts.stock),
    base_unit: row.base_unit || "pc",
    units: Array.isArray(row.units) ? row.units : [],
    bom: null, // set in pass 2 after SKU→id remap (see remapBom)
    is_material: row.is_material !== undefined ? !!row.is_material : isMaterial,
    item_type: itemType,
    image_url: opts.imageUrl,
    suppliers: Array.isArray(row.suppliers) ? row.suppliers : [],
    emoji: row.emoji || null,
    low_stock_threshold: num(row.low_stock_threshold, 10),
    allow_decimal_qty: !!row.allow_decimal_qty,
    purchase_unit: row.purchase_unit || row.base_unit || "pc",
    sale_unit: row.sale_unit || row.base_unit || "pc",
    preferred_supplier_id: null,
    preferred_supplier_name: row.preferred_supplier_name || null,
    updated_at: new Date().toISOString(),
  };

  if (!opts.selectedColumns) return allFields;

  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(allFields)) {
    if (opts.selectedColumns.has(key)) {
      filtered[key] = value;
    }
  }
  return filtered;
}

export type BomRemap = { bom: { materialId: string; qty: number }[]; dropped: number };

/** Remap source-shop BOM materialIds to OUR ids via SKU lookup. */
export function remapBom(
  row: ImportRow,
  skuToId: Map<string, string>,
  allRowsById: Map<string, ImportRow>
): BomRemap {
  const lines = Array.isArray(row.bom) ? (row.bom as Record<string, unknown>[]) : [];
  const bom: BomRemap["bom"] = [];
  let dropped = 0;
  for (const line of lines) {
    const ln = (line ?? {}) as Record<string, unknown>;
    const qty = num(ln.qty);
    if (!(qty > 0)) {
      dropped++;
      continue;
    }
    const srcMat = allRowsById.get(String(ln.materialId || ""));
    const sku = srcMat ? normSku(srcMat.sku).toLowerCase() : "";
    const targetId = sku ? skuToId.get(sku) : undefined;
    if (!targetId) {
      dropped++;
      continue;
    }
    const extra: Record<string, unknown> = {};
    if (ln.unit) extra.unit = ln.unit;
    bom.push({ materialId: targetId, qty, ...extra });
  }
  return { bom: bom.length ? bom : [], dropped };
}

/** Split rows so materials land before BOM products (single-level is enough:
 *  products consume materials, never other products, in this schema). */
export function orderForImport(rows: ImportRow[]): { materials: ImportRow[]; products: ImportRow[] } {
  const materials: ImportRow[] = [];
  const products: ImportRow[] = [];
  for (const r of rows) {
    const bomVal = r.bom;
    const hasBom = Array.isArray(bomVal) && (bomVal as unknown[]).length > 0;
    const t = r.item_type;
    if (!hasBom && (t === "material" || t === "intermediate")) materials.push(r);
    else if (!hasBom) materials.push(r); // ready items have no deps: early too
    else products.push(r);
  }
  return { materials, products };
}

export function isHttpUrl(u: unknown): u is string {
  return typeof u === "string" && /^https?:\/\//i.test(u);
}

export function isDataUrl(u: unknown): u is string {
  return typeof u === "string" && u.startsWith("data:image/");
}

export function dataUrlToFile(dataUrl: string, name = "image.png"): File | null {
  try {
    const [head, b64] = dataUrl.split(",");
    const mime = /data:(.*?);/.exec(head)?.[1] || "image/png";
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], name, { type: mime });
  } catch {
    return null;
  }
}
