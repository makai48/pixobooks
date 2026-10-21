// Central UOM conversion engine — the ONLY place quantity conversion
// and UOM quantity policy live. Every feature (POS, purchases, sales,
// inventory, adjustments, transfers, returns, manufacturing, reports)
// must use this service. No independent conversion formulas allowed.
//
// Core distinction (spec §4-6):
//   convertQuantity  = pure mathematics. Fractions always allowed in the
//                      RESULT (1 Page = 0.5 Sheet for analysis).
//   validateTransactionQty = commercial/physical validity. A discrete UOM
//                      (Sheet, Piece, Box, Ream) rejects fractional
//                      TRANSACTIONS (0.5 Sheet may never be sold).
import type { Uom, UnitConversion } from "@/types";

/** Whole-number tolerance for float dust (e.g. 2.9999999997). */
export const EPS = 1e-9;
/** Relative tolerance when checking conversion-path consistency. */
export const CONSISTENCY_TOLERANCE = 1e-6;

/**
 * UOM description as the engine needs it. Full master rows always qualify;
 * lean `{code, discrete}` literals keep working where family/precision
 * data is unavailable (legacy fallback).
 */
export type UomInfo = Pick<Uom, "code" | "discrete"> &
  Partial<Pick<Uom, "categoryId" | "ratio" | "rounding" | "isActive">>;

function uomByCode(code: string, uoms: UomInfo[]): UomInfo | undefined {
  const c = normUom(code);
  return uoms.find((u) => normUom(u.code) === c);
}

export function normUom(code: unknown): string {
  return String(code ?? "").trim().toLowerCase();
}

type Edge = { to: string; factor: number };

export type UomEdge = { from: string; to: string; factor: number };

function edgesFrom(
  conversions: Pick<UnitConversion, "fromUnit" | "toUnit" | "factor">[],
  extraEdges: UomEdge[] = []
): Map<string, Edge[]> {
  const g = new Map<string, Edge[]>();
  const add = (from: string, to: string, factor: number) => {
    if (!Number.isFinite(factor) || factor <= 0) return;
    const list = g.get(from) ?? [];
    list.push({ to, factor });
    g.set(from, list);
  };
  for (const c of conversions) {
    const f = normUom(c.fromUnit);
    const t = normUom(c.toUnit);
    if (!f || !t || f === t) continue;
    if (!Number.isFinite(c.factor) || c.factor <= 0) continue;
    add(f, t, c.factor);
    add(t, f, 1 / c.factor); // reverse derived automatically (§2)
  }
  for (const e of extraEdges) {
    const f = normUom(e.from);
    const t = normUom(e.to);
    if (!f || !t || f === t) continue;
    if (!Number.isFinite(e.factor) || e.factor <= 0) continue;
    add(f, t, e.factor);
    add(t, f, 1 / e.factor);
  }
  return g;
}

export type ConversionResult = { value: number; path: string[] } | null;

/**
 * UOM family compatibility (§2, §9.1). Conversions are only meaningful
 * within one family: kg → litre is rejected even though both are numeric.
 * Families that cannot be proven (unit missing from the master, or no
 * category recorded) are treated as compatible — legacy data keeps working
 * and explicit pair rows remain the fallback.
 */
export function validateCompatibility(
  fromUOM: string,
  toUOM: string,
  uoms: UomInfo[] = []
): { compatible: boolean; reason?: string } {
  const from = normUom(fromUOM);
  const to = normUom(toUOM);
  if (!from || !to) return { compatible: false, reason: "Both units are required" };
  if (from === to) return { compatible: true };
  if (uoms.length === 0) return { compatible: true };
  const a = uomByCode(from, uoms);
  const b = uomByCode(to, uoms);
  if (!a || !b || !a.categoryId || !b.categoryId) return { compatible: true };
  if (a.categoryId !== b.categoryId) {
    return {
      compatible: false,
      reason: `${from} and ${to} belong to different UOM categories and cannot convert`,
    };
  }
  return { compatible: true };
}

