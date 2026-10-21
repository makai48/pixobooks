import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { mapQuote } from "@/lib/mappers";
import type { QuoteStatus, SaleLine } from "@/types";
import { logAudit } from "@/lib/audit";
import { useActiveBusiness } from "@/hooks/useBusinesses";
import { withBusiness } from "@/lib/tenant";

export function useQuotes() {
  const active = useActiveBusiness();
  const businessId = active === "none" ? null : active;
  return useQuery({
    queryKey: ["quotes", businessId],
    queryFn: async () => {
      let q = supabase
        .from("quotes")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (businessId) q = q.eq("business_id", businessId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map(mapQuote);
    },
    refetchInterval: 30000,
  });
}

export type QuoteInput = {
  id?: string;
  number?: string;
  customerId?: string | null;
  customerName?: string | null;
  lines: SaleLine[];
  subtotal: number;
  tax: number;
  total: number;
  status?: QuoteStatus;
  validUntil?: string | null;
  notes?: string | null;
  createdBy?: string | null;
  createdByName?: string;
};

export function useUpsertQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (q: QuoteInput) => {
      const payload: Record<string, unknown> = {
        number: q.number || `Q-${Date.now().toString(36).slice(-6).toUpperCase()}`,
        customer_id: q.customerId || null,
        customer_name: q.customerName || null,
        lines: q.lines,
        subtotal: q.subtotal,
        tax: q.tax,
        total: q.total,
        status: q.status || "draft",
        valid_until: q.validUntil || null,
        notes: q.notes || null,
        updated_at: new Date().toISOString(),
      };
      if (q.id) {
        const { data, error } = await supabase
          .from("quotes")
          .update(payload)
          .eq("id", q.id)
          .select()
          .single();
        if (error) throw error;
        return mapQuote(data);
      }
      const insertPayload = withBusiness({
        ...payload,
        created_by: q.createdBy || null,
        created_by_name: q.createdByName || null,
      });
      const { data, error } = await supabase
        .from("quotes")
        .insert(insertPayload)
        .select()
        .single();
      if (error) throw error;
      return mapQuote(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotes"] }),
  });
}

export function useDeleteQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Permanently record the deletion in the audit log BEFORE the row is
      // removed so we retain evidence of what was deleted, when, and by whom.
      const { data: quote } = await supabase
        .from("quotes")
        .select("number, customer_name, total, status")
        .eq("id", id)
        .maybeSingle();
      const { error } = await supabase.from("quotes").delete().eq("id", id);
      if (error) throw error;
      await logAudit(null, "quote.delete", "quote", id, quote || {});
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotes"] }),
  });
}

export function useUpdateQuoteStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status,
      convertedSaleId,
    }: {
      id: string;
      status: QuoteStatus;
      convertedSaleId?: string;
    }) => {
      const patch: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
      };
      if (convertedSaleId) patch.converted_sale_id = convertedSaleId;
      const { error } = await supabase.from("quotes").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotes"] }),
  });
}
