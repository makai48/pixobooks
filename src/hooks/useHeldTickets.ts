import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { mapHeldTicket } from "@/lib/mappers";
import { getActiveBranchId, useActiveBranch } from "@/hooks/useBranches";
import { useActiveBusiness } from "@/hooks/useBusinesses";
import { withBusiness } from "@/lib/tenant";
import type { SaleLine } from "@/types";

/**
 * HELD TICKETS PERSISTENCE CONTRACT
 *
 * Held tickets are ONLY removed via the explicit `useDeleteHeldTicket`
 * mutation, which is wired to the two allowed user actions in the POS
 * UI: pressing the trash icon on a held ticket, and resuming a held
 * ticket into the cart. No automatic expiry, no scheduled cleanup, no
 * refetch side effect, and no navigation/mount effect deletes any
 * ticket. This behavior is contractually depended on — do not introduce
 * automatic clearing without an explicit product decision.
 */
export function useHeldTickets() {
  const branch = useActiveBranch();
  const branchId = branch === "all" ? null : branch;
  const active = useActiveBusiness();
  const businessId = active === "none" ? null : active;
  return useQuery({
    queryKey: ["held_tickets", businessId, branchId],
    queryFn: async () => {
      let q = supabase
        .from("held_tickets")
        .select("*")
        .order("created_at", { ascending: false });
      if (businessId) q = q.eq("business_id", businessId);
      if (branchId) q = q.eq("branch_id", branchId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map(mapHeldTicket);
    },
    refetchInterval: 10000,
  });
}

export type HoldInput = {
  label: string;
  cashierId: string | null;
  cashierName: string;
  customerId?: string | null;
  customerName?: string | null;
  lines: SaleLine[];
  orderDiscountPct: number;
};

export function useHoldTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: HoldInput) => {
      const { data, error } = await supabase
        .from("held_tickets")
        .insert(
          withBusiness({
            label: t.label,
            cashier_id: t.cashierId,
            cashier_name: t.cashierName,
            customer_id: t.customerId || null,
            customer_name: t.customerName || null,
            lines: t.lines,
            order_discount_pct: t.orderDiscountPct,
            branch_id: getActiveBranchId(),
          })
        )
        .select()
        .single();
      if (error) throw error;
      return mapHeldTicket(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["held_tickets"] }),
  });
}

export function useDeleteHeldTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("held_tickets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["held_tickets"] }),
  });
}
