import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { mapExpense } from "@/lib/mappers";
import { getActiveBranchId, useActiveBranch } from "@/hooks/useBranches";
import { useActiveBusiness } from "@/hooks/useBusinesses";
import { withBusiness } from "@/lib/tenant";
import type { Expense } from "@/types";

export function useExpenses() {
  const branch = useActiveBranch();
  const branchId = branch === "all" ? null : branch;
  const active = useActiveBusiness();
  const businessId = active === "none" ? null : active;
  return useQuery({
    queryKey: ["expenses", businessId, branchId],
    queryFn: async () => {
      let q = supabase
        .from("expenses")
        .select("*")
        .order("expense_date", { ascending: false })
        .limit(500);
      if (businessId) q = q.eq("business_id", businessId);
      if (branchId) q = q.eq("branch_id", branchId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map(mapExpense);
    },
    refetchInterval: 30000,
  });
}

export type ExpenseInput = Partial<Expense> & {
  id?: string;
  createdBy?: string | null;
  createdByName?: string;
};

export function useUpsertExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (e: ExpenseInput) => {
      const payload: Record<string, unknown> = {
        category: e.category || "General",
        description: e.description || "",
        amount: e.amount ?? 0,
        expense_date: e.expenseDate || new Date().toISOString().slice(0, 10),
        payment_method: e.paymentMethod || "cash",
        vendor: e.vendor || null,
        notes: e.notes || null,
        updated_at: new Date().toISOString(),
      };
      if (e.id) {
        const { data, error } = await supabase
          .from("expenses")
          .update(payload)
          .eq("id", e.id)
          .select()
          .single();
        if (error) throw error;
        return mapExpense(data);
      }
      const insertPayload = withBusiness({
        ...payload,
        created_by: e.createdBy || null,
        created_by_name: e.createdByName || null,
        branch_id: getActiveBranchId(),
      });
      const { data, error } = await supabase
        .from("expenses")
        .insert(insertPayload)
        .select()
        .single();
      if (error) throw error;
      return mapExpense(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expenses"] }),
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expenses"] }),
  });
}
