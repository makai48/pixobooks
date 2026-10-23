import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { mapDailyBalancing } from "@/lib/mappers";
import { localISODate } from "@/lib/utils";
import type { DailyBalancing } from "@/types";
import { useActiveBusiness } from "@/hooks/useBusinesses";
import { withBusiness } from "@/lib/tenant";

/** Look up a single day's balancing record (used for both b/f resolution
 *  and closing-balance display). Returns undefined when the day hasn't
 *  been balanced yet. */
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
      // Idempotent by (balance_date) — the primary key ensures repeated
      // balancing runs on the same business date UPDATE the snapshot
      // rather than inserting duplicate rows. This preserves the audit
      // trail without creating duplicate ledger movements.
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
      // A new snapshot changes the b/f chain for every subsequent day,
      // so invalidate the live-b/f cache too.
      qc.invalidateQueries({ queryKey: ["live_opening_balance"] });
    },
  });
}

/**
 * LIVE-DERIVED Balance b/f for a given business date.
 *
 * This is the fix for the class of bugs where a stale `closing_balance`
 * snapshot (saved BEFORE late same-day transactions) was carried forward
 * into the next day's b/f — producing e.g. "18-Sep c/d = 1,700 → 19-Sep
 * b/f = 1,700" when late 18-Sep sales of 133,000 should have driven the
 * real 18-Sep c/d to 134,700.
 *
 * Algorithm (transaction ledger is the source of truth):
 *   1. Find the most recent daily_balancing snapshot BEFORE `date` and
 *      use its `opening_balance` as the anchor. That value was itself
 *      live-derived at save time — snapshots' `opening_balance` is
 *      always the start-of-day figure, which never changes as later
 *      transactions come in.
 *   2. Sum every cash movement (cash sales + cash portion of partials
 *      − cash expenses − drawings − bank deposits) from anchor date
 *      (inclusive) up to `date` (exclusive), reading from the LIVE
 *      transaction ledger.
 *   3. Result: `anchorBF + Σ movements`. This mathematically equals the
 *      final Calculated c/d of (date − 1), regardless of when or how
 *      often prior days were balanced. Late transactions on any prior
 *      day therefore automatically propagate forward without a manual
 *      rebalance.
 *
 * The wide UTC query window + local-timezone JS filter guarantees that
 * sales rung up near midnight-local (which may span a UTC day boundary)
 * are attributed to the correct business day.
 */
export function useLiveOpeningBalance(date?: string) {
  const active = useActiveBusiness();
  const businessId = active === "none" ? null : active;
  return useQuery({
    queryKey: ["live_opening_balance", businessId, date],
    queryFn: async () => {
      if (!date) return { openingBalance: 0, anchorDate: null as string | null };

      // 1) Anchor = most recent snapshot strictly BEFORE `date`.
      let prevQ = supabase
        .from("daily_balancing")
        .select("balance_date, opening_balance")
        .lt("balance_date", date)
        .order("balance_date", { ascending: false })
        .limit(1);
      if (businessId) prevQ = prevQ.eq("business_id", businessId);
      const { data: prev } = await prevQ.maybeSingle();

      const anchorDate: string | null = prev?.balance_date || null;
      const anchorBF = Number(prev?.opening_balance || 0);
      const fromDate = anchorDate || "1970-01-01";

      // 2) Wide UTC window for the sales scan (sales.created_at is a UTC
      //    timestamp). We then filter by LOCAL business date in JS so
      //    that a sale at Uganda 23:59 (UTC 20:59) is attributed to the
      //    business day the shop was open — not the UTC day.
      const wideFrom = new Date(fromDate + "T00:00:00.000Z");
      wideFrom.setUTCDate(wideFrom.getUTCDate() - 1);
      const wideFromUtc = wideFrom.toISOString();

      const wideTo = new Date(date + "T00:00:00.000Z");
      wideTo.setUTCDate(wideTo.getUTCDate() + 2);
      const wideToUtc = wideTo.toISOString();

      let salesQ = supabase
        .from("sales")
        .select("amount_paid, created_at, payment_method")
        .in("payment_method", ["cash", "partial"])
        .gte("created_at", wideFromUtc)
        .lt("created_at", wideToUtc)
        .limit(50000);
      let expQ = supabase
        .from("expenses")
        .select("amount, expense_date, payment_method")
        .eq("payment_method", "cash")
        .gte("expense_date", fromDate)
        .lt("expense_date", date)
        .limit(50000);
      let depQ = supabase
        .from("bank_deposits")
        .select("amount, deposited_at")
        .gte("deposited_at", fromDate)
        .lt("deposited_at", date)
        .limit(50000);
      if (businessId) {
        salesQ = salesQ.eq("business_id", businessId);
        expQ = expQ.eq("business_id", businessId);
        depQ = depQ.eq("business_id", businessId);
      }

      const [salesRes, expRes, depRes] = await Promise.all([salesQ, expQ, depQ]);

      if (salesRes.error) throw salesRes.error;
      if (expRes.error) throw expRes.error;
      if (depRes.error) throw depRes.error;

      // Sales: filter by LOCAL business date in [fromDate, date)
      const sumSales = (salesRes.data || [])
        .filter((r: { created_at?: string }) => {
          const local = localISODate(r.created_at || "");
          return local >= fromDate && local < date;
        })
        .reduce((s: number, r: { amount_paid?: number }) => s + Number(r.amount_paid || 0), 0);

      // Expenses / deposits: date-only columns — no TZ conversion needed;
      // the SQL range filter above already scopes them correctly. This
      // sum includes drawings (they're stored with category='Drawings'
      // and payment_method='cash' in the expenses table).
      const sumExp = (expRes.data || []).reduce(
        (s: number, r: { amount?: number }) => s + Number(r.amount || 0),
        0
      );
      const sumDep = (depRes.data || []).reduce(
        (s: number, r: { amount?: number }) => s + Number(r.amount || 0),
        0
      );

      return {
        openingBalance: anchorBF + sumSales - sumExp - sumDep,
        anchorDate,
      };
    },
    enabled: !!date,
    // Near-real-time: reflect late transactions within seconds.
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });
}
