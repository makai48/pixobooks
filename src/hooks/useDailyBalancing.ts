import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { mapDailyBalancing } from "@/lib/mappers";
import type { DailyBalancing } from "@/types";
import { useActiveBusiness } from "@/hooks/useBusinesses";
import { withBusiness } from "@/lib/tenant";
import {
  buildCashLedger,
  EMPTY_DAY_FLOW,
  type CashDayFlow,
  type CashDepositRow,
  type CashExpenseRow,
  type CashPaymentRow,
  type CashSaleRow,
} from "@/lib/cashLedger";

/** Look up a single day's balancing record (audit snapshot + display). */
export function useDailyBalancing(date?: string) {
  const active = useActiveBusiness();
  const businessId = active === "none" ? null : active;
  return useQuery({
    queryKey: ["daily_balancing", businessId, date],
    queryFn: async () => {
      if (!date) return null as DailyBalancing | null;
      let q = supabase
        .from("daily_balancing")
        .select("*")
        .eq("balance_date", date);
      if (businessId) q = q.eq("business_id", businessId);
      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      return data ? mapDailyBalancing(data) : null;
    },
    enabled: !!date,
  });
}

export type DailyBalancingInput = {
  balanceDate: string;
  openingBalance: number;
  cashSales: number;
  cashExpenses: number;
  drawings: number;
  netCashFlow: number;
  depositAmount: number;
  closingBalance: number;
  /** Optional actual cash counted physically in the till at the moment
   *  of balancing. Stored SEPARATELY from the calculated c/d so a till
   *  discrepancy never contaminates the b/f → c/d accounting chain. */
  physicalCashCount?: number | null;
  /** Physical count minus Calculated c/d. Positive = surplus (cash in
   *  till exceeds ledger); negative = shortage. Purely audit metadata. */
  variance?: number | null;
  bankDepositId?: string | null;
  notes?: string | null;
  actor?: { id: string; name: string; role?: string };
};

export function useUpsertDailyBalancing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: DailyBalancingInput) => {
      // Idempotent by (business_id, balance_date) — repeated balancing runs
      // on the same business date UPDATE the audit snapshot rather than
      // inserting duplicate rows. Snapshots are audit records only; the
      // live b/f is always re-derived from the cash ledger.
      const payload = {
        balance_date: p.balanceDate,
        opening_balance: p.openingBalance,
        cash_sales: p.cashSales,
        cash_expenses: p.cashExpenses,
        drawings: p.drawings,
        net_cash_flow: p.netCashFlow,
        deposit_amount: p.depositAmount,
        closing_balance: p.closingBalance,
        physical_cash_count: p.physicalCashCount ?? null,
        variance: p.variance ?? null,
        bank_deposit_id: p.bankDepositId || null,
        notes: p.notes || null,
        created_by: p.actor?.id || null,
        created_by_name: p.actor?.name || null,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from("daily_balancing")
        .upsert(withBusiness(payload), { onConflict: "business_id,balance_date" })
        .select()
        .single();
      if (error) throw error;
      return mapDailyBalancing(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["daily_balancing"] });
      qc.invalidateQueries({ queryKey: ["daily_balancing_previous"] });
      qc.invalidateQueries({ queryKey: ["daily_balancing_range"] });
    },
  });
}

/* ------------------------------------------------------------------ *
 * Live cash ledger
 * ------------------------------------------------------------------ */

const PAGE_SIZE = 1000;
/** Hard safety cap — far above any realistic shop history, but prevents
 *  an accidental infinite paging loop on a malformed response. */
const MAX_ROWS = 500_000;

type PageResult<T> = { data: T[] | null; error: unknown };

async function fetchPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

/**
 * Fetch every cash-relevant row up to and including `throughDate`.
 *
 * Timestamp columns use a deliberately wide UTC window and are then
 * filtered by business-local date inside `buildCashLedger`; date-only
 * columns are bounded directly in SQL. Rows are paged because PostgREST
 * caps a single response at 1000 rows — the previous `.limit(50000)`
 * silently truncated the ledger once a shop passed 1000 sales, which was
 * itself a source of b/f "fluctuation".
 */
