import type { Item, SaleLine, Settings, UnitConversion } from "@/types";

export function computeItemCost(item: Item, allItems: Item[]): number {
  if (item.bom && item.bom.length > 0) {
    return item.bom.reduce((sum, line) => {
      const mat = allItems.find((i) => i.id === line.materialId);
      if (!mat) return sum;
      return sum + mat.cost * line.qty;
    }, 0);
  }
  return item.cost || 0;
}

export type Totals = {
  subtotal: number;
  lineDiscountTotal: number;
  orderDiscountValue: number;
  tax: number;
  total: number;
};

export function computeTotals(
  lines: SaleLine[],
  orderDiscountPct: number,
  settings: Pick<Settings, "taxRate">,
  loyaltyRedeemValue = 0
): Totals {
  const subtotal = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const lineDiscountTotal = lines.reduce(
    (s, l) => s + l.qty * l.unitPrice * (l.discountPct / 100),
    0
  );
  const afterLine = subtotal - lineDiscountTotal;
  const orderDiscountValue = afterLine * (orderDiscountPct / 100);
  const afterDiscounts = Math.max(0, afterLine - orderDiscountValue - loyaltyRedeemValue);
  const tax = afterDiscounts * (settings.taxRate / 100);
  const total = afterDiscounts + tax;
  return { subtotal, lineDiscountTotal, orderDiscountValue, tax, total };
}

export function computeCartCost(lines: SaleLine[], allItems: Item[]): number {
  return lines.reduce((sum, line) => {
    const it = allItems.find((i) => i.id === line.itemId);
    if (!it) return sum;
    return sum + computeItemCost(it, allItems) * line.qty;
  }, 0);
}

/**
 * Compute the maximum number of finished units producible from an
 * item's BOM given the current stock of each component.
 *
 *   For every BOM line:  possible = floor(materialStock / qtyRequired)
 *   The producible qty is the MINIMUM across all lines (limiting item).
 *   Returns 0 if any component is missing, out of stock, or insufficient.
 *   Never returns fractions or negatives. Prevents division-by-zero.
 */
export type ProducibleResult = {
  qty: number;                       // integer producible units
  limiting?: { materialId: string; name: string }; // limiting component if any
};
export function producibleFromBOM(item: Item, allItems: Item[]): ProducibleResult {
  if (!item.bom || item.bom.length === 0) return { qty: 0 };
  let minQty = Number.POSITIVE_INFINITY;
  let limiting: { materialId: string; name: string } | undefined = undefined;
  for (const line of item.bom) {
    const need = Number(line.qty || 0);
    if (!(need > 0)) {
      // Invalid required qty → skip (treat as no requirement)
      continue;
    }
    const mat = allItems.find((i) => i.id === line.materialId);
    if (!mat) {
      return { qty: 0, limiting: { materialId: line.materialId, name: "Missing material" } };
    }
    const stock = Math.max(0, Number(mat.stock || 0));
    const possible = Math.floor(stock / need);
    if (possible < minQty) {
      minQty = possible;
      limiting = { materialId: mat.id, name: mat.name };
    }
    if (possible <= 0) {
      return { qty: 0, limiting: { materialId: mat.id, name: mat.name } };
    }
  }
  if (!isFinite(minQty)) return { qty: 0 };
  return { qty: Math.max(0, Math.floor(minQty)), limiting };
}

export function decrementStock(
  lines: SaleLine[],
  allItems: Item[],
  conversions: Pick<UnitConversion, "fromUnit" | "toUnit" | "factor">[] = []
): { id: string; newStock: number }[] {
  // Single source of truth: the same signed deltas the stock ledger posts.
  // This keeps the legacy "new balance" helper from drifting away from what
  // checkout actually writes (it clamps only because a display balance has no
  // negative state — the ledger keeps the true signed quantity).
  return stockDeltasForLines(lines, allItems, conversions).map(({ id, delta }) => {
    const item = allItems.find((i) => i.id === id);
    return { id, newStock: Math.max(0, (item?.stock ?? 0) + delta) };
  });
}

/**
 * Unclamped, signed quantities a sale removes from inventory, one entry per
 * affected item (BOM components included). This is the value that goes into
 * the stock_movements ledger; `decrementStock` keeps the legacy clamped
 * "new balance" shape for callers that still need it.
 */
