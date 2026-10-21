import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { mapUnitConversion } from "@/lib/mappers";
import { normUom, validateConversionProposal } from "@/lib/uom";
import type { UnitConversion } from "@/types";
import { useActiveBusiness } from "@/hooks/useBusinesses";
import { businessKey, currentBusinessId, withBusiness } from "@/lib/tenant";

export function useUnitConversions() {
  const active = useActiveBusiness();
  const businessId = active === "none" ? null : active;
  return useQuery({
    queryKey: ["unit_conversions", businessId],
    queryFn: async () => {
      let q = supabase
        .from("unit_conversions")
        .select("*")
        .order("category")
        .order("from_unit");
      if (businessId) q = q.eq("business_id", businessId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map(mapUnitConversion);
    },
    refetchInterval: 60000,
  });
}

type UnitConversionInput = Partial<UnitConversion> & {
  id?: string;
  createdBy?: string | null;
};

export function useUpsertUnitConversion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (uc: UnitConversionInput) => {
      // Central integrity gate (§9): duplicates, conflicts and inconsistent
      // paths are rejected before touching the database.
      const from = normUom(uc.fromUnit);
      const to = normUom(uc.toUnit);
      const existing = qc.getQueryData<UnitConversion[]>(["unit_conversions", businessKey()]) ?? [];
      const check = validateConversionProposal(
        { fromUnit: from, toUnit: to, factor: uc.factor ?? 1, excludeId: uc.id },
        existing.map((c) => ({ id: c.id, fromUnit: c.fromUnit, toUnit: c.toUnit, factor: c.factor }))
      );
      if (!check.ok) throw new Error(check.reason);
      // Mirror text codes into FK references when the master knows them.
      const master =
        qc.getQueryData<{ id: string; code: string }[]>(["uoms", businessKey()]) ?? [];
      const idFor = (code: string) =>
        master.find((u) => normUom(u.code) === code)?.id ?? null;
      const payload: Record<string, unknown> = {
        from_unit: from,
        to_unit: to,
        factor: uc.factor ?? 1,
        category: uc.category || "general",
        notes: uc.notes || null,
        from_uom_id: idFor(from),
        to_uom_id: idFor(to),
        updated_at: new Date().toISOString(),
      };
      if (uc.id) {
        const { data, error } = await supabase
          .from("unit_conversions")
          .update(payload)
          .eq("id", uc.id)
          .select()
          .single();
        if (error) throw error;
        return mapUnitConversion(data);
      }
      const insertPayload = withBusiness({ ...payload, created_by: uc.createdBy || null });
      const { data, error } = await supabase
        .from("unit_conversions")
        .insert(insertPayload)
        .select()
        .single();
      if (error) throw error;
      return mapUnitConversion(data);
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["unit_conversions"] });
      // Keep reference ratios fresh: recompute the affected family in the
      // background so the engine keeps resolving from the reference (§3).
      void refreshCategoryRatios(qc, vars.category || "general").catch(() => undefined);
    },
  });
}

async function refreshCategoryRatios(
  qc: ReturnType<typeof useQueryClient>,
  categoryName: string
): Promise<void> {
  const { refreshUomRatios } = await import("@/hooks/useUomCategories");
  const cats =
    qc.getQueryData<{ id: string; name: string }[]>(["uom_categories", businessKey()]) ?? [];
  const match = cats.find((c) => c.name === categoryName);
  if (!match) return;
  await refreshUomRatios(match.id);
  qc.invalidateQueries({ queryKey: ["uoms"] });
}

export function useDeleteUnitConversion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Deletion orphan-check: refuse when items depend on either side.
      // (Conversion rows never dangle: both endpoints must stay meaningful.)
      const cached = qc.getQueryData<UnitConversion[]>(["unit_conversions", businessKey()]) ?? [];
      const row = cached.find((c) => c.id === id);
      if (row) {
        const { findUomDependencies } = await import("@/lib/uomDependencies");
        const businessId = currentBusinessId();
        let uomQ = supabase.from("uoms").select("id,code");
        if (businessId) uomQ = uomQ.eq("business_id", businessId);
        const { data: uoms } = await uomQ;
        const byCode = new Map(
          ((uoms as { id: string; code: string }[] | null) || []).map((u) => [normUom(u.code), u.id])
        );
        for (const code of [normUom(row.fromUnit), normUom(row.toUnit)]) {
          const uid = byCode.get(code);
          if (!uid) continue;
          const deps = await findUomDependencies(uid);
          if (deps.items > 0) {
            throw new Error(
              `Cannot delete: unit "${code}" is configured on ${deps.items} item${deps.items > 1 ? "s" : ""}. Remove it from those items first.`
            );
          }
        }
      }
      const { error } = await supabase.from("unit_conversions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["unit_conversions"] });
      qc.invalidateQueries({ queryKey: ["uoms"] });
    },
  });
}
