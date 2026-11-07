import { describe, expect, it } from "vitest";
import { computeTotals, computeItemCost, producibleFromBOM, decrementStock, restoreStock } from "@/lib/pos";
import type { Item, SaleLine } from "@/types";

const item = (over: Partial<Item>): Item => ({
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
  ...over,
});

describe("computeTotals", () => {
  it("sums subtotal, discounts, tax", () => {
    const lines: SaleLine[] = [
      { itemId: "i1", name: "A", qty: 2, unitPrice: 100, discountPct: 10 } as SaleLine,
      { itemId: "i2", name: "B", qty: 1, unitPrice: 50, discountPct: 0 } as SaleLine,
    ];
    const t = computeTotals(lines, 10, { taxRate: 18 });
    // subtotal 250, line discount 20, afterLine 230, order 23, after 207, tax 37.26
    expect(t.subtotal).toBe(250);
    expect(t.lineDiscountTotal).toBe(20);
    expect(t.orderDiscountValue).toBeCloseTo(23, 5);
    expect(t.tax).toBeCloseTo(37.26, 2);
    expect(t.total).toBeCloseTo(244.26, 2);
  });

  it("never goes negative with over-discount", () => {
    const lines: SaleLine[] = [{ itemId: "i1", name: "A", qty: 1, unitPrice: 10, discountPct: 0 } as SaleLine];
    const t = computeTotals(lines, 200, { taxRate: 18 }, 100);
    expect(t.total).toBeGreaterThanOrEqual(0);
  });
});

describe("computeItemCost", () => {
  it("uses BOM when present", () => {
    const mat = item({ id: "m1", cost: 5, stock: 100 });
    const prod = item({ id: "p1", cost: 999, bom: [{ materialId: "m1", qty: 3 }] });
    expect(computeItemCost(prod, [mat, prod])).toBe(15);
  });
});

describe("producibleFromBOM", () => {
  it("returns limiting component", () => {
    const a = item({ id: "a", name: "A", stock: 10 });
    const b = item({ id: "b", name: "B", stock: 5 });
    const p = item({ id: "p", bom: [{ materialId: "a", qty: 2 }, { materialId: "b", qty: 2 }] });
    const r = producibleFromBOM(p, [a, b, p]);
    expect(r.qty).toBe(2);
    expect(r.limiting?.materialId).toBe("b");
  });
});

describe("restoreStock (voided sale)", () => {
  it("adds a simple line back and mirrors the deduction exactly", () => {
    const a = item({ id: "a", stock: 10 });
    const sold = decrementStock([{ itemId: "a", qty: 3 } as SaleLine], [a]);
    expect(sold).toEqual([{ id: "a", newStock: 7 }]);
    const back = restoreStock([{ itemId: "a", qty: 3 } as SaleLine], [{ ...a, stock: 7 }]);
    expect(back).toEqual([{ id: "a", newStock: 10, qty: 3 }]);
  });

  it("uses the line's stamped unit factor instead of today's conversion table", () => {
    const a = item({ id: "a", stock: 0, baseUnit: "sheet", saleUnit: "ream" });
    // 10 reams were sold at a stamped factor of 500; conversions have since
    // changed to 250 and must not alter what a historical void restores.
    const back = restoreStock(
      [{ itemId: "a", qty: 10, unit: "ream", unitFactor: 500 } as SaleLine],
      [a],
      [{ fromUnit: "ream", toUnit: "sheet", factor: 250 }]
    );
    expect(back).toEqual([{ id: "a", newStock: 5000, qty: 5000 }]);
  });

  it("returns BOM components, not the assembled product", () => {
    const mat = item({ id: "m", stock: 0, baseUnit: "sheet" });
    const prod = item({
      id: "p",
      stock: 0,
      baseUnit: "box",
      bom: [{ materialId: "m", qty: 1, unit: "ream" }],
    });
    const convs = [{ fromUnit: "ream", toUnit: "sheet", factor: 500 }];
    const back = restoreStock(
      [{ itemId: "p", qty: 2, unit: "box" } as SaleLine],
      [mat, prod],
      convs
    );
    expect(back.find((u) => u.id === "m")?.newStock).toBe(1000);
    expect(back.find((u) => u.id === "p")).toBeUndefined();
  });

  it("ignores lines whose item no longer exists", () => {
    const back = restoreStock([{ itemId: "gone", qty: 4 } as SaleLine], []);
    expect(back).toEqual([]);
  });
});

describe("decrementStock", () => {
  it("decrements simple items", () => {
    const a = item({ id: "a", stock: 10 });
    const out = decrementStock([{ itemId: "a", qty: 3 } as SaleLine], [a]);
    expect(out).toEqual([{ id: "a", newStock: 7 }]);
  });

  it("converts sale UOM to base via the central engine (10 Reams -> 5000 Sheets)", () => {
    const a = item({ id: "a", stock: 5000, baseUnit: "sheet", saleUnit: "ream" });
    const convs = [{ fromUnit: "ream", toUnit: "sheet", factor: 500 }];
    const out = decrementStock(
      [{ itemId: "a", qty: 10, unit: "ream" } as SaleLine],
      [a],
      convs
    );
    expect(out).toEqual([{ id: "a", newStock: 0 }]);
  });

  it("falls back to 1:1 when no conversion path exists", () => {
    const a = item({ id: "a", stock: 10, baseUnit: "sheet", saleUnit: "ream" });
    const out = decrementStock(
      [{ itemId: "a", qty: 3, unit: "ream" } as SaleLine],
      [a],
      []
    );
    expect(out).toEqual([{ id: "a", newStock: 7 }]);
  });

  it("scales BOM lines in transaction units, converts once to base", () => {
    const mat = item({ id: "m", stock: 1000, baseUnit: "sheet" });
    // 1 ream of material per box sold; ream -> sheet = 500.
    const prod = item({
      id: "p",
      stock: 0,
      baseUnit: "box",
      bom: [{ materialId: "m", qty: 1, unit: "ream" }],
    });
    const convs = [{ fromUnit: "ream", toUnit: "sheet", factor: 500 }];
    const out = decrementStock(
      [{ itemId: "p", qty: 2, unit: "box" } as SaleLine],
      [mat, prod],
      convs
    );
    // 2 boxes x 1 ream = 2 reams = 1000 sheets -> stock 0.
    expect(out.find((u) => u.id === "m")?.newStock).toBe(0);
  });
});

describe("convertUnit delegation", () => {
  it("resolves multi-level paths through the central engine", async () => {
    const { convertUnit } = await import("@/lib/pos");
    const convs = [
      { fromUnit: "ream", toUnit: "sheet", factor: 500 },
      { fromUnit: "sheet", toUnit: "page", factor: 2 },
    ];
    expect(convertUnit(1, "ream", "page", convs)).toBe(1000);
    expect(convertUnit(1, "ream", "kg", convs)).toBe(1); // fallback 1:1
  });
});
