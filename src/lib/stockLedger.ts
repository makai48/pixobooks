// Append-only stock movement ledger — the single writer for every quantity
// that enters or leaves inventory.
//
// `items.stock` is a cache maintained by `post_stock_movements` in the same
// transaction as the append, so on-hand can always be re-derived from the
// ledger. Movements are signed: negative = issue (sale, return to supplier),
// positive = receipt (PO, void, correction).
import { supabase } from "./supabase";
import { stockDeltasForLines, restoreStock } from "./pos";
import { currentBusinessId } from "./tenant";
import type { Item, Sale, SaleLine, UnitConversion } from "@/types";

export type StockMovementSource =
  | "sale"
  | "sale_void"
  | "po_receipt"
  | "po_return"
  | "adjustment"
  | "stocktake"
  | "opening";

export type StockMovementInput = {
  itemId: string;
  /** Signed base-unit quantity. */
  qtyBase: number;
  unitCost?: number | null;
  sourceType: StockMovementSource;
  /** Document id this movement belongs to (idempotency key part). */
  sourceId?: string | null;
  /** Line index inside the document (idempotency key part). */
  sourceLine?: number | null;
  occurredAt?: string;
  actorId?: string | null;
  actorName?: string | null;
  reason?: string | null;
  businessId?: string | null;
  branchId?: string | null;
};

/** JSON shape accepted by `post_stock_movements` / `commit_sale`. */
export function movementPayload(movements: StockMovementInput[]) {
  return movements
    .filter((m) => Number.isFinite(m.qtyBase) && m.qtyBase !== 0)
    .map((m) => ({
      business_id: m.businessId ?? currentBusinessId() ?? null,
      branch_id: m.branchId ?? null,
      item_id: m.itemId,
      qty_base: m.qtyBase,
      unit_cost: m.unitCost ?? null,
      source_type: m.sourceType,
      source_id: m.sourceId ?? null,
      source_line: m.sourceLine ?? 0,
      occurred_at: m.occurredAt ?? new Date().toISOString(),
      actor_id: m.actorId ?? null,
      actor_name: m.actorName ?? null,
      reason: m.reason ?? null,
    }));
}

/** Post movements atomically through the authoritative ledger RPC. */
export async function postStockMovements(
  movements: StockMovementInput[],
  opts?: { apply?: boolean }
): Promise<void> {
  const apply = opts?.apply !== false;
  const rows = movements.filter((m) => Number.isFinite(m.qtyBase) && m.qtyBase !== 0);
  if (rows.length === 0) return;

  const payload = movementPayload(rows);

  const { error } = await supabase.rpc("post_stock_movements", {
    p_movements: payload,
    p_apply: apply,
  });
  if (!error) return;

  throw error;
}

/** Sale checkout: one negative movement per affected item (BOM exploded). */
export function buildSaleMovements(opts: {
  saleId: string;
  lines: SaleLine[];
  items: Item[];
  conversions?: Pick<UnitConversion, "fromUnit" | "toUnit" | "factor">[];
  actor?: { id?: string | null; name?: string | null };
  reason?: string;
  occurredAt?: string;
  businessId?: string | null;
  branchId?: string | null;
}): StockMovementInput[] {
  const deltas = stockDeltasForLines(
    opts.lines,
    opts.items,
    opts.conversions ?? []
  );
  return deltas.map((d, i) => ({
    itemId: d.id,
    qtyBase: d.delta,
    sourceType: "sale",
    sourceId: opts.saleId,
    sourceLine: i,
    occurredAt: opts.occurredAt,
    actorId: opts.actor?.id ?? null,
    actorName: opts.actor?.name ?? null,
    reason: opts.reason ?? "Sale issued from stock",
    businessId: opts.businessId,
    branchId: opts.branchId,
  }));
}

