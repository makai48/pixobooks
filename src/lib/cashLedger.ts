/**
 * Cash ledger derivation — the single source of truth for the daily
 * balancing "Balance b/f" and "today's cash flow" figures.
 *
 * WHY THIS EXISTS
 * ---------------
 * The previous implementation derived b/f from the most recent
 * `daily_balancing` snapshot's `opening_balance` and then folded in cash
 * movements from `sales.amount_paid`. That produced two classes of bug:
 *
 *   1. `amount_paid` is a RUNNING TOTAL. When a credit/partial sale is
 *      settled days later, the whole amount is attributed to the sale's
 *      original date, retroactively changing every subsequent b/f.
 *   2. `sale_payments` (the authoritative cash ledger) was ignored, so a
 *      payment received today could move yesterday's closing balance.
 *
 * This module reads the real cash movements, each on the date the cash
 * actually moved:
 *
 *   cash in   → `sale_payments` rows with method = cash (payment date)
 *   fallback  → cash/partial `sales` with no payment row (sale date)
 *   cash out  → `expenses` with method = cash (expense date)
 *   banking   → `bank_deposits` (deposit date)
 *
 * `openingBalance(date)` is therefore the sum of every net cash movement
 * BEFORE that business day. It is deterministic and stable: adding a
 * transaction today can never change yesterday's b/f, and banking never
 * changes today's b/f (only today's till / c/d).
 *
 * All dates are business-local (`localISODate`) so a sale rung up at
 * 23:59 local is attributed to the day the shop was actually open.
 */
import { localISODate } from "./utils";

export type CashPaymentRow = {
  id?: string | null;
  sale_id?: string | null;
  amount?: number | null;
  payment_method?: string | null;
  created_at?: string | null;
};

export type CashSaleRow = {
  id?: string | null;
  amount_paid?: number | null;
  payment_method?: string | null;
  created_at?: string | null;
  /** Set when the document was voided — its cash must not count. */
  voided_at?: string | null;
};

export type CashExpenseRow = {
  amount?: number | null;
  expense_date?: string | null;
  payment_method?: string | null;
  category?: string | null;
};

export type CashDepositRow = {
  amount?: number | null;
  deposited_at?: string | null;
};

export type CashLedgerInput = {
  payments?: CashPaymentRow[];
  sales?: CashSaleRow[];
  expenses?: CashExpenseRow[];
  deposits?: CashDepositRow[];
  /** Expense category treated as admin's drawings (default "Drawings"). */
  drawingsCategory?: string;
};

export type CashDayFlow = {
  /** Cash received into the till (sale payments + legacy cash sales). */
  cashSales: number;
  /** Cash expenses excluding drawings. */
  cashExpenses: number;
  /** Admin drawings paid from the till. */
  drawings: number;
  /** Till → bank transfers recorded on this day. */
  banked: number;
  /** cashSales − cashExpenses − drawings − banked. */
  net: number;
};

export const EMPTY_DAY_FLOW: CashDayFlow = {
  cashSales: 0,
  cashExpenses: 0,
  drawings: 0,
  banked: 0,
  net: 0,
};

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isCash(method?: string | null): boolean {
  return String(method || "").toLowerCase() === "cash";
}

function dayOfDate(value?: string | null): string {
  if (!value) return "";
  // Date-only columns (expense_date / deposited_at) are already YYYY-MM-DD.
  return String(value).slice(0, 10);
}

export type CashLedger = {
  /** Net movement per business-local day. */
  days: Map<string, CashDayFlow>;
  /** Flow for one day (zeros when there was no activity). */
  day(date: string): CashDayFlow;
  /** Sum of every net movement strictly before `date`. */
  openingBalance(date: string): number;
  /** Sum of every net movement in the ledger. */
  totalNet(): number;
};

/**
 * Session-aware "already banked today" for the balancing modal.
 *
 * The live ledger refetch lags a just-completed deposit, so the modal
 * tracks its own session deposits locally. `baseBanked` is the ledger
 * figure at modal open; the effective value is base + session, floored
 * by the live figure so deposits made on another device mid-session are
 * never lost. Without this, two quick same-day bankings validated
 * against a stale till (over-banking) and persisted an under-counted
 * cumulative snapshot.
 */
export function effectiveBankedToday(
  liveBanked: number,
  baseBanked: number,
  sessionBanked: number
): number {
  return Math.max(liveBanked, baseBanked + sessionBanked);
}

export function buildCashLedger(input: CashLedgerInput): CashLedger {
  const drawingsCategory = input.drawingsCategory ?? "Drawings";
  const payments = input.payments ?? [];
  const sales = input.sales ?? [];
  const expenses = input.expenses ?? [];
  const deposits = input.deposits ?? [];

  const days = new Map<string, CashDayFlow>();
  const day = (date: string): CashDayFlow => {
    let flow = days.get(date);
    if (!flow) {
      flow = { ...EMPTY_DAY_FLOW };
      days.set(date, flow);
    }
    return flow;
  };

  // A sale with at least one payment row is fully represented by the
  // sale_payments ledger. Legacy sales (pre-payment-table, or CSV imports
  // that carry no payments) fall back to the sale's own amount_paid.
  //
  // Voided sales keep their original cash on the day it was taken; the void
  // posts a negative "refund" payment row on the day of the reversal (see
  // useVoidSale), so past b/f figures are never rewritten.
  const paymentBacked = new Set<string>();
  for (const p of payments) {
    if (p.sale_id) paymentBacked.add(String(p.sale_id));
  }

  for (const p of payments) {
    if (!isCash(p.payment_method)) continue;
    const date = localISODate(p.created_at || "");
    if (!date) continue;
    day(date).cashSales += num(p.amount);
  }

  for (const s of sales) {
    const id = s.id ? String(s.id) : "";
    if (id && paymentBacked.has(id)) continue;
    const method = String(s.payment_method || "").toLowerCase();
    if (method !== "cash" && method !== "partial") continue;
    const amount = num(s.amount_paid);
    if (amount <= 0) continue;
    const date = localISODate(s.created_at || "");
    if (!date) continue;
    day(date).cashSales += amount;
  }

  for (const e of expenses) {
    if (!isCash(e.payment_method)) continue;
    const date = dayOfDate(e.expense_date);
    if (!date) continue;
    const amount = num(e.amount);
    if (String(e.category || "") === drawingsCategory) day(date).drawings += amount;
    else day(date).cashExpenses += amount;
  }

  for (const d of deposits) {
    const date = dayOfDate(d.deposited_at);
    if (!date) continue;
    day(date).banked += num(d.amount);
  }

  for (const flow of days.values()) {
    flow.net = flow.cashSales - flow.cashExpenses - flow.drawings - flow.banked;
  }

  const sortedDates = [...days.keys()].sort();

  return {
    days,
    day(date: string): CashDayFlow {
      const flow = days.get(date);
      return flow ? { ...flow } : { ...EMPTY_DAY_FLOW };
    },
    openingBalance(date: string): number {
      let total = 0;
      for (const key of sortedDates) {
        if (key >= date) break;
        total += days.get(key)?.net ?? 0;
      }
      return total;
    },
    totalNet(): number {
      return sortedDates.reduce((sum, key) => sum + (days.get(key)?.net ?? 0), 0);
    },
  };
}
