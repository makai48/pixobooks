import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { getActiveBranchId, useActiveBranch } from "@/hooks/useBranches";
import { useActiveBusiness } from "@/hooks/useBusinesses";
import { withBusiness } from "@/lib/tenant";
import { mapPO } from "@/lib/mappers";
import type { POLine, POStatus } from "@/types";
import { logAudit } from "@/lib/audit";

export function usePurchaseOrders() {
  const branch = useActiveBranch();
  const branchId = branch === "all" ? null : branch;
  const active = useActiveBusiness();
  const businessId = active === "none" ? null : active;
  return useQuery({
    queryKey: ["purchase_orders", businessId, branchId],
    queryFn: async () => {
      let q = supabase
        .from("purchase_orders")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (businessId) q = q.eq("business_id", businessId);
      if (branchId) q = q.eq("branch_id", branchId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map(mapPO);
    },
    refetchInterval: 30000,
  });
}

export type POInput = {
  id?: string;
  number?: string;
  vendor: string;
  lines: POLine[];
  subtotal: number;
  tax: number;
  total: number;
  status?: POStatus;
  expectedDate?: string | null;
  notes?: string | null;
  createdBy?: string | null;
  createdByName?: string;
};

export function useUpsertPO() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (po: POInput) => {
      const payload: Record<string, unknown> = {
        number: po.number || `PO-${Date.now().toString(36).slice(-6).toUpperCase()}`,
        vendor: po.vendor,
        lines: po.lines,
        subtotal: po.subtotal,
        tax: po.tax,
        total: po.total,
        status: po.status || "draft",
        expected_date: po.expectedDate || null,
        notes: po.notes || null,
        updated_at: new Date().toISOString(),
      };
      if (po.id) {
        const { data, error } = await supabase
          .from("purchase_orders")
          .update(payload)
          .eq("id", po.id)
          .select()
          .single();
        if (error) throw error;
        return mapPO(data);
      }
      const insertPayload = withBusiness({
        ...payload,
        created_by: po.createdBy || null,
        created_by_name: po.createdByName || null,
        branch_id: getActiveBranchId(),
      });
      const { data, error } = await supabase
        .from("purchase_orders")
        .insert(insertPayload)
        .select()
        .single();
      if (error) throw error;
      return mapPO(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["purchase_orders"] }),
  });
}

export function useDeletePO() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Preserve a permanent audit record before removing the row.
      const { data: po } = await supabase
        .from("purchase_orders")
        .select("number, vendor, total, status")
        .eq("id", id)
        .maybeSingle();
      const { error } = await supabase.from("purchase_orders").delete().eq("id", id);
      if (error) throw error;
      await logAudit(null, "po.delete", "purchase_order", id, po || {});
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["purchase_orders"] }),
  });
}

/**
 * Receive a PO into stock. The caller passes an updated `lines` array
 * where each line may include `receivedQty` (the actual quantity that
 * arrived). When `receivedQty` is set (and >= 0), it OVERRIDES the
 * originally-ordered `qty` for the purpose of incrementing on-hand
 * stock. The persisted `lines` JSONB is then updated with the same
 * received quantities so the PO carries a permanent record of what
 * was actually received.
 */
export function useReceivePO() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, lines }: { id: string; lines: POLine[] }) => {
      // Normalize: fall back to ordered qty if receivedQty missing
      const normalized: POLine[] = lines.map((l) => ({
        ...l,
        receivedQty:
          typeof l.receivedQty === "number" && l.receivedQty >= 0
            ? l.receivedQty
            : Number(l.qty || 0),
      }));

      // Increment stock for each material by the RECEIVED quantity
      // (already converted to base units by the caller via the central
      // engine). Item cost follows the WEIGHTED AVERAGE of old and new
      // stock values: (oldStock×oldCost + received×unitCost) ÷ total.
      // Falls back to the legacy line unit cost when no derived figure
      // was computed.
      for (const line of normalized) {
        if (!line.materialId) continue;
        const received = Number(line.receivedQty || 0);
        if (!(received > 0)) continue;
        const { data: mat } = await supabase
          .from("items")
          .select("stock, cost")
          .eq("id", line.materialId)
          .single();
        if (mat) {
          const derived =
            typeof line.derivedUnitCost === "number" && Number.isFinite(line.derivedUnitCost)
              ? line.derivedUnitCost
              : null;
          const { averageInventoryCost } = await import("@/lib/uom");
          await supabase
            .from("items")
            .update({
              stock: Number(mat.stock || 0) + received,
              cost:
                derived != null
                  ? averageInventoryCost({
                      oldStock: Number(mat.stock || 0),
                      oldCost: Number(mat.cost || 0),
                      receivedQty: received,
                      receivedUnitCost: derived,
                    })
                  : line.unitCost || Number(mat.cost || 0),
              updated_at: new Date().toISOString(),
            })
            .eq("id", line.materialId);
        }
      }
      const { error } = await supabase
        .from("purchase_orders")
        .update({
          lines: normalized,
          status: "received",
          received_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase_orders"] });
      qc.invalidateQueries({ queryKey: ["items"] });
    },
  });
}
