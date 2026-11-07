import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { getActiveBranchId, useActiveBranch } from "@/hooks/useBranches";
import { useActiveBusiness } from "@/hooks/useBusinesses";
import { withBusiness } from "@/lib/tenant";
import { mapPO } from "@/lib/mappers";
import type { POLine, POStatus } from "@/types";
import { logAudit } from "@/lib/audit";
import { buildReceiptMovements, isFullyReceived, receiptDeltas, movementPayload } from "@/lib/stockLedger";

export function usePurchaseOrders() {
  const branch = useActiveBranch();
  const branchId = branch === "all" ? null : branch;
  const active = useActiveBusiness();
  const businessId = active === "none" ? null : active;
  return useQuery({
    queryKey: ["purchase_orders", businessId, branchId],
    queryFn: async () => {
      const rows: Record<string, unknown>[] = [];
      for (let offset = 0; offset < 1000000; offset += 1000) {
        let q = supabase
          .from("purchase_orders")
          .select("*")
          .order("created_at", { ascending: false })
          .range(offset, offset + 999);
        if (businessId) q = q.eq("business_id", businessId);
        if (branchId) q = q.eq("branch_id", branchId);
        const { data, error } = await q;
        if (error) throw error;
        const page = (data || []) as Record<string, unknown>[];
        rows.push(...page);
        if (page.length < 1000) break;
      }
      return rows.map(mapPO);
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
      // A received PO has already posted stock and cost. Editing its lines or
      // status afterwards would silently desync inventory from the document,
      // so it is locked: reverse the receipt instead.
      if (po.id) {
        const { data: existing } = await supabase
          .from("purchase_orders")
          .select("status, lines")
          .eq("id", po.id)
          .maybeSingle();
        if (existing?.status === "received") {
          throw new Error(
            "Received purchase orders are locked. Record a stock adjustment to correct the receipt instead of editing it."
          );
        }
        const partial = Array.isArray(existing?.lines)
          ? (existing.lines as POLine[]).some(
              (l) => Number(l.receivedBaseQty ?? l.receivedEnteredQty ?? 0) > 0
            )
          : false;
        if (partial) {
          throw new Error(
            "This purchase order already has a partial receipt. Receive the balance instead of editing its lines."
          );
        }
      }
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
        .select("number, vendor, total, status, lines")
        .eq("id", id)
        .maybeSingle();
      // A received PO has already posted stock AND cost. Deleting the
      // document would leave the inventory inflated with no source row, so
      // it is refused: goods must be returned through a stock adjustment.
      const hasReceipt = Array.isArray(po?.lines)
        ? (po.lines as POLine[]).some(
            (l) => Number(l.receivedBaseQty ?? l.receivedQty ?? 0) > 0
          )
        : false;
      if (po?.status === "received" || hasReceipt) {
        throw new Error(
          `PO ${po?.number ?? ""} has stock against it. Record a stock adjustment to return the goods instead of deleting it.`
        );
      }
      const { error } = await supabase.from("purchase_orders").delete().eq("id", id);
      if (error) throw error;
      await logAudit(null, "po.delete", "purchase_order", id, po || {});
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["purchase_orders"] }),
  });
}

/**
 * Receive a PO into stock — full or partial.
 *
 * The caller sends CUMULATIVE receipt state per line:
 *   `receivedBaseQty` (base units received to date, including this delivery)
 *   `orderedBaseQty`  (ordered qty in base units, used to detect completion)
 * Only the delta versus the already-stored receipt is posted to the ledger, so
 * a second delivery adds the balance instead of duplicating the first one.
 */
export function useReceivePO() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, lines }: { id: string; lines: POLine[] }) => {
      const { data: current, error: readErr } = await supabase
        .from("purchase_orders")
        .select("status, lines, business_id, branch_id, received_at")
        .eq("id", id)
        .maybeSingle();
      if (readErr) throw readErr;
      if (current?.status === "received") {
        throw new Error("This purchase order was already fully received.");
      }

      const previous: POLine[] = Array.isArray(current?.lines)
        ? (current.lines as POLine[])
        : [];
      const normalized: POLine[] = lines.map((l, i) => {
        const cumulative = Number(l.receivedBaseQty ?? l.receivedQty ?? 0);
        return {
          ...l,
          receivedQty: cumulative,
          receivedBaseQty: cumulative,
          orderedBaseQty: Number(l.orderedBaseQty ?? previous[i]?.orderedBaseQty ?? 0),
        };
      });

      // Delta for THIS delivery only.
      const deltaValues = receiptDeltas(previous, normalized);
      const deltas = normalized.map((line, i) => ({
        line,
        delta: deltaValues[i] ?? 0,
      }));

      // Prepare cost updates. The database RPC applies these together with
      // the PO and stock movements while holding the PO lock.
      const costUpdates: { item_id: string; cost: number }[] = [];
      for (const { line, delta } of deltas) {
        if (!line.materialId || delta <= 0) continue;
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
          costUpdates.push({
            item_id: line.materialId,
            cost:
              derived != null
                ? averageInventoryCost({
                    oldStock: Number(mat.stock || 0),
                    oldCost: Number(mat.cost || 0),
                    receivedQty: delta,
                    receivedUnitCost: derived,
                  })
                : line.unitCost || Number(mat.cost || 0),
          });
        }
      }

      const fullyReceived = isFullyReceived(normalized);

      // Receipt sequence keeps each delivery idempotent without blocking the
      // next one: (po_receipt, "<po>:<n>", item, line).
      const { data: priorMoves } = await supabase
        .from("stock_movements")
        .select("source_id")
        .eq("source_type", "po_receipt")
        .like("source_id", `${id}:%`);
      const seq =
        new Set((priorMoves || []).map((m) => String(m.source_id))).size + 1;

      const movements = buildReceiptMovements({
        poId: `${id}:${seq}`,
        lines: deltas
          .filter(({ delta }) => delta > 0)
          .map(({ line, delta }) => ({
            materialId: line.materialId,
            qty: delta,
            unitCost: Number(line.derivedUnitCost ?? line.unitCost ?? 0),
          })),
        reason: `PO receipt ${seq} received into stock`,
        businessId: (current?.business_id as string | undefined) ?? null,
        branchId: (current?.branch_id as string | undefined) ?? null,
      });
      const { error: receiveError } = await supabase.rpc("receive_purchase_order", {
        p_po_id: id,
        p_lines: normalized,
        p_status: fullyReceived ? "received" : "ordered",
        p_received_at: fullyReceived
          ? new Date().toISOString()
          : (current?.received_at as string | undefined) ?? new Date().toISOString(),
        p_movements: movementPayload(movements),
        p_cost_updates: costUpdates,
      });
      if (receiveError) throw receiveError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase_orders"] });
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["stock_movements"] });
    },
  });
}
