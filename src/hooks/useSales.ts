import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { mapSale, mapSalePayment } from "@/lib/mappers";
import { movementPayload } from "@/lib/stockLedger";
import type {
  Item,
  PaymentMethod,
  SaleLine,
  Settings,
  SalePayment,
} from "@/types";
import { useActiveBranch } from "@/hooks/useBranches";
import { useActiveBusiness } from "@/hooks/useBusinesses";
import { useAuth } from "@/hooks/useAuth";
import { logAudit } from "@/lib/audit";

/**
 * LEGACY POS CREDIT / PARTIAL-PAYMENT WORKFLOW.
 *
 * POS credit and partial-payment sales live in `sales` + `sale_payments`
 * and remain the authoritative source for the POS/Customer credit view.
 * The new Client Billing module operates on separate tables and does
 * NOT depend on this workflow. The two systems are intentionally kept
 * distinct so POS behavior is preserved unchanged.
 */

/** PostgREST returns at most 1000 rows per request, so anything above that
 *  has to be paged. */
const SALES_PAGE_SIZE = 1000;

export function useSales(limit = 500) {
  // Branch-aware: a specific active branch filters server-side; "all" keeps
  // legacy full-pool behavior. Key includes branch so switching refetches.
  const branch = useActiveBranch();
  const branchId = branch === "all" ? null : branch;
  const active = useActiveBusiness();
  const businessId = active === "none" ? null : active;
  return useQuery({
    queryKey: ["sales", businessId, limit, branchId],
    queryFn: async () => {
      // Ordered by `created_at`, which is the real transaction timestamp —
      // imported sales carry their original timestamp, so they interleave
      // with live sales by the day they actually happened, not import day.
      const rows: Record<string, unknown>[] = [];
      for (let offset = 0; limit === 0 || offset < limit; offset += SALES_PAGE_SIZE) {
        const end = limit === 0 ? offset + SALES_PAGE_SIZE - 1 : Math.min(offset + SALES_PAGE_SIZE, limit) - 1;
        let q = supabase
          .from("sales")
          .select("*")
          .order("created_at", { ascending: false })
          // Stable tie-breaker so paging cannot skip/repeat rows that share a
          // timestamp (bulk imports often land whole seconds together).
          .order("id", { ascending: true })
          .range(offset, end);
        if (businessId) q = q.eq("business_id", businessId);
        if (branchId) q = q.eq("branch_id", branchId);
        const { data, error } = await q;
        if (error) throw error;
        const page = (data || []) as Record<string, unknown>[];
        rows.push(...page);
        if (page.length < end - offset + 1) break;
      }
      return rows.map(mapSale);
    },
    // Large report feeds (5,000 rows) refresh far less aggressively than the
    // POS-sized 500-row feed to keep mobile pages responsive.
    refetchInterval: limit <= 500 ? 20000 : 60000,
  });
}

export function useSalePayments(saleId?: string) {
  return useQuery({
    queryKey: ["sale_payments", saleId],
    queryFn: async () => {
      if (!saleId) return [] as SalePayment[];
      const { data, error } = await supabase
        .from("sale_payments")
        .select("*")
        .eq("sale_id", saleId)
        .order("created_at");
      if (error) throw error;
      return (data || []).map(mapSalePayment);
    },
    enabled: !!saleId,
  });
}

export type CheckoutInput = {
  lines: SaleLine[];
  customerId?: string | null;
  customerName?: string | null;
  orderDiscountPct: number;
  paymentMethod: PaymentMethod;
  cashierId: string | null;
  cashierName: string;
  cashierEmail?: string | null;
  cashierRole?: string | null;
  items: Item[];
  settings: Settings;
  loyaltyRedeemPoints?: number;
  amountPaid?: number; // required for partial/credit
  dueDate?: string | null;
  /** Document number stamped once at creation (R/I + prefix + timestamp).
   *  Carried verbatim through offline queue, retries, and sync replay. */
  documentNumber?: string | null;
  /** Business captured when the sale was started. Keeps offline replay in the
   *  right workspace even if the user switches business before reconnecting. */
  businessId?: string | null;
  /** UOM master for discrete-quantity enforcement. When present, every
   *  line qty is validated against its sale UOM (§4-7). */
  uoms?: Pick<import("@/types").Uom, "code" | "discrete">[];
  /** Conversion table for sale/base-unit stock math. When present,
   *  decrements convert line qtys into base units via the central engine. */
  conversions?: Pick<import("@/types").UnitConversion, "fromUnit" | "toUnit" | "factor">[];
};

