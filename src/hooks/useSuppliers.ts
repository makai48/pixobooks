import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { mapSupplier } from "@/lib/mappers";
import type { SupplierRecord } from "@/types";
import { useActiveBusiness } from "@/hooks/useBusinesses";
import { withBusiness } from "@/lib/tenant";

export function useSuppliers() {
  const active = useActiveBusiness();
  const businessId = active === "none" ? null : active;
  return useQuery({
    queryKey: ["suppliers", businessId],
    queryFn: async () => {
      let q = supabase.from("suppliers").select("*").order("name");
      if (businessId) q = q.eq("business_id", businessId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map(mapSupplier);
    },
    refetchInterval: 30000,
  });
}

type UpsertSupplier = Partial<SupplierRecord> & { id?: string; createdBy?: string | null };

export function useUpsertSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (s: UpsertSupplier) => {
      const payload: Record<string, unknown> = {
        name: s.name || "Untitled supplier",
        contact_person: s.contactPerson || null,
        email: s.email || null,
        phone: s.phone || null,
        address: s.address || null,
        location: s.location || null,
        avatar_url: s.avatarUrl || null,
        notes: s.notes || null,
        items: s.items || [],
        updated_at: new Date().toISOString(),
      };
      if (s.id) {
        const { data, error } = await supabase
          .from("suppliers")
          .update(payload)
          .eq("id", s.id)
          .select()
          .single();
        if (error) throw error;
        return mapSupplier(data);
      }
      const insertPayload = withBusiness({ ...payload, created_by: s.createdBy || null });
      const { data, error } = await supabase
        .from("suppliers")
        .insert(insertPayload)
        .select()
        .single();
      if (error) throw error;
      return mapSupplier(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppliers"] }),
  });
}

export function useDeleteSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("suppliers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppliers"] }),
  });
}
