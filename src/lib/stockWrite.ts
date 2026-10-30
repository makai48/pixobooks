// Shared stock-adjustment writer — online hook AND offline replay share it.
import { supabase } from "./supabase";
import { mapStockAdjustment } from "./mappers";
import { logAudit } from "./audit";
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
  const built = buildStockWrite(p);
  const { error: itemErr } = await supabase
    .from("items")
    .update({ stock: built.newStock, updated_at: built.now })
    .eq("id", p.itemId);
  if (itemErr) throw itemErr;

  const { data, error } = await supabase
    .from("stock_adjustments")
    .insert(built.row)
    .select()
    .single();
  if (error) throw error;

  if (p.actor) {
    await logAudit(p.actor, "stock.adjust", "item", p.itemId, {
      item: p.itemName,
      delta: built.delta,
      old: Number(p.oldStock || 0),
      new: built.newStock,
      reason: p.reason,
      type: p.adjustmentType,
    });
  }

  return mapStockAdjustment(data);
}
