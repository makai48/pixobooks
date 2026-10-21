// UOM master data-access. Units are referenced by code across items and
// conversions; uoms.id FKs (migration 20251006000003) mirror the same links.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { mapUom } from "@/lib/mappers";
import type { Uom } from "@/types";
import { useActiveBusiness } from "@/hooks/useBusinesses";
import { withBusiness } from "@/lib/tenant";

export function useUoms() {
  const active = useActiveBusiness();
  const businessId = active === "none" ? null : active;
  return useQuery({
    queryKey: ["uoms", businessId],
    queryFn: async (): Promise<Uom[]> => {
      let q = supabase.from("uoms").select("*").order("code");
      if (businessId) q = q.eq("business_id", businessId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map(mapUom);
    },
    refetchInterval: 60000,
  });
}

export type UomInput = {
  id?: string;
  code: string;
  name: string;
  symbol?: string | null;
  discrete: boolean;
  isActive?: boolean;
  categoryId?: string | null;
  rounding?: number | null;
};

export function useUpsertUom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (u: UomInput) => {
      const code = u.code.trim().toLowerCase();
      if (!code) throw new Error("Unit code is required");
      if (!u.name.trim()) throw new Error("Unit name is required");
      if (u.rounding !== undefined && u.rounding !== null && (!(u.rounding > 0) || !Number.isFinite(u.rounding))) {
        throw new Error("Rounding increment must be greater than 0");
      }
      const payload: Record<string, unknown> = {
        code,
        name: u.name.trim(),
        symbol: u.symbol?.trim() || null,
        discrete: u.discrete,
        is_active: u.isActive !== false,
        category_id: u.categoryId || null,
        rounding: u.rounding ?? (u.discrete ? 1 : 0.001),
        updated_at: new Date().toISOString(),
      };
      if (u.id) {
        const { data, error } = await supabase
          .from("uoms")
          .update(payload)
          .eq("id", u.id)
          .select()
          .single();
        if (error) throw error;
        return mapUom(data);
      }
      const { data, error } = await supabase
        .from("uoms")
        .insert(withBusiness(payload))
        .select()
        .single();
      if (error) throw error;
      return mapUom(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["uoms"] });
      qc.invalidateQueries({ queryKey: ["unit_conversions"] });
    },
  });
}

/**
 * Delete protection (§10): hard-delete only when nothing references the
 * unit. Otherwise the caller must deactivate or supply a replacement code
 * that every reference is remapped to first.
 */
export function useDeleteUom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, replacementCode }: { id: string; replacementCode?: string }) => {
      const { findUomDependencies, hasHistoryDeps } = await import("@/lib/uomDependencies");
      const deps = await findUomDependencies(id);
      if (hasHistoryDeps(deps)) {
        throw new Error(
          `Unit has historical transactions (${describeDeps(deps)}). ` +
            `History is immutable — deactivate the unit instead of deleting it.`
        );
      }
      const total = deps.items + deps.conversions + deps.purchaseLines + deps.salesLines + deps.adjustments;
      if (total > 0 && !replacementCode) {
        throw new Error(
          `Unit is used by ${total} record${total > 1 ? "s" : ""} ` +
            `(${describeDeps(deps)}). Deactivate it or supply a replacement unit.`
        );
      }
      if (total > 0 && replacementCode) {
        const { remapUomReferences } = await import("@/lib/uomDependencies");
        await remapUomReferences(id, replacementCode);
      }
      const { error } = await supabase.from("uoms").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["uoms"] });
      qc.invalidateQueries({ queryKey: ["unit_conversions"] });
      qc.invalidateQueries({ queryKey: ["items"] });
    },
  });
}

function describeDeps(d: { items: number; conversions: number; purchaseLines: number; salesLines: number; adjustments: number }): string {
  const parts: string[] = [];
  if (d.items) parts.push(`${d.items} items`);
  if (d.conversions) parts.push(`${d.conversions} conversions`);
  if (d.purchaseLines) parts.push(`${d.purchaseLines} PO lines`);
  if (d.salesLines) parts.push(`${d.salesLines} sale lines`);
  if (d.adjustments) parts.push(`${d.adjustments} adjustments`);
  return parts.join(", ");
}
