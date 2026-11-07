import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useActiveBusiness } from "@/hooks/useBusinesses";
import type { StockMovement, StockMovementSourceType } from "@/types";

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function mapMovement(r: Record<string, unknown>): StockMovement {
  return {
    id: String(r.id),
    itemId: r.item_id == null ? null : String(r.item_id),
    qtyBase: num(r.qty_base),
    unitCost: r.unit_cost == null ? null : num(r.unit_cost),
    sourceType: (r.source_type as StockMovementSourceType) || "adjustment",
    sourceId: (r.source_id as string | null) ?? null,
    sourceLine: num(r.source_line),
    occurredAt: String(r.occurred_at ?? r.created_at ?? ""),
    actorId: (r.actor_id as string | null) ?? null,
    actorName: (r.actor_name as string | null) ?? null,
    reason: (r.reason as string | null) ?? null,
    reversalOf: (r.reversal_of as string | null) ?? null,
    createdAt: String(r.created_at ?? r.occurred_at ?? ""),
  };
}

/**
 * Recent entries from the stock movement ledger, newest first. Resolves to an
 * empty list when the ledger table has not been migrated yet, so the pages
 * that surface it keep working on older deployments.
 */
/** Pass limit=0 for a complete paged ledger (used by reconciliation). */
export function useStockMovements(limit = 200, itemId?: string) {
  const active = useActiveBusiness();
  const businessId = active === "none" ? null : active;
  return useQuery({
    queryKey: ["stock_movements", businessId, limit, itemId ?? "all"],
    queryFn: async () => {
      const pageSize = 1000;
      const rows: Record<string, unknown>[] = [];
      for (let from = 0; limit === 0 || from < limit; from += pageSize) {
        let q = supabase
          .from("stock_movements")
          .select("*")
          .order("occurred_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, limit === 0 ? from + pageSize - 1 : Math.min(from + pageSize, limit) - 1);
        if (businessId) q = q.or(`business_id.eq.${businessId},business_id.is.null`);
        if (itemId) q = q.eq("item_id", itemId);
        const { data, error } = await q;
        if (error) {
          const missing = /relation .* does not exist|42P01|PGRST205/i.test(error.message ?? "");
          if (missing) {
            if (limit === 0) throw new Error("Stock ledger is not installed; reconciliation is unavailable");
            return [] as StockMovement[];
          }
          throw error;
        }
        const page = (data || []) as Record<string, unknown>[];
        rows.push(...page);
        if (page.length < pageSize) break;
      }
      return rows.map(mapMovement);
    },
    // Small pages refresh often; the large ledger feed used for period
    // reconciliation refreshes rarely to keep mobile pages light.
    refetchInterval: limit > 0 && limit <= 200 ? 60000 : 300000,
  });
}

export function useStockLedgerActivation() {
  const active = useActiveBusiness();
  const businessId = active === "none" ? null : active;
  return useQuery({
    queryKey: ["stock_ledger_activation", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      if (!businessId) return null;
      const { data, error } = await supabase
        .from("stock_ledger_config")
        .select("activated_at")
        .eq("business_id", businessId)
        .maybeSingle();
      if (error) {
        const missing = /relation .* does not exist|42P01|PGRST205/i.test(error.message ?? "");
        if (missing) return null;
        throw error;
      }
      return (data?.activated_at as string | null) ?? null;
    },
  });
}
