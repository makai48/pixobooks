// UOM dependency inspection (§10) — what references a unit, and remapping.
// Text-code references (legacy columns) and FK id references are both
// honored so checks work before and after the id backfill.
// NOTE: sales/PO line references are HISTORICAL data — they are counted
// but never remapped (history stays immutable); units with line history
// can only be deactivated, never hard-deleted.
import { supabase } from "./supabase";
import { normUom } from "./uom";
import { currentBusinessId } from "./tenant";

export type UomDependencyCounts = {
  items: number;
  conversions: number;
  purchaseLines: number;
  salesLines: number;
  adjustments: number;
};

const ZERO: UomDependencyCounts = {
  items: 0,
  conversions: 0,
  purchaseLines: 0,
  salesLines: 0,
  adjustments: 0,
};

/** Bounded client scan: recent rows only (deletion is a rare admin op). */
const HISTORY_SCAN_LIMIT = 5000;

async function uomCodeFor(id: string): Promise<string | null> {
  const businessId = currentBusinessId();
  let q = supabase.from("uoms").select("code").eq("id", id);
  if (businessId) q = q.eq("business_id", businessId);
  const { data } = await q.maybeSingle();
  const code = (data as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : null;
}

async function countHead(table: string, orFilter: string): Promise<number> {
  try {
    const businessId = currentBusinessId();
    let q = supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .or(orFilter);
    if (businessId) q = q.eq("business_id", businessId);
    const { count, error } = await q;
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

/** Count JSONB `units[]` entries ({code,...}) containing the code. */
async function countItemUnitArrays(code: string): Promise<number> {
  try {
    const businessId = currentBusinessId();
    let q = supabase.from("items").select("id").contains("units", [{ code }]);
    if (businessId) q = q.eq("business_id", businessId);
    const { data, error } = await q;
    if (error) return 0;
    return (data || []).length;
  } catch {
    return 0;
  }
}

/** Count PO/sale line entries whose `unit` equals the code (history scan). */
async function countLineRefs(
  table: "purchase_orders" | "sales",
  code: string
): Promise<number> {
  try {
    const businessId = currentBusinessId();
    let q = supabase.from(table).select("lines").limit(HISTORY_SCAN_LIMIT);
    if (businessId) q = q.eq("business_id", businessId);
    const { data, error } = await q;
    if (error || !data) return 0;
    let n = 0;
    for (const row of data as { lines?: unknown }[]) {
      const lines = (row as { lines?: unknown }).lines;
      if (!Array.isArray(lines)) continue;
      for (const l of lines as { unit?: unknown }[]) {
        if (typeof l?.unit === "string" && normUom(l.unit) === code) n++;
      }
    }
    return n;
  } catch {
    return 0;
  }
}

export async function findUomDependencies(uomId: string): Promise<UomDependencyCounts> {
  const code = normUom(await uomCodeFor(uomId));
  if (!code) return { ...ZERO };
  const [scalarItems, arrayItems, conversions, purchaseLines, salesLines] =
    await Promise.all([
      countHead(
        "items",
        `base_unit.ilike.${code},purchase_unit.ilike.${code},sale_unit.ilike.${code},` +
          `base_uom_id.eq.${uomId},purchase_uom_id.eq.${uomId},sale_uom_id.eq.${uomId}`
      ),
      countItemUnitArrays(code),
      countHead(
        "unit_conversions",
        `from_unit.ilike.${code},to_unit.ilike.${code},` +
          `from_uom_id.eq.${uomId},to_uom_id.eq.${uomId}`
      ),
      countLineRefs("purchase_orders", code),
      countLineRefs("sales", code),
    ]);
  return {
    items: scalarItems + arrayItems,
    conversions,
    purchaseLines,
    salesLines,
    // stock_adjustments carry absolute stock numbers, never UOM codes.
    adjustments: 0,
  };
}

/** True when any HISTORICAL (immutable) record references the unit. */
export function hasHistoryDeps(d: UomDependencyCounts): boolean {
  return d.purchaseLines > 0 || d.salesLines > 0;
}

/**
 * Remap master-data references (items + conversions) to a replacement
 * unit code. Historical lines are never touched — callers must refuse
 * hard-delete when hasHistoryDeps() is true.
 */
export async function remapUomReferences(uomId: string, replacementCode: string): Promise<void> {
  const code = normUom(await uomCodeFor(uomId));
  const replacement = normUom(replacementCode);
  if (!code || !replacement || code === replacement) {
    throw new Error("Valid replacement unit required");
  }
  const businessId = currentBusinessId();
  let repQ = supabase.from("uoms").select("id").eq("code", replacement);
  if (businessId) repQ = repQ.eq("business_id", businessId);
  const { data: rep } = await repQ.maybeSingle();
  const repId = (rep as { id?: unknown } | null)?.id as string | undefined;
  if (!repId) throw new Error(`Replacement unit "${replacement}" not found`);
  const scalarCols = ["base_unit", "purchase_unit", "sale_unit"] as const;
  for (const col of scalarCols) {
    let q = supabase.from("items").update({ [col]: replacement }).ilike(col, code);
    if (businessId) q = q.eq("business_id", businessId);
    const { error } = await q;
    if (error) throw error;
  }
  const idCols = ["base_uom_id", "purchase_uom_id", "sale_uom_id"] as const;
  for (const col of idCols) {
    let q = supabase.from("items").update({ [col]: repId }).eq(col, uomId);
    if (businessId) q = q.eq("business_id", businessId);
    const { error } = await q;
    if (error) throw error;
  }
  let fromQ = supabase
    .from("unit_conversions")
    .update({ from_unit: replacement, from_uom_id: repId })
    .ilike("from_unit", code);
  if (businessId) fromQ = fromQ.eq("business_id", businessId);
  const { error: convErr } = await fromQ;
  if (convErr) throw convErr;
  let toQ = supabase
    .from("unit_conversions")
    .update({ to_unit: replacement, to_uom_id: repId })
    .ilike("to_unit", code);
  if (businessId) toQ = toQ.eq("business_id", businessId);
  const { error: convErr2 } = await toQ;
  if (convErr2) throw convErr2;
}