export function stockDeltasForLines(
  lines: SaleLine[],
  allItems: Item[],
  conversions: Pick<UnitConversion, "fromUnit" | "toUnit" | "factor">[] = []
): { id: string; delta: number }[] {
  const toBase = (qty: number, fromUOM: string | undefined, it: Item, fallback: string): number => {
    const from = fromUOM || fallback;
    if (normUom(from) === normUom(it.baseUnit)) return qty;
    const edges = (it.units || [])
      .filter((u) => Number.isFinite(u.ratio) && u.ratio > 0)
      .map((u) => ({ from: u.code, to: it.baseUnit, factor: u.ratio }));
    return convertQuantity(qty, from, it.baseUnit, conversions, edges)?.value ?? qty;
  };
  const deltas = new Map<string, number>();
  const take = (id: string, qty: number) => {
    if (!(qty > 0)) return;
    deltas.set(id, (deltas.get(id) ?? 0) - qty);
  };
  for (const line of lines) {
    const item = allItems.find((i) => i.id === line.itemId);
    if (!item) continue;
    const stampedFactor = Number(line.unitFactor);
    const baseQty =
      Number.isFinite(stampedFactor) && stampedFactor > 0
        ? line.qty * stampedFactor
        : toBase(line.qty, line.unit || item.saleUnit || undefined, item, item.baseUnit);
    if (item.bom && item.bom.length) {
        for (const b of item.bom) {
          const mat = allItems.find((i) => i.id === b.materialId);
          if (mat) take(mat.id, toBase(b.qty * baseQty, b.unit, mat, mat.baseUnit));
      }
      if (item.itemType === "intermediate") take(item.id, baseQty);
    } else {
      take(item.id, baseQty);
    }
  }
  return [...deltas.entries()].map(([id, delta]) => ({ id, delta }));
}

/**
 * Inverse of `decrementStock`: quantity to ADD back to `items.stock` when a
 * sale is voided. Mirrors the checkout rules exactly (line unit → base unit,
 * BOM exploded into its components, tracked intermediates included) so the
 * restoration cannot drift from the original deduction. Uses the sale line's
 * stamped `unitFactor` when present, so a later conversion-table edit cannot
 * change what a historical void restores.
 */
export function restoreStock(
  lines: SaleLine[],
  allItems: Item[],
  conversions: Pick<UnitConversion, "fromUnit" | "toUnit" | "factor">[] = []
): { id: string; newStock: number; qty: number }[] {
  const toBase = (qty: number, fromUOM: string | undefined, it: Item, fallback: string): number => {
    const from = fromUOM || fallback;
    if (normUom(from) === normUom(it.baseUnit)) return qty;
    const edges = (it.units || [])
      .filter((u) => Number.isFinite(u.ratio) && u.ratio > 0)
      .map((u) => ({ from: u.code, to: it.baseUnit, factor: u.ratio }));
    return convertQuantity(qty, from, it.baseUnit, conversions, edges)?.value ?? qty;
  };
  const updates = new Map<string, number>();
  const bump = (item: Item, qty: number) => {
    if (!(qty > 0)) return;
    const curr = updates.get(item.id) ?? item.stock;
    updates.set(item.id, curr + qty);
  };
  for (const line of lines) {
    const item = allItems.find((i) => i.id === line.itemId);
    if (!item) continue;
    const factor = Number(line.unitFactor);
    const baseQty =
      Number.isFinite(factor) && factor > 0
        ? line.qty * factor
        : toBase(line.qty, line.unit || item.saleUnit || undefined, item, item.baseUnit);
    if (item.bom && item.bom.length) {
      for (const b of item.bom) {
        const mat = allItems.find((i) => i.id === b.materialId);
          if (mat) bump(mat, toBase(b.qty * baseQty, b.unit, mat, mat.baseUnit));
      }
      if (item.itemType === "intermediate") bump(item, baseQty);
    } else {
      bump(item, baseQty);
    }
  }
  return [...updates.entries()].map(([id, newStock]) => {
    const item = allItems.find((i) => i.id === id);
    return { id, newStock, qty: item ? newStock - item.stock : 0 };
  });
}

import { convertQuantity, normUom } from "./uom";

/**
 * Convert a quantity from one unit to another using the shop's conversion table.
 * Delegates to the central engine (lib/uom) — now multi-level with automatic
 * reverse derivation. Falls back to 1:1 if no conversion is found.
 * @deprecated Prefer convertQuantity from "@/lib/uom" for new code.
 */
export function convertUnit(
  qty: number,
  fromUnit: string,
  toUnit: string,
  conversions: Pick<UnitConversion, "fromUnit" | "toUnit" | "factor">[]
): number {
  return convertQuantity(qty, fromUnit, toUnit, conversions)?.value ?? qty;
}

/**
 * Given an item and a unit code, compute the factor to convert to its base unit.
 * Item-local `units[]` ratios participate as edges in the SAME central graph
 * (not a parallel system). Falls back to 1:1 when unconnected.
 * @deprecated Prefer convertQuantity from "@/lib/uom" for new code.
 */
export function unitFactor(
  item: Item,
  unitCode: string,
  conversions: Pick<UnitConversion, "fromUnit" | "toUnit" | "factor">[] = []
): number {
  const extra = (item.units || [])
    .filter((u) => Number.isFinite(u.ratio) && u.ratio > 0)
    .map((u) => ({ from: u.code, to: item.baseUnit, factor: u.ratio }));
  const r = convertQuantity(1, unitCode, item.baseUnit, conversions, extra);
  if (r) return r.value;
  // Legacy absolute fallback: direct local ratio match (pre-central behavior).
  const local = (item.units || []).find(
    (u) => normUom(u.code) === normUom(unitCode)
  );
  return local && Number.isFinite(local.ratio) ? local.ratio : 1;
}
