// UOM category (family) data-access + reference-ratio maintenance.
// Pair rows in unit_conversions are the DEFINITIONS users maintain;
// uoms.ratio is the DERIVED runtime cache recomputed from them, so the
// engine always resolves from the category reference (§3) while the
// definition history stays intact.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { mapUomCategory } from "@/lib/mappers";
import { normUom } from "@/lib/uom";
import type { UomCategory } from "@/types";
import { useActiveBusiness } from "@/hooks/useBusinesses";
import { currentBusinessId, withBusiness } from "@/lib/tenant";

export function useUomCategories() {
  const active = useActiveBusiness();
  const businessId = active === "none" ? null : active;
  return useQuery({
    queryKey: ["uom_categories", businessId],
    queryFn: async () => {
      let q = supabase.from("uom_categories").select("*").order("name");
      if (businessId) q = q.eq("business_id", businessId);
      const { data, error } = await q;
      if (error) throw error;
      return ((data || []).map(mapUomCategory) || []) as UomCategory[];
    },
    refetchInterval: 60000,
  });
}

export type UomCategoryInput = {
  id?: string;
  name: string;
  referenceUomId?: string | null;
  description?: string | null;
  isActive?: boolean;
};

export function useUpsertUomCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: UomCategoryInput) => {
      if (!c.name.trim()) throw new Error("Category name is required");
      const payload: Record<string, unknown> = {
        name: c.name.trim().toLowerCase(),
        reference_uom_id: c.referenceUomId || null,
        description: c.description?.trim() || null,
        is_active: c.isActive !== false,
        updated_at: new Date().toISOString(),
      };
      if (c.id) {
        const { data, error } = await supabase
          .from("uom_categories")
          .update(payload)
          .eq("id", c.id)
          .select()
          .single();
        if (error) throw error;
        return mapUomCategory(data);
      }
      const { data, error } = await supabase
        .from("uom_categories")
        .insert(withBusiness(payload))
        .select()
        .single();
      if (error) throw error;
      return mapUomCategory(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["uom_categories"] });
    },
  });
}

/**
 * Recompute reference ratios for one category from its pair definitions.
 * ratio[X] = reference units per 1 X, walked from the reference UOM over
 * same-category rows only. Units unreachable from the reference keep
 * ratio NULL (engine falls back to pair math for them).
 */
export async function refreshUomRatios(categoryId: string): Promise<number> {
  const businessId = currentBusinessId();
  let convQ = supabase.from("unit_conversions").select("from_unit,to_unit,factor");
  if (businessId) convQ = convQ.eq("business_id", businessId);

  const [{ data: cat }, { data: rows }] = await Promise.all([
    supabase.from("uom_categories").select("id,reference_uom_id").eq("id", categoryId).maybeSingle(),
    convQ,
  ]);
  const refId = (cat as { reference_uom_id?: unknown } | null)?.reference_uom_id as string | undefined;
  if (!refId) return 0;
  const { data: refRow } = await supabase.from("uoms").select("code").eq("id", refId).maybeSingle();
  const refCode = normUom((refRow as { code?: unknown } | null)?.code);
  if (!refCode) return 0;

  const pairs = (((rows as { from_unit: string; to_unit: string; factor: number }[] | null) || []))
    .filter((r) => Number.isFinite(Number(r.factor)) && Number(r.factor) > 0)
    .map((r) => ({ fromUnit: r.from_unit, toUnit: r.to_unit, factor: Number(r.factor) }));

  // BFS from the reference, mirroring the migration's recursive walk.
  const ratio = new Map<string, number>([[refCode, 1]]);
  const queue: string[] = [refCode];
  let guard = 0;
  while (queue.length > 0 && guard++ < 500) {
    const cur = queue.shift()!;
    const curRatio = ratio.get(cur)!;
    for (const p of pairs) {
      const f = normUom(p.fromUnit);
      const t = normUom(p.toUnit);
      if (f === cur && !ratio.has(t)) {
        ratio.set(t, curRatio / p.factor);
        queue.push(t);
      } else if (t === cur && !ratio.has(f)) {
        ratio.set(f, curRatio * p.factor);
        queue.push(f);
      }
    }
  }

  let updated = 0;
  for (const [code, value] of ratio) {
    if (!Number.isFinite(value) || value <= 0) continue;
    let q = supabase
      .from("uoms")
      .update({ ratio: value, updated_at: new Date().toISOString() })
      .eq("code", code);
    if (businessId) q = q.eq("business_id", businessId);
    const { error } = await q;
    if (!error) updated++;
  }
  return updated;
}
