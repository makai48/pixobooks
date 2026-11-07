import { describe, expect, it } from "vitest";
import { buildCashLedger, effectiveBankedToday, type CashLedgerInput } from "./cashLedger";

/**
 * Regression coverage for the daily-balancing b/f fix.
 *
 * The old implementation used `sales.amount_paid` and a stored snapshot
 * anchor. A credit sale settled days later retroactively changed every
 * subsequent b/f, and the 1000-row PostgREST cap silently truncated the
 * ledger. The new ledger is derived from the actual cash movements.
 */

const base: CashLedgerInput = {
  payments: [
    { sale_id: "s1", amount: 100, payment_method: "cash", created_at: "2026-10-29T10:00:00Z" },
    { sale_id: "s2", amount: 50, payment_method: "card", created_at: "2026-10-29T11:00:00Z" },
    { sale_id: "s3", amount: 40, payment_method: "cash", created_at: "2026-10-30T09:00:00Z" },
  ],
  sales: [
    // Backed by a payment row — must NOT be added again.
    { id: "s1", amount_paid: 100, payment_method: "cash", created_at: "2026-10-29T10:00:00Z" },
    // Card sale — not a cash movement.
    { id: "s2", amount_paid: 50, payment_method: "card", created_at: "2026-10-29T11:00:00Z" },
    // Legacy cash sale with no payment row — must fall back to amount_paid.
    { id: "legacy", amount_paid: 25, payment_method: "cash", created_at: "2026-10-29T12:00:00Z" },
  ],
  expenses: [
    { amount: 10, expense_date: "2026-10-29", payment_method: "cash", category: "Rent" },
    { amount: 5, expense_date: "2026-10-29", payment_method: "cash", category: "Drawings" },
  ],
  deposits: [
    { amount: 30, deposited_at: "2026-10-29" },
    { amount: 20, deposited_at: "2026-10-30" },
  ],
};

describe("buildCashLedger", () => {
  it("keeps voided sales' original cash and nets it with the refund row", () => {
    const ledger = buildCashLedger({
      payments: [
        { sale_id: "v1", amount: 300, payment_method: "cash", created_at: "2026-10-29T10:00:00Z" },
        // Void refund posted on the day the reversal happened (sale_id null).
        { sale_id: null, amount: -300, payment_method: "cash", created_at: "2026-10-30T09:00:00Z" },
        { sale_id: "ok", amount: 40, payment_method: "cash", created_at: "2026-10-29T11:00:00Z" },
      ],
      sales: [
        { id: "v1", amount_paid: 300, payment_method: "cash", created_at: "2026-10-29T10:00:00Z", voided_at: "2026-10-30T09:00:00Z" },
        { id: "ok", amount_paid: 40, payment_method: "cash", created_at: "2026-10-29T11:00:00Z" },
      ],
    });
    // The original trading day is untouched…
    expect(ledger.day("2026-10-29").cashSales).toBe(340);
    // …and the reversal lands on the day it happened.
    expect(ledger.day("2026-10-30").cashSales).toBe(-300);
  });

  it("derives each day's cash flow from real movements", () => {
    const ledger = buildCashLedger(base);
    expect(ledger.day("2026-10-29")).toEqual({
      cashSales: 125,
      cashExpenses: 10,
      drawings: 5,
      banked: 30,
      net: 80,
    });
    expect(ledger.day("2026-10-30")).toEqual({
      cashSales: 40,
      cashExpenses: 0,
      drawings: 0,
      banked: 20,
      net: 20,
    });
  });

  it("never double-counts a sale that has payment rows", () => {
    const ledger = buildCashLedger(base);
    // 100 payment + 25 legacy only (the backed sale's amount_paid is skipped).
    expect(ledger.day("2026-10-29").cashSales).toBe(125);
  });

  it("supports multiple same-day bankings", () => {
    const ledger = buildCashLedger({
      ...base,
      deposits: [
        { amount: 30, deposited_at: "2026-10-30" },
        { amount: 20, deposited_at: "2026-10-30" },
      ],
    });
    expect(ledger.day("2026-10-30").banked).toBe(50);
    expect(ledger.day("2026-10-30").net).toBe(-10);
  });

  it("keeps a closed day's b/f stable when a later payment arrives", () => {
    const before = buildCashLedger(base);
    expect(before.openingBalance("2026-10-30")).toBe(80);

    // A credit sale from the 29th is settled on the 30th. The cash moved
    // on the 30th, so the 30th's b/f must not change.
    const after = buildCashLedger({
      ...base,
      payments: [
        ...(base.payments ?? []),
        { sale_id: "s1", amount: 60, payment_method: "cash", created_at: "2026-10-30T14:00:00Z" },
      ],
    });
    expect(after.openingBalance("2026-10-30")).toBe(80);
    expect(after.day("2026-10-30").cashSales).toBe(100);
    expect(after.openingBalance("2026-10-31")).toBe(160);
  });

  it("rolls every prior net movement into the opening balance", () => {
    const ledger = buildCashLedger(base);
    expect(ledger.openingBalance("2026-10-29")).toBe(0);
    expect(ledger.openingBalance("2026-10-30")).toBe(80);
    expect(ledger.openingBalance("2026-10-31")).toBe(100);
    expect(ledger.totalNet()).toBe(100);
  });

  it("keeps today's b/f untouched by same-day banking", () => {
    const before = buildCashLedger(base);
    expect(before.openingBalance("2026-10-30")).toBe(80);
    // Banking twice on the 30th only moves the 30th's till, never its b/f.
    const after = buildCashLedger({
      ...base,
      deposits: [
        ...(base.deposits ?? []),
        { amount: 15, deposited_at: "2026-10-30" },
        { amount: 10, deposited_at: "2026-10-30" },
      ],
    });
    expect(after.openingBalance("2026-10-30")).toBe(80);
    expect(after.day("2026-10-30").banked).toBe(45);
    expect(after.openingBalance("2026-10-31")).toBe(75);
  });
});

describe("effectiveBankedToday", () => {
  it("uses base + session while the live ledger lags", () => {
    expect(effectiveBankedToday(0, 0, 100)).toBe(100);
    expect(effectiveBankedToday(100, 0, 100)).toBe(100);
  });

  it("never loses deposits made on another device mid-session", () => {
    expect(effectiveBankedToday(30, 0, 0)).toBe(30);
    expect(effectiveBankedToday(130, 0, 100)).toBe(130);
  });

  it("accumulates multiple same-day bankings in one session", () => {
    expect(effectiveBankedToday(0, 0, 150)).toBe(150);
  });
});