/** Reference-ratio conversion (§3): value = qty × ratio(from) ÷ ratio(to). */
function convertViaReference(
  qty: number,
  from: string,
  to: string,
  uoms: UomInfo[]
): ConversionResult {
  const a = uomByCode(from, uoms);
  const b = uomByCode(to, uoms);
  if (!a || !b) return null;
  if (!a.categoryId || !b.categoryId || a.categoryId !== b.categoryId) return null;
  if (
    typeof a.ratio !== "number" ||
    typeof b.ratio !== "number" ||
    !Number.isFinite(a.ratio) ||
    !Number.isFinite(b.ratio) ||
    a.ratio <= 0 ||
    b.ratio <= 0
  ) {
    return null;
  }
  return { value: (qty * a.ratio) / b.ratio, path: [from, to] };
}

/**
 * Pure mathematical conversion (§9): verifies family compatibility, then
 * resolves via category reference ratios (§3) with pair-graph BFS as the
 * fallback for units without ratios. 1 Ream = 500 Sheets, 1 Sheet = 2
 * Pages  =>  convert(1, ream, page) = 1000.
 * Fractions in the result are FINE here — validity is enforced separately
 * by validateTransactionQty. Returns null when incompatible or unconnected.
 */
export function convertQuantity(
  qty: number,
  fromUOM: string,
  toUOM: string,
  conversions: Pick<UnitConversion, "fromUnit" | "toUnit" | "factor">[],
  extraEdges: UomEdge[] = [],
  uoms: UomInfo[] = []
): ConversionResult {
  const from = normUom(fromUOM);
  const to = normUom(toUOM);
  if (!from || !to) return null;
  if (!Number.isFinite(qty)) return null;
  if (from === to) return { value: qty, path: [from] };
  if (!validateCompatibility(from, to, uoms).compatible) return null;
  const viaRef = convertViaReference(qty, from, to, uoms);
  if (viaRef) return viaRef;
  const g = edgesFrom(conversions, extraEdges);
  // BFS for shortest path (fewest hops).
  const prev = new Map<string, { from: string; factor: number }>();
  const seen = new Set<string>([from]);
  const queue: string[] = [from];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur === to) break;
    for (const e of g.get(cur) ?? []) {
      if (seen.has(e.to)) continue;
      seen.add(e.to);
      prev.set(e.to, { from: cur, factor: e.factor });
      queue.push(e.to);
    }
  }
  if (!seen.has(to)) return null;
  // Walk back to accumulate the factor product.
  let factor = 1;
  const path: string[] = [to];
  let cur = to;
  while (cur !== from) {
    const p = prev.get(cur);
    if (!p) return null;
    factor *= p.factor;
    cur = p.from;
    path.unshift(cur);
  }
  return { value: qty * factor, path };
}

/** All units mathematically related to `code` (itself included).
 *  With master data, only family-compatible units are returned. */
export function relatedUoms(
  code: string,
  conversions: Pick<UnitConversion, "fromUnit" | "toUnit" | "factor">[],
  extraEdges: UomEdge[] = [],
  uoms: UomInfo[] = []
): string[] {
  const start = normUom(code);
  if (!start) return [];
  const g = edgesFrom(conversions, extraEdges);
  const seen = new Set<string>([start]);
  const queue: string[] = [start];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const e of g.get(cur) ?? []) {
      if (seen.has(e.to)) continue;
      if (!validateCompatibility(start, e.to, uoms).compatible) continue;
      seen.add(e.to);
      queue.push(e.to);
    }
  }
  return [...seen];
}

export function isWhole(n: number): boolean {
  if (!Number.isFinite(n)) return false;
  return Math.abs(n - Math.round(n)) < EPS;
}

function findUom(code: unknown, uoms: Pick<Uom, "code">[]): number {
  const c = normUom(code);
  return uoms.findIndex((u) => normUom(u.code) === c);
}

/**
 * Effective divisibility for a UOM code.
 * Known UOM → its master flag wins unless the item explicitly overrides
 * with allowDecimalQty (legacy per-item escape hatch).
 * Unknown UOM → legacy item flag (default integer-only, matching POS).
 */
