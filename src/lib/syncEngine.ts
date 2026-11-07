// Sync Engine — processes the offline queue with direct Supabase calls
// (hooks can't run outside React, so the engine uses direct executors)
import { supabase } from "./supabase";
import { OfflineQueue, selectRetryable } from "./offlineQueue";
import { currentBusinessId } from "./tenant";
import type { QueueOperationType } from "./offlineQueue";
import type { CheckoutInput } from "@/hooks/useSales";
import type { StockAdjustmentInput } from "@/hooks/useStockAdjustments";

// Direct Supabase executors for the sync engine (non-React context).
// Queue payloads are untyped JSON by nature — one centralized escape hatch.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueuePayload = Record<string, any>;
const directExecutors: Record<QueueOperationType, (payload: QueuePayload) => Promise<{ id: string }>> = {
  "sale.complete": async (payload) => {
    const { executeSaleWrite } = await import("./saleWrite");
    const queuedBusiness =
      (payload.businessId as string | null | undefined) ?? currentBusinessId();
    // Payload is the raw CheckoutInput queued by useCompleteSale, stamped
    // with its document number at creation time.
    // Attach the live UOM master so discrete rules enforce on replay too.
    let uomQ = supabase.from("uoms").select("code,discrete");
    if (queuedBusiness) uomQ = uomQ.eq("business_id", queuedBusiness);
    const { data: uomRows } = await uomQ;
    const liveUoms = ((uomRows as { code: string; discrete: boolean }[] | null) || []).map((u) => ({
      code: u.code,
      discrete: u.discrete !== false,
    }));
    let convQ = supabase.from("unit_conversions").select("from_unit,to_unit,factor");
    if (queuedBusiness) convQ = convQ.eq("business_id", queuedBusiness);
    const { data: convRows } = await convQ;
    const liveConversions = ((convRows as { from_unit: string; to_unit: string; factor: number }[] | null) || []).map((c) => ({
      fromUnit: c.from_unit,
      toUnit: c.to_unit,
      factor: Number(c.factor),
    }));
    // Replay sends the CREATION-TIME document number verbatim — it is never
    // regenerated here. A duplicate (another device stamped the same
    // millisecond) throws and is recorded as a `conflict` for manual
    // resolution: neither transaction is overwritten, merged, or discarded.
    const input: CheckoutInput = {
      ...(payload as unknown as CheckoutInput),
      uoms: liveUoms,
      conversions: liveConversions,
    };
    const sale = await executeSaleWrite(input);
    return { id: sale.id };
  },

  "stock.adjust": async (payload) => {
    const { executeStockWrite } = await import("./stockWrite");
    const adj = await executeStockWrite(
      payload as unknown as StockAdjustmentInput
    );
    return { id: adj.id };
  },

  "item.create": async (payload) => {
    const row = (payload.row ?? payload) as Record<string, unknown>;
    const initial = Number(row.stock ?? 0);
    const { stock: _initialStock, ...catalogRow } = row;
    const { data, error } = await supabase
      .from("items")
      .insert({ ...catalogRow, stock: 0, business_id: row.business_id ?? currentBusinessId() ?? undefined })
      .select()
      .single();
    if (error) throw error;
    // Offline creation still needs its opening balance in the ledger.
    if (initial !== 0) {
      const { error: openingError } = await supabase.rpc("adjust_stock", {
        p_item_id: data.id,
        p_new_stock: initial,
        p_reason: "Opening stock (offline item creation)",
        p_adjustment_type: "opening",
        p_operation_id: `item:${data.id}`,
      });
      if (openingError) throw openingError;
    }
    return { id: data.id };
  },

  "item.update": async (payload) => {
    const row = (payload.row ?? payload) as Record<string, unknown>;
    const id = (payload.id ?? row.id) as string;
    // Stock edited offline goes through the ledger exactly like the online
    // form: update the other fields, then post the delta.
    const { data: before } = await supabase
      .from("items")
      .select("stock, name")
      .eq("id", id)
      .maybeSingle();
    const { stock: _stock, ...rest } = row;
    const { data, error } = await supabase
      .from("items")
      .update({ ...rest, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    const desired = Number(row.stock ?? before?.stock ?? 0);
    const current = Number(before?.stock ?? 0);
    if (Number.isFinite(desired) && Math.abs(desired - current) > 1e-9) {
      const { executeStockWrite } = await import("./stockWrite");
      await executeStockWrite({
        itemId: id,
        itemName: String(row.name || before?.name || "Item"),
        oldStock: current,
        newStock: desired,
        reason: "Item form stock correction (offline replay)",
        adjustmentType: "correction",
      });
    }
    return { id: data.id };
  },

  "item.delete": async (payload) => {
    const { error } = await supabase.from("items").delete().eq("id", payload.id);
    if (error) throw error;
    return { id: payload.id };
  },

  "customer.create": async (payload) => {
    const { data, error } = await supabase
      .from("client_accounts")
      .insert({ ...payload, business_id: payload.business_id ?? currentBusinessId() ?? undefined })
      .select()
      .single();
    if (error) throw error;
    return { id: data.id };
  },

  "customer.update": async (payload) => {
    const { data, error } = await supabase
      .from("client_accounts")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", payload.id)
      .select()
      .single();
    if (error) throw error;
    return { id: data.id };
  },

  "expense.create": async (payload) => {
    const { data, error } = await supabase
      .from("expenses")
      .insert({ ...payload, business_id: payload.business_id ?? currentBusinessId() ?? undefined })
      .select()
      .single();
    if (error) throw error;
    return { id: data.id };
  },

  "expense.update": async (payload) => {
    const { data, error } = await supabase
      .from("expenses")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", payload.id)
      .select()
      .single();
    if (error) throw error;
    return { id: data.id };
  },

  "payment.record": async (payload) => {
    const { data, error } = await supabase
      .from("sale_payments")
      .insert({ ...payload, business_id: payload.business_id ?? currentBusinessId() ?? undefined })
      .select()
      .single();
    if (error) throw error;
    return { id: data.id };
  },

  "payment.update": async (payload) => {
    const { data, error } = await supabase
      .from("sale_payments")
      .update(payload)
      .eq("id", payload.id)
      .select()
      .single();
    if (error) throw error;
    return { id: data.id };
  },

  "sale.hold": async (payload) => {
    const { data, error } = await supabase
      .from("held_tickets")
      .insert({ ...payload, business_id: payload.business_id ?? currentBusinessId() ?? undefined })
      .select()
      .single();
    if (error) throw error;
    return { id: data.id };
  },

  "sale.delete": async (_payload) => {
    throw new Error("Sales cannot be deleted; use the authorized void-sale workflow");
  },

  "custom.generic": async (payload) => {
    // Generic: { table, operation: 'insert'|'update'|'delete', payload }
    const protectedTables = new Set([
      "sales", "sale_payments", "items", "stock_movements", "stock_adjustments",
      "purchase_orders", "customers", "loyalty_transactions",
    ]);
    if (protectedTables.has(String(payload.table))) {
      throw new Error(`Generic offline writes are not permitted for ${payload.table}`);
    }
    if (payload.operation === "insert") {
      const { data, error } = await supabase
        .from(payload.table)
        .insert(payload.payload)
        .select()
        .single();
      if (error) throw error;
      return { id: data.id };
    } else if (payload.operation === "update") {
      const { data, error } = await supabase
        .from(payload.table)
        .update({ ...payload.payload, updated_at: new Date().toISOString() })
        .eq("id", payload.id)
        .select()
        .single();
      if (error) throw error;
      return { id: data.id };
    } else if (payload.operation === "delete") {
      const { error } = await supabase.from(payload.table).delete().eq("id", payload.id);
      if (error) throw error;
      return { id: payload.id };
    }
    throw new Error("Unknown generic operation");
  },
};

/** True when err is a unique-constraint violation (PostgREST 23505). */
export function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  if (code === "23505") return true;
  const msg = (err as { message?: unknown }).message;
  if (typeof msg !== "string") return false;
  return /duplicate key|unique constraint|already exists/i.test(msg);
}

/** Process a single operation (module-private; use syncQueue). */
async function processOperation(op: { type: QueueOperationType; payload: unknown }): Promise<{ success: boolean; serverId?: string; error?: string }> {
  const executor = directExecutors[op.type as QueueOperationType];
  if (!executor) return { success: false, error: `No executor for type ${op.type}` };

  try {
    const result = await executor(op.payload as Record<string, unknown>);
    return { success: true, serverId: result.id };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error";
    // Check for conflicts (e.g., version mismatch, duplicate key)
    if (error.includes("duplicate") || error.includes("conflict")) {
      return { success: false, error: "conflict" };
    }
    return { success: false, error };
  }
}

/** Process all pending operations in order */
export async function syncQueue(onProgress?: (processed: number, total: number) => void): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  conflicts: number;
}> {
  // Background pass: fresh pending plus failed/conflict ops whose backoff
  // has expired. Everything runs silently — no manual retry buttons.
  const retryable = selectRetryable(await OfflineQueue.getAll());
  let succeeded = 0, failed = 0, conflicts = 0;

  for (let i = 0; i < retryable.length; i++) {
    const op = retryable[i];

    await OfflineQueue.update(op.id, { status: "syncing" });

    const result = await processOperation(op);

    if (result.success && result.serverId) {
      await OfflineQueue.markSynced(op.id, result.serverId);
      succeeded++;
    } else if (result.error === "conflict") {
      await OfflineQueue.markConflict(op.id, { message: "Server conflict" });
      conflicts++;
    } else {
      await OfflineQueue.markFailed(op.id, result.error || "Unknown error");
      failed++;
    }

    if (onProgress) onProgress(i + 1, retryable.length);
  }

  return { processed: retryable.length, succeeded, failed, conflicts };
}

/** Auto-sync loop - call once on app startup */
let syncInterval: number | null = null;

export function startAutoSync(intervalMs = 30000): () => void {
  if (syncInterval !== null) {
    const id = syncInterval;
    return () => clearInterval(id);
  }

  const run = async () => {
    if (!navigator.onLine) return;
    try {
      await syncQueue();
      // Retention: drop week-old synced ops so the store stays small.
      await OfflineQueue.clearSynced().catch(() => undefined);
    } catch {
      // Silently fail, will retry next interval
    }
  };

  syncInterval = window.setInterval(run, intervalMs);
  run(); // Run immediately

  return () => {
    if (syncInterval !== null) clearInterval(syncInterval);
    syncInterval = null;
  };
}
