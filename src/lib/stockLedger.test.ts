import { describe, expect, it, vi } from "vitest";
import {
  buildAdjustmentMovement,
  buildReceiptMovements,
  buildSaleMovements,
  buildSaleVoidMovements,
  isFullyReceived,
  receiptDeltas,
} from "@/lib/stockLedger";
import type { Item, Sale, SaleLine } from "@/types";

vi.mock("@/lib/supabase", () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));
vi.mock("@/lib/tenant", () => ({ currentBusinessId: () => "biz-1" }));

const item = (over: Partial<Item>): Item => ({
  id: "i1",
  sku: "SKU1",
  name: "Item",
  category: "General",
  itemType: "ready",
  baseUnit: "pc",
  saleUnit: "pc",
  purchaseUnit: "pc",
  stock: 10,
  cost: 1,
  price: 2,
  lowStockThreshold: 1,
  active: true,
  posVisible: true,
  canSell: true,
  canPurchase: true,
  allowDecimalQty: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
}) as Item;

const line = (over: Partial<SaleLine>): SaleLine => ({
  itemId: "i1",
  name: "Item",
  qty: 3,
  unitPrice: 2,
  discountPct: 0,
  ...over,
});

const sale = (lines: SaleLine[]): Sale =>
  ({
    id: "sale-1",
    number: "RPX1",
    lines,
  }) as unknown as Sale;

describe("stock ledger movement builders", () => {
  it("sale movements are negative and keyed for idempotency", () => {
    const [m] = buildSaleMovements({
      saleId: "sale-1",
      lines: [line({ qty: 3 })],
      items: [item({ stock: 10 })],
    });
    expect(m.itemId).toBe("i1");
    expect(m.qtyBase).toBe(-3);
    expect(m.sourceType).toBe("sale");
    expect(m.sourceId).toBe("sale-1");
    expect(m.sourceLine).toBe(0);
  });

  it("BOM sale issues the components, never the assembled product", () => {
    const mat = item({ id: "m", stock: 500, baseUnit: "sheet" });
    const prod = item({
      id: "p",
      baseUnit: "box",
      bom: [{ materialId: "m", qty: 1, unit: "ream" }],
    });
    const out = buildSaleMovements({
      saleId: "sale-1",
      lines: [line({ itemId: "p", qty: 2, unit: "box" })],
      items: [mat, prod],
      conversions: [{ fromUnit: "ream", toUnit: "sheet", factor: 500 }],
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ itemId: "m", qtyBase: -1000 });
  });

  it("void movements are the exact positive mirror of the sale", () => {
    const items = [item({ stock: 7 })];
    const sold = buildSaleMovements({
      saleId: "sale-1",
      lines: [line({ qty: 3 })],
      items: [item({ stock: 10 })],
    });
    const back = buildSaleVoidMovements({ sale: sale([line({ qty: 3 })]), items });
    expect(back).toHaveLength(1);
    expect(back[0].qtyBase).toBe(-sold[0].qtyBase);
    expect(back[0].sourceType).toBe("sale_void");
    expect(back[0].sourceId).toBe("sale-1");
  });

  it("void honours the stamped unit factor over a changed conversion table", () => {
    const back = buildSaleVoidMovements({
      sale: sale([line({ qty: 10, unit: "ream", unitFactor: 500 })]),
      items: [item({ stock: 0, baseUnit: "sheet", saleUnit: "ream" })],
      conversions: [{ fromUnit: "ream", toUnit: "sheet", factor: 250 }],
    });
    expect(back[0].qtyBase).toBe(5000);
  });

  it("receipts skip zero-quantity lines and carry unit cost", () => {
    const out = buildReceiptMovements({
      poId: "po-1",
      lines: [
        { materialId: "m1", qty: 4, unitCost: 2.5 },
        { materialId: "m2", qty: 0, unitCost: 1 },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      itemId: "m1",
      qtyBase: 4,
      unitCost: 2.5,
      sourceType: "po_receipt",
      sourceId: "po-1",
    });
  });

  it("adjustment uses the signed delta and ignores no-ops", () => {
    const out = buildAdjustmentMovement({
      itemId: "i1",
      delta: -2,
      sourceType: "stocktake",
      reason: "Physical count",
    });
    expect(out[0]).toMatchObject({ qtyBase: -2, sourceType: "stocktake" });
    expect(
      buildAdjustmentMovement({ itemId: "i1", delta: 0, sourceType: "adjustment" })
    ).toEqual([]);
  });
});

describe("partial PO receipts", () => {
  it("posts only the newly delivered quantity", () => {
    expect(receiptDeltas([{ receivedBaseQty: 0 }], [{ receivedBaseQty: 400 }])).toEqual([400]);
    // Second delivery: cumulative 1000 (base) means 600 arrived now.
    expect(
      receiptDeltas([{ receivedBaseQty: 400 }], [{ receivedBaseQty: 1000 }])
    ).toEqual([600]);
  });

  it("re-saving the same cumulative receipt posts nothing", () => {
    expect(
      receiptDeltas([{ receivedBaseQty: 1000 }], [{ receivedBaseQty: 1000 }])
    ).toEqual([0]);
  });

  it("legacy rows without a base figure fall back to receivedQty", () => {
    expect(receiptDeltas([{ receivedQty: 5 }], [{ receivedQty: 9 }])).toEqual([4]);
  });

  it("detects full vs partial completion against ordered base qty", () => {
    expect(isFullyReceived([{ receivedBaseQty: 400, orderedBaseQty: 1000 }])).toBe(false);
    expect(isFullyReceived([{ receivedBaseQty: 1000, orderedBaseQty: 1000 }])).toBe(true);
    expect(isFullyReceived([{ receivedBaseQty: 999, orderedBaseQty: 1000 }])).toBe(false);
  });

  it("treats lines without an ordered base figure as complete (legacy)", () => {
    expect(isFullyReceived([{ receivedBaseQty: 3 }])).toBe(true);
  });
});