export function isUomDiscrete(
  code: unknown,
  uoms: UomInfo[],
  itemAllowDecimalQty?: boolean
): boolean {
  const i = findUom(code, uoms);
  if (i >= 0) return uoms[i].discrete && !itemAllowDecimalQty;
  return !itemAllowDecimalQty;
}

/** Smallest transactable increment (§7): discrete → 1, else the UOM rounding. */
export function uomRounding(
  code: unknown,
  uoms: UomInfo[],
  fallback = 1
): number {
  const i = findUom(code, uoms);
  const r = i >= 0 ? uoms[i].rounding : undefined;
  if (typeof r === "number" && Number.isFinite(r) && r > 0) return r;
  if (i >= 0 && uoms[i].discrete === false) return fallback === 1 ? 0.001 : fallback;
  return 1;
}

function isMultipleOf(n: number, step: number): boolean {
  if (!(step > 0)) return true;
  const q = n / step;
  return Math.abs(q - Math.round(q)) < 1e-6;
}

export type QtyValidation = { ok: true } | { ok: false; reason: string };

/**
 * Transaction-quantity gate (§4-8). Rejects (never rounds):
 * discrete UOMs → fractions (0.5 Sheet invalid, 1 Sheet valid);
 * divisible UOMs → values violating the rounding increment.
 */
export function validateTransactionQty(
  qty: unknown,
  uomCode: string,
  uoms: UomInfo[],
  opts: { itemAllowDecimalQty?: boolean; label?: string } = {}
): QtyValidation {
  const label = opts.label || "Quantity";
  const n = typeof qty === "number" ? qty : Number(qty);
  if (!Number.isFinite(n)) return { ok: false, reason: `${label} must be a number` };
  if (n <= 0) return { ok: false, reason: `${label} must be greater than 0` };
  const code = normUom(uomCode) || "unit";
  if (isUomDiscrete(uomCode, uoms, opts.itemAllowDecimalQty)) {
    if (!isWhole(n)) {
      return {
        ok: false,
        reason: `${label} must be a whole number — ${code} is discrete (fractions like ${n} are not sellable)`,
      };
    }
    return { ok: true };
  }
  // Divisible path: a legacy per-item decimal override predates precision
  // config and keeps its historical free-decimal meaning.
  if (opts.itemAllowDecimalQty) return { ok: true };
  const step = uomRounding(uomCode, uoms);
  if (!isMultipleOf(n, step)) {
    return {
      ok: false,
      reason: `${label} must be in increments of ${step} ${code}`,
    };
  }
  return { ok: true };
}

export type ConversionProposal = {
  fromUnit: string;
  toUnit: string;
  factor: number;
  /** Row id being edited (excluded from duplicate/path checks). */
  excludeId?: string;
};

/**
 * Conversion integrity gate (§9): positive factors, no self-conversion,
 * no duplicates, no mathematically inconsistent paths.
 * 1 Ream = 500 Sheets + 1 Sheet = 2 Pages  =>  1 Ream = 900 Pages rejected
 * (expected 1000).
 */
export function validateConversionProposal(
  proposal: ConversionProposal,
  existing: (Pick<UnitConversion, "id" | "fromUnit" | "toUnit" | "factor"> & { id: string })[]
): QtyValidation {
  const from = normUom(proposal.fromUnit);
  const to = normUom(proposal.toUnit);
  if (!from || !to) return { ok: false, reason: "From and To units are required" };
  if (!Number.isFinite(proposal.factor) || proposal.factor <= 0) {
    return { ok: false, reason: "Factor must be greater than 0" };
  }
  if (from === to) return { ok: false, reason: "From and To must differ" };
  const others = existing.filter((c) => c.id !== proposal.excludeId);
  const dup = others.some(
    (c) => normUom(c.fromUnit) === from && normUom(c.toUnit) === to
  );
  if (dup) return { ok: false, reason: `${from} → ${to} already exists — edit it instead` };
  // Consistency: if a path already connects from→to, the proposed factor
  // must agree with it (reverse edges included, so A→B also checks B→A).
  const via = convertQuantity(1, from, to, others);
  if (via) {
    const expected = via.value;
    const rel = Math.abs(proposal.factor - expected) / Math.max(Math.abs(expected), EPS);
    if (rel > CONSISTENCY_TOLERANCE) {
      return {
        ok: false,
        reason: `Conflicts with existing path (${via.path.join(" → ")}): 1 ${from} = ${expected} ${to}, not ${proposal.factor} ${to}`,
      };
    }
  }
  return { ok: true };
}

