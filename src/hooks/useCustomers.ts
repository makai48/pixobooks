import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { mapCustomer } from "@/lib/mappers";
import type { Customer } from "@/types";
import { useActiveBusiness } from "@/hooks/useBusinesses";
import { withBusiness } from "@/lib/tenant";

export function useCustomers() {
  const active = useActiveBusiness();
  const businessId = active === "none" ? null : active;
  return useQuery({
    queryKey: ["customers", businessId],
    queryFn: async () => {
      let q = supabase.from("customers").select("*").order("name");
      if (businessId) q = q.eq("business_id", businessId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map(mapCustomer);
    }
  });
}

type CustomerInput = Partial<Customer> & { id?: string };

export function useUpsertCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: CustomerInput) => {
      const payload: Record<string, unknown> = {
        name: c.name,
        phone: c.phone || null,
        email: c.email || null,
        notes: c.notes || null,
        avatar_url: c.avatarUrl || null,
      };
      if (c.id) {
        const { data, error } = await supabase
          .from("customers")
          .update(payload)
          .eq("id", c.id)
          .select()
          .single();
        if (error) throw error;
        return mapCustomer(data);
      }
      const { data, error } = await supabase
        .from("customers")
        .insert(withBusiness({ ...payload, total_spent: 0, loyalty_points: 0 }))
        .select()
        .single();
      if (error) throw error;
      return mapCustomer(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers"] }),
  });
}

export function useDeleteCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers"] }),
  });
}
