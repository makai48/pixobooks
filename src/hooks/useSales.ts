import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { mapSale, mapSalePayment } from "@/lib/mappers";
import type {
  Item,
  PaymentMethod,
  SaleLine,
  Settings,
  SalePayment,
  DocumentType,
  PaymentStatus,
} from "@/types";
import { useActiveBranch } from "@/hooks/useBranches";
import { useActiveBusiness } from "@/hooks/useBusinesses";
import { currentBusinessId } from "@/lib/tenant";
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
      for (let offset = 0; offset < limit; offset += SALES_PAGE_SIZE) {
        const end = Math.min(offset + SALES_PAGE_SIZE, limit) - 1;
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
    refetchInterval: 20000,
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
};

export function useAddSalePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: AddPaymentInput) => {
      // Fetch sale
      const { data: sale, error: sErr } = await supabase
        .from("sales")
        .select("*")
        .eq("id", p.saleId)
        .single();
      if (sErr) throw sErr;

      const amt = Math.max(0, Math.min(Number(sale.amount_due || 0), Number(p.amount || 0)));
      if (amt <= 0) throw new Error("Nothing due on this sale.");

      const { error: payErr } = await supabase.from("sale_payments").insert({
        sale_id: p.saleId,
        business_id: sale.business_id || currentBusinessId() || undefined,
        amount: amt,
        payment_method: p.paymentMethod,
        received_by: p.receivedBy,
        received_by_name: p.receivedByName,
        notes: p.notes || null,
      });
      if (payErr) throw payErr;

      const newPaid = Number(sale.amount_paid || 0) + amt;
      const newDue = Number(sale.total || 0) - newPaid;
      const newStatus: PaymentStatus = newDue <= 0 ? "paid" : "partial";
      const newDoc: DocumentType = newDue <= 0 ? "receipt" : "invoice";

      const { data: updated, error: uErr } = await supabase
        .from("sales")
        .update({
          amount_paid: newPaid,
          amount_due: Math.max(0, newDue),
          payment_status: newStatus,
          document_type: newDoc,
        })
        .eq("id", p.saleId)
        .select()
        .single();
      if (uErr) throw uErr;

      return mapSale(updated);
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
  return useMutation({
    mutationFn: async (id: string) => {
      // Retain a permanent audit trail of every sale/invoice/receipt
      // deletion. Backend RLS additionally restricts DELETE to
      // Owner/Admin roles so hiding the UI button is not the sole gate.
      const { data: sale } = await supabase
        .from("sales")
        .select("number, customer_name, total, payment_method, payment_status, document_type")
        .eq("id", id)
        .maybeSingle();
      const { error } = await supabase.from("sales").delete().eq("id", id);
      if (error) throw error;
      await logAudit(null, "sale.delete", "sale", id, sale || {});
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["live_opening_balance"] });
    },
  });
}
