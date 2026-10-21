import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { mapLoyaltyTx } from "@/lib/mappers";
import { useActiveBusiness } from "@/hooks/useBusinesses";
import { withBusiness } from "@/lib/tenant";

export function useLoyaltyTransactions(customerId?: string) {
  const active = useActiveBusiness();
  const businessId = active === "none" ? null : active;
  return useQuery({
    queryKey: ["loyalty", businessId, customerId || "all"],
    queryFn: async () => {
      let q = supabase
        .from("loyalty_transactions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (businessId) q = q.eq("business_id", businessId);
      if (customerId) q = q.eq("customer_id", customerId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map(mapLoyaltyTx);
    },
    refetchInterval: 30000,
  });
}

export function useAdjustLoyalty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      customerId,
      points,
      type,
      notes,
      createdBy,
    }: {
      customerId: string;
      points: number;
      type: "earn" | "redeem" | "adjust";
      notes?: string;
      createdBy?: string | null;
    }) => {
      const { data: cust } = await supabase
        .from("customers")
        .select("loyalty_points")
        .eq("id", customerId)
        .single();
      if (cust) {
        const newPoints = Math.max(0, Number(cust.loyalty_points || 0) + points);
        await supabase
          .from("customers")
          .update({ loyalty_points: newPoints })
          .eq("id", customerId);
      }
      const { error } = await supabase.from("loyalty_transactions").insert(
        withBusiness({
          customer_id: customerId,
          points,
          type,
          notes: notes || null,
          created_by: createdBy || null,
        })
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loyalty"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}
