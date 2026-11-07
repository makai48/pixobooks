import { describe, expect, it } from "vitest";
import type { ClientInvoice, Expense, PurchaseOrder, Sale } from "@/types";
import {
  clientBalances,
  debtAgeing,
  debtorDays,
  drawingsSeries,
  expenseBreakdown,
  itemPerformance,
  overgrownDebts,
  purchasesByVendor,
  staffPerformance,
  trendBundle,
} from "./analytics";

const range = {
  from: new Date("2026-10-01T00:00:00"),
  to: new Date("2026-10-31T23:59:59"),
};

function sale(partial: Partial<Sale>): Sale {
  return {
    id: "s",
    number: "R1",
    createdAt: "2026-10-30T10:00:00Z",
    cashierId: null,
    cashierName: "Alice",
    lines: [],
    subtotal: 0,
    lineDiscountTotal: 0,
    orderDiscountPct: 0,
    orderDiscountValue: 0,
    tax: 0,
    total: 0,
    cost: 0,
    profit: 0,
    paymentMethod: "cash",
    paymentStatus: "paid",
    documentType: "receipt",
    amountPaid: 0,
    amountDue: 0,
    loyaltyEarned: 0,
    loyaltyRedeemed: 0,
    ...partial,
  };
}

function expense(partial: Partial<Expense>): Expense {
  return {
    id: "e",
    category: "Rent",
    description: "",
    amount: 0,
    expenseDate: "2026-10-30",
    paymentMethod: "cash",
    createdBy: null,
    createdByName: "Admin",
    createdAt: "2026-10-30T10:00:00Z",
    updatedAt: "2026-10-30T10:00:00Z",
    ...partial,
  };
}

function purchase(partial: Partial<PurchaseOrder>): PurchaseOrder {
  return {
    id: "po",
    number: "PO1",
    vendor: "Vendor",
    lines: [],
    subtotal: 0,
    tax: 0,
    total: 0,
    status: "received",
    createdBy: null,
    createdByName: "Admin",
    createdAt: "2026-10-30T10:00:00Z",
    updatedAt: "2026-10-30T10:00:00Z",
    ...partial,
  };
}

function invoice(partial: Partial<ClientInvoice>): ClientInvoice {
  return {
    id: "inv",
    number: "INV1",
    clientId: "c1",
    clientName: "Acme",
    clientSnapshot: {},
    invoiceType: "monthly",
    issueDate: "2026-10-01",
    subtotal: 0,
    discount: 0,
    otherCharges: 0,
    tax: 0,
    total: 0,
    amountPaid: 0,
    amountDue: 0,
    status: "sent",
    lines: [],
    breakdown: [],
    workEntryIds: [],
    paymentDetails: {},
    createdAt: "2026-10-01T10:00:00Z",
    updatedAt: "2026-10-01T10:00:00Z",
    ...partial,
  } as ClientInvoice;
}

describe("itemPerformance", () => {
  it("allocates sale cost by revenue share and merges purchases", () => {
    const sales = [
      sale({
        total: 250,
        cost: 150,
        lines: [
          { itemId: "a", name: "Cards", qty: 2, unitPrice: 100, discountPct: 0 },
          { itemId: "b", name: "Flyers", qty: 1, unitPrice: 50, discountPct: 0 },
        ],
      }),
    ];
    const purchases = [
      purchase({
        lines: [
          { materialId: "a", name: "Cards", qty: 5, unitCost: 10 },
          { materialId: "b", name: "Flyers", qty: 2, unitCost: 20 },
        ],
      }),
    ];

    const rows = itemPerformance(sales, purchases, range);
    const a = rows.find((r) => r.itemId === "a")!;
    const b = rows.find((r) => r.itemId === "b")!;

    expect(a.revenue).toBe(200);
    expect(a.profit).toBe(80);
    expect(a.qtySold).toBe(2);
    expect(a.qtyPurchased).toBe(5);
    expect(a.purchaseValue).toBe(50);

    expect(b.revenue).toBe(50);
    expect(b.profit).toBe(20);
    expect(b.qtyPurchased).toBe(2);
    expect(b.purchaseValue).toBe(40);
  });

  it("ignores sales outside the selected period", () => {
    const rows = itemPerformance(
      [
        sale({
          createdAt: "2026-01-01T10:00:00Z",
          lines: [{ itemId: "a", name: "Cards", qty: 1, unitPrice: 10, discountPct: 0 }],
        }),
      ],
      [],
      range
    );
    expect(rows).toHaveLength(0);
  });
});