export function useCompleteSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CheckoutInput) => {
      // Stamp the document number once, up front: the same number flows
      // into the offline queue, the local receipt, the server write, and
      // sync replay (stamping is idempotent — a pre-stamped input is kept).
      const { executeSaleWrite, stampCheckoutInput } = await import("@/lib/saleWrite");
      const stamped = stampCheckoutInput(input);
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        const { OfflineQueue } = await import("@/lib/offlineQueue");
        const id = await OfflineQueue.enqueue("sale.complete", stamped, {
          cashier: stamped.cashierName,
        });
        throw new Error(`OFFLINE_QUEUED:${id}`);
      }
      // Single source of truth lives in lib/saleWrite so online checkout
      // and offline-queue replay compute identical numbers and writes.
      return executeSaleWrite(stamped);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["stock_movements"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["shop_settings"] });
      qc.invalidateQueries({ queryKey: ["loyalty"] });
      qc.invalidateQueries({ queryKey: ["attendance"] });
      // The new sale is a cash movement — the balancing b/f / till must
      // re-derive from the live ledger.
      qc.invalidateQueries({ queryKey: ["live_opening_balance"] });
    },
  });
}

export type AddPaymentInput = {
  saleId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  receivedBy: string | null;
  receivedByName: string;
  notes?: string;
  /** Stable key for one user-initiated collection attempt. */
  idempotencyKey?: string;
};

export function useAddSalePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: AddPaymentInput) => {
      const { data, error } = await supabase.rpc("add_sale_payment", {
        p_sale_id: p.saleId,
        p_amount: p.amount,
        p_method: p.paymentMethod,
        p_received_by: p.receivedBy,
        p_received_by_name: p.receivedByName,
        p_notes: p.notes || null,
        p_idempotency_key:
          p.idempotencyKey ??
          (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`),
      });
      if (error) throw error;
      return mapSale(data as Record<string, unknown>);
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["sale_payments", variables.saleId] });
      qc.invalidateQueries({ queryKey: ["live_opening_balance"] });
    },
  });
}

export function useVoidSale() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      // A void is a reversal document, never a deletion:
      //   1. stock goes back through the movement ledger (sale_void)
      //   2. the sale row is marked voided and stays visible/auditable
      //   3. the financial trail is unwound (customer spend + loyalty)
      // Reports and the cash ledger exclude voided rows.
      const { data: raw, error: readErr } = await supabase
        .from("sales")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (readErr) throw readErr;
      if (!raw) throw new Error("Sale not found");
      if (raw.voided_at) throw new Error("This sale is already voided");

      const sale = mapSale(raw);
      // The database reverses the original sale movement rows exactly. The
      // browser must not reconstruct stock using today's BOM/UOM catalogue.
      const { data: originalMovements, error: movementReadError } = await supabase
        .from("stock_movements")
        .select("item_id, qty_base")
        .eq("source_type", "sale")
        .eq("source_id", id);
      if (movementReadError) throw movementReadError;
      const movements = (originalMovements || []).map((m) => ({
        itemId: m.item_id as string,
        qtyBase: Number(m.qty_base || 0),
      }));

      // Preferred path: the server verifies `sales.void` AND marks the
      // document voided in the same transaction as the stock return, so the
      // UI gate is not the only control.
      const rpc = await supabase.rpc("void_sale", {
        p_sale_id: id,
        p_reason: reason ?? null,
        p_movements: movementPayload([]),
      });
      if (rpc.error) {
        throw rpc.error;
      }

      await logAudit(
        profile ? { id: profile.id, name: profile.name, role: profile.role } : null,
        "sale.void",
        "sale",
        id,
        {
          number: sale.number,
          total: sale.total,
          customer: sale.customerName,
          reason: reason || null,
          stock_restored: movements,
        }
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["stock_movements"] });
      qc.invalidateQueries({ queryKey: ["stock_adjustments"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["loyalty"] });
      qc.invalidateQueries({ queryKey: ["live_opening_balance"] });
    },
  });
}
