import { describe, expect, it } from "vitest";
import { buildLocalSale, buildSaleWrite, stampCheckoutInput } from "@/lib/saleWrite";
import { isUniqueViolation } from "@/lib/syncEngine";
import { buildStockWrite } from "@/lib/stockWrite";
import { buildItemRow } from "@/hooks/useItems";
import type { CheckoutInput } from "@/hooks/useSales";
import type { Settings, Item } from "@/types";

const settings = {
  taxRate: 18,
  loyalty: { enabled: true, pointsPerDollar: 1, dollarPerPoint: 0.02 },
  invoice: { prefix: "PB-", nextNumber: 1000, terms: "" },
} as unknown as Settings;

const baseItem = {
  id: "i1",
  sku: "SKU1",
  name: "Item",
  category: "General",
  price: 100,
  cost: 60,
  stock: 10,
  baseUnit: "pc",
  units: [],
  bom: null,
  isMaterial: false,
  itemType: "product",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as unknown as Item;

const input = {
  lines: [{ itemId: "i1", name: "A", qty: 2, unitPrice: 100, discountPct: 10 }],
  customerId: null,
  customerName: "Walk-in Customer",
  orderDiscountPct: 10,
  paymentMethod: "cash",
  cashierId: null,
  cashierName: "Cashier",
  items: [baseItem],
  settings,
  loyaltyRedeemPoints: 0,
} as unknown as CheckoutInput;

describe("buildSaleWrite", () => {
  it("computes number, totals, payment row and next invoice", () => {
    const b = buildSaleWrite(input);
    // Cash = receipt → R + prefix + 15-digit YYMMDDHHMMSSmmm timestamp.
    expect(b.number).toMatch(/^RPB-[A-Z]\d{6}[A-Z]\d{6}[A-Z]$/);
    expect(b.salePayload.total).toBeCloseTo(191.16, 1);
    expect(b.paymentRow).not.toBeNull();
    expect(b.nextInvoice.nextNumber).toBe(1001);
    expect(b.status).toBe("paid");
  });

  it("requires a customer for credit sales", () => {
    expect(() =>
      buildSaleWrite({ ...input, paymentMethod: "credit" })
    ).toThrow();
  });

  it("detects unique violations for number retry", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(
      isUniqueViolation({ message: 'duplicate key value violates unique constraint "sales_number_key"' })
    ).toBe(true);
    expect(isUniqueViolation(new Error("Network failure"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });

  it("builds an instant local receipt with matching numbers", () => {
    const built = buildSaleWrite(input);
    const local = buildLocalSale(input, "q123");
    expect(local.id).toBe("offline-q123");
    // Timestamp numbers: each build stamps its own millisecond, so the two
    // builds agree on scheme (not the identical stamp).
    expect(built.salePayload.number).toMatch(/^RPB-[A-Z]\d{6}[A-Z]\d{6}[A-Z]$/);
    expect(local.number).toMatch(/^RPB-[A-Z]\d{6}[A-Z]\d{6}[A-Z]$/);
    expect(local.total).toBeCloseTo(built.salePayload.total as number, 5);
    expect(local.lines).toEqual(input.lines);
  });

  it("uses I + prefix for invoices (credit)", () => {
    const b = buildSaleWrite({
      ...input,
      paymentMethod: "credit",
      customerId: "c1",
    });
    expect(b.number).toMatch(/^IPB-[A-Z]\d{6}[A-Z]\d{6}[A-Z]$/);
    expect(b.docType).toBe("invoice");
  });

  it("preserves a stamped number verbatim across builds (offline/replay)", () => {
    const stamped = stampCheckoutInput(input);
    expect(stamped.documentNumber).toMatch(/^RPB-[A-Z]\d{6}[A-Z]\d{6}[A-Z]$/);
    // Stamping is idempotent: re-stamping keeps the original number.
    expect(stampCheckoutInput(stamped).documentNumber).toBe(
      stamped.documentNumber
    );
    // Every later build — local receipt, server write, sync replay —
    // reuses the identical number.
    expect(buildSaleWrite(stamped).number).toBe(stamped.documentNumber);
    expect(buildSaleWrite(stamped).salePayload.number).toBe(
      stamped.documentNumber
    );
    expect(buildLocalSale(stamped, "q9").number).toBe(stamped.documentNumber);
  });
});

describe("buildStockWrite", () => {
  it("computes delta and row", () => {
    const b = buildStockWrite({
      itemId: "i1",
      itemName: "Item",
      oldStock: 10,
      newStock: 7,
    });
    expect(b.delta).toBe(-3);
    expect(b.row.new_stock).toBe(7);
    expect(b.row.old_stock).toBe(10);
  });
});

describe("buildItemRow", () => {
  it("maps camelCase to snake_case with defaults", () => {
    const row = buildItemRow({ sku: "A", name: "A" });
    expect(row.sku).toBe("A");
    expect(row.base_unit).toBe("pc");
    expect(row.item_type).toBe("product");
  });
});