async function fetchCashRows(
  businessId: string | null,
  throughDate: string
): Promise<{
  payments: CashPaymentRow[];
  sales: CashSaleRow[];
  expenses: CashExpenseRow[];
  deposits: CashDepositRow[];
}> {
  // Include two extra UTC days so local-midnight boundaries are never
  // clipped. `buildCashLedger` ignores anything beyond `throughDate`.
  const upper = new Date(throughDate + "T00:00:00.000Z");
  upper.setUTCDate(upper.getUTCDate() + 2);
  const upperIso = upper.toISOString();

  const [payments, sales, expenses, deposits] = await Promise.all([
    fetchPages<CashPaymentRow>((from, to) => {
      let q = supabase
        .from("sale_payments")
        .select("id, sale_id, amount, payment_method, created_at")
        .lt("created_at", upperIso)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      if (businessId) q = q.eq("business_id", businessId);
      return q.range(from, to);
    }),
    fetchPages<CashSaleRow>((from, to) => {
      let q = supabase
        .from("sales")
        .select("id, amount_paid, payment_method, created_at")
        .in("payment_method", ["cash", "partial"])
        .gt("amount_paid", 0)
        .lt("created_at", upperIso)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      if (businessId) q = q.eq("business_id", businessId);
      return q.range(from, to);
    }),
    fetchPages<CashExpenseRow>((from, to) => {
      let q = supabase
        .from("expenses")
        .select("id, amount, expense_date, payment_method, category")
        .eq("payment_method", "cash")
        .lte("expense_date", throughDate)
        .order("expense_date", { ascending: true })
        .order("id", { ascending: true });
      if (businessId) q = q.eq("business_id", businessId);
      return q.range(from, to);
    }),
    fetchPages<CashDepositRow>((from, to) => {
      let q = supabase
        .from("bank_deposits")
        .select("id, amount, deposited_at")
        .lte("deposited_at", throughDate)
        .order("deposited_at", { ascending: true })
        .order("id", { ascending: true });
      if (businessId) q = q.eq("business_id", businessId);
      return q.range(from, to);
    }),
  ]);

  return { payments, sales, expenses, deposits };
}

export type LiveOpeningBalance = {
  /** Ledger-derived balance brought forward for `date`. */
  openingBalance: number;
  /** Today's cash movements (sales, expenses, drawings, banking). */
  day: CashDayFlow;
  /** Every net movement in the ledger (useful for diagnostics). */
  totalNet: number;
};

/**
 * LIVE-DERIVED Balance b/f for a given business date.
 *
 * The figure is the sum of every net cash movement strictly BEFORE the
 * date, read from the real cash ledger (see `lib/cashLedger`). It does
 * NOT depend on any `daily_balancing` snapshot, so:
 *
 *   • late payments are attributed to the day the cash arrived;
 *   • back-dated expenses/deposits propagate forward automatically;
 *   • repeated same-day balancing never moves the b/f;
 *   • banking multiple times a day never moves the b/f.
 */
export function useLiveOpeningBalance(date?: string) {
  const active = useActiveBusiness();
  const businessId = active === "none" ? null : active;
  return useQuery({
    queryKey: ["live_opening_balance", businessId, date],
    queryFn: async (): Promise<LiveOpeningBalance> => {
      if (!date) {
        return { openingBalance: 0, day: { ...EMPTY_DAY_FLOW }, totalNet: 0 };
      }
      const rows = await fetchCashRows(businessId, date);
      const ledger = buildCashLedger(rows);
      return {
        openingBalance: ledger.openingBalance(date),
        day: ledger.day(date),
        totalNet: ledger.totalNet(),
      };
    },
    enabled: !!date,
    // The ledger only changes when a sale / expense / deposit is written.
    // Those mutations invalidate this key, so a modest poll is enough.
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}