/**
 * Product UOM configuration gate (§17, §23). Verifies existence, active
 * status, family compatibility, and that purchase/sale UOMs actually
 * convert into the inventory UOM. Clear messages, never silent correction.
 */
export function validateProductUomConfig(
  cfg: { purchaseUom: string; saleUom: string; baseUom: string; cost?: number },
  uoms: UomInfo[],
  conversions: Pick<UnitConversion, "fromUnit" | "toUnit" | "factor">[]
): QtyValidation {
  const purchase = normUom(cfg.purchaseUom);
  const sale = normUom(cfg.saleUom);
  const base = normUom(cfg.baseUom);
  if (!purchase || !sale || !base) {
    return { ok: false, reason: "Purchase, sales and inventory UOMs are all required" };
  }
  if (uoms.length > 0) {
    for (const [code, role] of [[purchase, "Purchase"], [sale, "Sales"], [base, "Inventory"]] as const) {
      const u = uomByCode(code, uoms);
      if (!u) return { ok: false, reason: `${role} UOM "${code}" is not in the UOM master` };
      if (u.isActive === false) {
        return { ok: false, reason: `${role} UOM "${code}" is inactive — reactivate it or pick another unit` };
      }
    }
  }
  for (const [a, b, role] of [[purchase, base, "Purchase"], [sale, base, "Sales"]] as const) {
    const compat = validateCompatibility(a, b, uoms);
    if (!compat.compatible) {
      return { ok: false, reason: `${role} UOM "${a}" is incompatible with inventory UOM "${b}" (${compat.reason})` };
    }
    const path = convertQuantity(1, a, b, conversions, [], uoms);
    if (!path || !(path.value > 0)) {
      return { ok: false, reason: `${role} UOM "${a}" has no conversion path to inventory UOM "${b}" — add a conversion first` };
    }
  }
  if (cfg.cost !== undefined && (!Number.isFinite(cfg.cost) || cfg.cost < 0)) {
    return { ok: false, reason: "Purchase cost must be zero or greater" };
  }
  return { ok: true };
}

export type DerivedCost =
  | {
      ok: true;
      /** Inventory units contained in the purchase quantity. */
      convertedQty: number;
      totalCost: number;
      /** Cost per ONE inventory unit (UGX 50/Sheet). */
      unitCost: number;
    }
  | { ok: false; reason: string };

/**
 * Automatic purchase → inventory cost derivation (§10-11, §14-15).
 * 2 Reams × UGX 25,000 with 1 Ream = 500 Sheets
 * → 1,000 Sheets, UGX 50,000 total, UGX 50/Sheet.
 * Cost-equivalence only — never authorizes fractional transactions.
 */