describe("trendBundle", () => {
  it("builds revenue, cost, expense and profit series", () => {
    const bundle = trendBundle(
      [sale({ total: 100, cost: 40 })],
      [expense({ amount: 10 })],
      range
    );
    expect(bundle.revenue[0].value).toBe(100);
    expect(bundle.cost[0].value).toBe(40);
    expect(bundle.expenses[0].value).toBe(10);
    expect(bundle.profit[0].value).toBe(50);
  });
});

describe("expenses and drawings", () => {
  it("breaks expenses down by category", () => {
    const rows = expenseBreakdown(
      [
        expense({ category: "Rent", amount: 100 }),
        expense({ category: "Rent", amount: 50 }),
        expense({ category: "Fuel", amount: 20 }),
      ],
      range
    );
    expect(rows[0]).toEqual({ label: "Rent", value: 150 });
    expect(rows[1]).toEqual({ label: "Fuel", value: 20 });
  });

  it("separates drawings", () => {
    const rows = drawingsSeries(
      [expense({ category: "Drawings", amount: 75 })],
      range
    );
    expect(rows[0].value).toBe(75);
  });
});

describe("staff and purchases", () => {
  it("aggregates staff sales", () => {
    const rows = staffPerformance(
      [sale({ cashierName: "Alice", total: 100, profit: 20 }), sale({ cashierName: "Bob", total: 50, profit: 5 })],
      range
    );
    expect(rows[0]).toMatchObject({ name: "Alice", count: 1, revenue: 100, profit: 20 });
  });

  it("groups purchases by vendor and skips cancelled POs", () => {
    const rows = purchasesByVendor(
      [
        purchase({ vendor: "Paper Co", total: 100 }),
        purchase({ vendor: "Paper Co", total: 50 }),
        purchase({ vendor: "Ink Ltd", total: 30 }),
        purchase({ vendor: "Ink Ltd", total: 999, status: "cancelled" }),
      ],
      range
    );
    expect(rows).toEqual([
      { label: "Paper Co", value: 150 },
      { label: "Ink Ltd", value: 30 },
    ]);
  });
});

describe("client balances and debtors", () => {
  const today = new Date("2026-10-30T12:00:00");

  it("sums open balances per client and tracks the oldest invoice", () => {
    const rows = clientBalances(
      [
        invoice({ issueDate: "2026-10-01", amountDue: 100 }),
        invoice({ id: "inv2", issueDate: "2026-08-01", amountDue: 200 }),
      ],
      today
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].due).toBe(300);
    expect(rows[0].oldestDays).toBe(90);
  });

  it("flags debts older than the threshold", () => {
    const rows = overgrownDebts(
      [invoice({ issueDate: "2026-08-01", amountDue: 200 })],
      today,
      60
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].due).toBe(200);
  });

  it("buckets ageing and computes amount-weighted debtor days", () => {
    const invoices = [
      invoice({ issueDate: "2026-10-01", amountDue: 100 }),
      invoice({ id: "inv2", issueDate: "2026-08-01", amountDue: 200 }),
    ];
    const buckets = debtAgeing(invoices, today);
    expect(buckets[1].value).toBe(100);
    expect(buckets[3].value).toBe(200);
    expect(debtorDays(invoices, today)).toBeCloseTo(69.67, 1);
  });
});
