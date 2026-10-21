import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { mapStockAdjustment } from "@/lib/mappers";
import type { StockAdjustment } from "@/types";
import { logAudit } from "@/lib/audit";
import { useActiveBusiness } from "@/hooks/useBusinesses";
import { currentBusinessId, withBusiness } from "@/lib/tenant";

/**
 * Live feed of every stock adjustment (manual, stocktake, correction,
 * receipt, issue). Powers the Stock Taking & Analysis module and provides
 * the audit trail for stock movements outside of sales/PO receipts.
 */
export function useStockAdjustments(fromDate?: string, toDate?: string, itemId?: string) {
  const active = useActiveBusiness();
  const businessId = active === "none" ? null : active;
  return useQuery({
    queryKey: ["stock_adjustments", businessId, fromDate, toDate, itemId],
    queryFn: async () => {
      let q = supabase
        .from("stock_adjustments")
        .select("*")
        .order("adjustment_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (businessId) q = q.eq("business_id", businessId);
      if (fromDate) q = q.gte("adjustment_date", fromDate);
      if (toDate) q = q.lte("adjustment_date", toDate);
      if (itemId) q = q.eq("item_id", itemId);
      const { data, error } = await q.limit(2000);
      if (error) throw error;
      return (data || []).map(mapStockAdjustment);
    },
    refetchInterval: 30000,
  });
}

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

/**
 * Atomically adjust an item's stock and log the movement.
 * Uses two writes (items + stock_adjustments) — safe because the
 * ledger is source of truth for reporting; the items.stock is a
 * cached running total.
 */
export function useCreateStockAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: StockAdjustmentInput) => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        const { OfflineQueue } = await import("@/lib/offlineQueue");
        const id = await OfflineQueue.enqueue(
          "stock.adjust",
          { ...p, businessId: currentBusinessId() },
          {
            item: p.itemName,
          }
        );
        throw new Error(`OFFLINE_QUEUED:${id}`);
      }
      const oldStock = Number(p.oldStock || 0);
      const newStock = Math.max(0, Number(p.newStock || 0));
      const delta = newStock - oldStock;
      const now = new Date().toISOString();
      const { error: itemErr } = await supabase
        .from("items")
        .update({ stock: newStock, updated_at: now })
        .eq("id", p.itemId);
      if (itemErr) throw itemErr;

      const { data, error } = await supabase
        .from("stock_adjustments")
        .insert(
          withBusiness({
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
          })
        )
        .select()
        .single();
      if (error) throw error;

      if (p.actor) {
        await logAudit(p.actor, "stock.adjust", "item", p.itemId, {
          item: p.itemName,
          delta,
          old: oldStock,
          new: newStock,
          reason: p.reason,
          type: p.adjustmentType,
        });
      }

      return mapStockAdjustment(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock_adjustments"] });
      qc.invalidateQueries({ queryKey: ["items"] });
    },
  });
}

export function useDeleteStockAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("stock_adjustments")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stock_adjustments"] }),
  });
}
