// Shared stock-adjustment writer — online hook AND offline replay share it.
import { supabase } from "./supabase";
import { mapStockAdjustment } from "./mappers";
import { currentBusinessId } from "./tenant";
import type { StockAdjustment } from "@/types";

export type StockAdjustmentInput = {
  itemId: string;
  itemName: string;
  newStock: number;
  oldStock: number;
  reason?: string | null;
  adjustmentType?: StockAdjustment["adjustmentType"];
  adjustmentDate?: string;
  actor?: { id: string; name: string; role?: string };
  /** Business captured when the adjustment was started (offline replay). */
  businessId?: string | null;
  /** Stable operation identity across retries/offline replay. */
  operationId?: string;
};

export type BuiltStockAdjustment = {
  row: Record<string, unknown>;
  newStock: number;
  delta: number;
  now: string;
};

export function buildStockWrite(p: StockAdjustmentInput): BuiltStockAdjustment {
  const oldStock = Number(p.oldStock || 0);
  const newStock = Math.max(0, Number(p.newStock || 0));
  const delta = newStock - oldStock;
  const now = new Date().toISOString();
  return {
    row: {
      business_id: p.businessId ?? currentBusinessId() ?? undefined,
      item_id: p.itemId,
      item_name: p.itemName,
      adjustment_type: p.adjustmentType || "manual",
      qty_change: delta,
      old_stock: oldStock,
      new_stock: newStock,
      reason: p.reason || null,
      adjustment_date: p.adjustmentDate || new Date().toISOString().slice(0, 10),
      created_by: p.actor?.id || null,
      created_by_name: p.actor?.name || null,
    },
    newStock,
    delta,
    now,
  };
}

export async function executeStockWrite(p: StockAdjustmentInput): Promise<StockAdjustment> {
  const operationId = p.operationId ??
    (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const { data, error } = await supabase.rpc("adjust_stock", {
    p_item_id: p.itemId,
    p_new_stock: Math.max(0, Number(p.newStock || 0)),
    p_reason: p.reason ?? null,
    p_adjustment_type: p.adjustmentType || "manual",
    p_effective_at: p.adjustmentDate
      ? `${p.adjustmentDate}T00:00:00.000Z`
      : new Date().toISOString(),
    p_operation_id: operationId,
    p_actor_id: p.actor?.id ?? null,
    p_actor_name: p.actor?.name ?? null,
  });
  if (error) throw error;
  return mapStockAdjustment(data as Record<string, unknown>);
}
