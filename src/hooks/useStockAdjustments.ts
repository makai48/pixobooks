import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { mapStockAdjustment } from "@/lib/mappers";
import { useActiveBusiness } from "@/hooks/useBusinesses";
import { currentBusinessId } from "@/lib/tenant";
import {
  executeStockWrite,
  type StockAdjustmentInput,
} from "@/lib/stockWrite";

export type { StockAdjustmentInput } from "@/lib/stockWrite";

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
      const rows: Record<string, unknown>[] = [];
      for (let offset = 0; offset < 1000000; offset += 1000) {
        const { data, error } = await q.range(offset, offset + 999);
        if (error) throw error;
        const page = (data || []) as Record<string, unknown>[];
        rows.push(...page);
        if (page.length < 1000) break;
      }
      return rows.map(mapStockAdjustment);
    },
    refetchInterval: 30000,
  });
}

/**
 * Atomically adjust an item's stock and log the movement.
 * The write itself lives in `lib/stockWrite` so offline replay and this hook
 * can never drift apart.
 */
export function useCreateStockAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: StockAdjustmentInput) => {
      const operationId = p.operationId ??
        (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      const prepared = { ...p, operationId };
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        const { OfflineQueue } = await import("@/lib/offlineQueue");
        const id = await OfflineQueue.enqueue(
          "stock.adjust",
          { ...prepared, businessId: p.businessId ?? currentBusinessId() },
          {
            item: p.itemName,
          }
        );
        throw new Error(`OFFLINE_QUEUED:${id}`);
      }
      return executeStockWrite(prepared);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock_adjustments"] });
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["stock_movements"] });
    },
  });
}
