import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { mapStandingOrder } from "@/lib/mappers";
import type { StandingOrder } from "@/types";
import { useActiveBusiness } from "@/hooks/useBusinesses";
import { withBusiness } from "@/lib/tenant";

export function useStandingOrders() {
  const active = useActiveBusiness();
  const businessId = active === "none" ? null : active;
  return useQuery({
    queryKey: ["standing_orders", businessId],
    queryFn: async () => {
      let q = supabase
        .from("standing_orders")
        .select("*")
        .order("next_run_date", { ascending: true, nullsFirst: false });
      if (businessId) q = q.eq("business_id", businessId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map(mapStandingOrder);
    },
    refetchInterval: 60000,
  });
}

export type StandingOrderInput = Partial<StandingOrder> & { id?: string };

export function useUpsertStandingOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: StandingOrderInput) => {
      const payload: Record<string, unknown> = {
        kind: p.kind || "standing",
        name: p.name || "",
        amount: Number(p.amount || 0),
        currency: p.currency || "USD",
        frequency: p.frequency || "monthly",
        next_run_date: p.nextRunDate || null,
        payee: p.payee || null,
        account: p.account || null,
        category: p.category || "General",
        active: p.active !== false,
        loan_principal: p.loanPrincipal ?? null,
        loan_balance: p.loanBalance ?? null,
        loan_rate: p.loanRate ?? null,
        loan_term_months: p.loanTermMonths ?? null,
        notes: p.notes || null,
        updated_at: new Date().toISOString(),
      };
      if (p.id) {
        const { data, error } = await supabase
          .from("standing_orders")
          .update(payload)
          .eq("id", p.id)
          .select()
          .single();
        if (error) throw error;
        return mapStandingOrder(data);
      }
      const insertPayload = withBusiness({ ...payload, created_by: p.createdBy || null });
      const { data, error } = await supabase
        .from("standing_orders")
        .insert(insertPayload)
        .select()
        .single();
      if (error) throw error;
      return mapStandingOrder(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["standing_orders"] }),
  });
}

export function useDeleteStandingOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("standing_orders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["standing_orders"] }),
  });
}