export function deriveInventoryCost(args: {
  purchaseQty: number;
  purchasePrice: number;
  purchaseUom: string;
  inventoryUom: string;
  conversions: Pick<UnitConversion, "fromUnit" | "toUnit" | "factor">[];
  uoms?: UomInfo[];
  extraEdges?: UomEdge[];
}): DerivedCost {
  const { purchaseQty, purchasePrice, purchaseUom, inventoryUom } = args;
  const conversions = args.conversions;
  const uoms = args.uoms ?? [];
  const extraEdges = args.extraEdges ?? [];
  if (!Number.isFinite(purchaseQty) || purchaseQty <= 0) {
    return { ok: false, reason: "Purchase quantity must be greater than 0" };
  }
  if (!Number.isFinite(purchasePrice) || purchasePrice < 0) {
    return { ok: false, reason: "Purchase cost must be zero or greater" };
  }
  const from = normUom(purchaseUom);
  const to = normUom(inventoryUom);
  if (!from || !to) return { ok: false, reason: "Purchase and inventory UOMs are required" };
  const compat = validateCompatibility(from, to, uoms);
  if (!compat.compatible) return { ok: false, reason: compat.reason || "Incompatible UOMs" };
  const conv = convertQuantity(purchaseQty, from, to, conversions, extraEdges, uoms);
  if (!conv || !(conv.value > 0)) {
    return { ok: false, reason: `No conversion path from ${from} to ${to} — add a conversion first` };
  }
  const totalCost = purchaseQty * purchasePrice;
  return { ok: true, convertedQty: conv.value, totalCost, unitCost: totalCost / conv.value };
}

export type PriceConversion =
  | { ok: true; value: number }
  | { ok: false; reason: string };

/**
 * Money-per-UOM conversion for price/cost entry (§12, §22): converts a
 * quoted price from its entry UOM into the canonical UOM (per-saleUOM
 * price, per-base cost). Same compat + reachability rules as quantities —
 * an incompatible or unconnected entry UOM is rejected, never guessed.
 */
export function convertPrice(
  price: number,
  fromUOM: string,
  toUOM: string,
  conversions: Pick<UnitConversion, "fromUnit" | "toUnit" | "factor">[],
  uoms: UomInfo[] = [],
  extraEdges: UomEdge[] = []
): PriceConversion {
  const from = normUom(fromUOM);
  const to = normUom(toUOM);
  if (!from || !to) return { ok: false, reason: "Price and cost units are required" };
  if (!Number.isFinite(price) || price < 0) {
    return { ok: false, reason: "Price must be zero or greater" };
  }
  const compat = validateCompatibility(from, to, uoms);
  if (!compat.compatible) return { ok: false, reason: compat.reason || "Incompatible UOMs" };
  // Money converts INVERSELY to quantities: if 1 box = 100 sheets, then a
  // 12,000/box price is 12,000 ÷ 100 = 120/sheet (not ×100).
  const r = convertQuantity(1, from, to, conversions, extraEdges, uoms);
  if (!r || !(r.value > 0)) {
    return { ok: false, reason: `No conversion path from ${from} to ${to} — add a conversion first` };
  }
  return { ok: true, value: price / r.value };
}

/**
 * Weighted-average inventory cost (§13 foundation): blends the new receipt
 * into existing stock by QUANTITY, not by simple mean.
 * 5,000 Sheets @ 50 + 5,000 Sheets @ 60  →  10,000 @ 55.
 * Empty shelf (or zero value on hand) falls back to the receipt's own
 * unit cost — identical to last-purchase behavior in that case.
 */
export function averageInventoryCost(args: {
  oldStock: number;
  oldCost: number;
  receivedQty: number;
  receivedUnitCost: number;
}): number {
  const stock = Math.max(0, Number(args.oldStock) || 0);
  const old = Number(args.oldCost) || 0;
  const qty = Math.max(0, Number(args.receivedQty) || 0);
  const price = Number(args.receivedUnitCost) || 0;
  if (!(qty > 0)) return old;
  if (!(stock > 0)) return price;
  return (stock * old + qty * price) / (stock + qty);
}

/** Human-readable derived relationship, e.g. "1 Ream = 500 Sheets". */
export function describeRelationship(
  fromUOM: string,
  toUOM: string,
  conversions: Pick<UnitConversion, "fromUnit" | "toUnit" | "factor">[],
  extraEdges: UomEdge[] = [],
  uoms: UomInfo[] = []
): string | null {
  const r = convertQuantity(1, fromUOM, toUOM, conversions, extraEdges, uoms);
  if (!r) return null;
  const f = normUom(fromUOM);
  const t = normUom(toUOM);
  const val = Math.abs(r.value - Math.round(r.value)) < EPS ? String(Math.round(r.value)) : String(r.value);
  return `1 ${f} = ${val} ${t}`;
}