/** Void: positive movements that put back exactly what the sale removed. */
export function buildSaleVoidMovements(opts: {
  sale: Sale;
  items: Item[];
  conversions?: Pick<UnitConversion, "fromUnit" | "toUnit" | "factor">[];
  actor?: { id?: string | null; name?: string | null };
  occurredAt?: string;
  businessId?: string | null;
}): StockMovementInput[] {
  const restored = restoreStock(
    opts.sale.lines,
    opts.items,
    opts.conversions ?? []
  );
  return restored
    .filter((r) => r.qty > 0)
    .map((r, i) => ({
      itemId: r.id,
      qtyBase: r.qty,
      sourceType: "sale_void" as const,
      sourceId: opts.sale.id,
      sourceLine: i,
      occurredAt: opts.occurredAt,
      actorId: opts.actor?.id ?? null,
      actorName: opts.actor?.name ?? null,
      reason: `Voided sale ${opts.sale.number} — stock returned`,
      businessId: opts.businessId,
    }));
}

/** Receipt: positive movements per PO line, carrying the purchase unit cost. */
export function buildReceiptMovements(opts: {
  poId: string;
  lines: { materialId: string; qty: number; unitCost: number }[];
  actor?: { id?: string | null; name?: string | null };
  reason?: string;
  occurredAt?: string;
  businessId?: string | null;
  branchId?: string | null;
}): StockMovementInput[] {
  return opts.lines
    .filter((l) => l.materialId && Number(l.qty) > 0)
    .map((l, i) => ({
      itemId: l.materialId,
      qtyBase: Number(l.qty),
      unitCost: Number(l.unitCost) || null,
      sourceType: "po_receipt" as const,
      sourceId: opts.poId,
      sourceLine: i,
      occurredAt: opts.occurredAt,
      actorId: opts.actor?.id ?? null,
      actorName: opts.actor?.name ?? null,
      reason: opts.reason ?? "PO received into stock",
      businessId: opts.businessId,
      branchId: opts.branchId,
    }));
}

/**
 * Quantity delivered by THIS receipt, per line: new cumulative receipt minus
 * what was already on the document. Never negative, so re-saving the same
 * figures cannot double-post.
 */
export function receiptDeltas(
  previous: { receivedBaseQty?: number; receivedQty?: number }[],
  incoming: { receivedBaseQty?: number; receivedQty?: number }[]
): number[] {
  return incoming.map((line, i) =>
    Math.max(
      0,
      Number(line.receivedBaseQty ?? line.receivedQty ?? 0) -
        Number(previous[i]?.receivedBaseQty ?? previous[i]?.receivedQty ?? 0)
    )
  );
}

/** True when every line has received at least its ordered base quantity. */
export function isFullyReceived(
  lines: { receivedBaseQty?: number; receivedQty?: number; orderedBaseQty?: number }[]
): boolean {
  return lines.every((l) => {
    const ordered = Number(l.orderedBaseQty ?? 0);
    if (!(ordered > 0)) return true;
    return Number(l.receivedBaseQty ?? l.receivedQty ?? 0) >= ordered;
  });
}

/* Adjustment / stock-take / opening stock: one movement for the signed delta. */
export function buildAdjustmentMovement(opts: {
  itemId: string;
  delta: number;
  sourceType: "adjustment" | "stocktake" | "opening";
  sourceId?: string | null;
  reason?: string | null;
  actor?: { id?: string | null; name?: string | null };
  occurredAt?: string;
  businessId?: string | null;
}): StockMovementInput[] {
  if (!Number.isFinite(opts.delta) || opts.delta === 0) return [];
  return [
    {
      itemId: opts.itemId,
      qtyBase: opts.delta,
      sourceType: opts.sourceType,
      sourceId: opts.sourceId ?? null,
      occurredAt: opts.occurredAt,
      actorId: opts.actor?.id ?? null,
      actorName: opts.actor?.name ?? null,
      reason: opts.reason ?? null,
      businessId: opts.businessId,
    },
  ];
}
