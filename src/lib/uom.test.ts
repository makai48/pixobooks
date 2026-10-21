import { describe, expect, it } from "vitest";
import {
  averageInventoryCost,
  convertPrice,
  convertQuantity,
  relatedUoms,
  validateTransactionQty,
  validateConversionProposal,
  validateCompatibility,
  validateProductUomConfig,
  deriveInventoryCost,
  describeRelationship,
  isUomDiscrete,
  uomRounding,
  type UomEdge,
  type UomInfo,
} from "@/lib/uom";
import type { UnitConversion } from "@/types";

const C = (fromUnit: string, toUnit: string, factor: number, id = `${fromUnit}-${toUnit}`) =>
  ({ id, fromUnit, toUnit, factor }) as UnitConversion;

const CHAIN = [C("ream", "sheet", 500, "1"), C("sheet", "page", 2, "2")];

const UOMS = [
  { code: "ream", discrete: true },
  { code: "sheet", discrete: true },
  { code: "page", discrete: true },
  { code: "pc", discrete: true },
  { code: "box", discrete: true },
  { code: "kg", discrete: false },
  { code: "g", discrete: false },
  { code: "l", discrete: false },
  { code: "ml", discrete: false },
];

describe("convertQuantity (§2-3)", () => {
  it("1 Ream = 500 Sheets", () => {
    expect(convertQuantity(1, "ream", "sheet", CHAIN)?.value).toBe(500);
  });

  it("1 Sheet = 2 Pages", () => {
    expect(convertQuantity(1, "sheet", "page", CHAIN)?.value).toBe(2);
  });

  it("multi-level: 1 Ream = 1,000 Pages", () => {
    const r = convertQuantity(1, "ream", "page", CHAIN);
    expect(r?.value).toBe(1000);
    expect(r?.path).toEqual(["ream", "sheet", "page"]);
  });

  it("reverse derived automatically: 1000 Pages = 1 Ream", () => {
    expect(convertQuantity(1000, "page", "ream", CHAIN)?.value).toBeCloseTo(1, 9);
  });

  it("reverse single hop: 500 Sheets = 1 Ream", () => {
    expect(convertQuantity(500, "sheet", "ream", CHAIN)?.value).toBeCloseTo(1, 9);
  });

  it("same unit is identity", () => {
    expect(convertQuantity(3, "sheet", "sheet", CHAIN)?.value).toBe(3);
  });

  it("fractional mathematical equivalence allowed: 1 Page = 0.5 Sheet", () => {
    expect(convertQuantity(1, "page", "sheet", CHAIN)?.value).toBe(0.5);
  });

  it("unreachable returns null", () => {
    expect(convertQuantity(1, "ream", "kg", CHAIN)).toBeNull();
  });

  it("codes are case-insensitive", () => {
    expect(convertQuantity(1, "REAM", "Sheet", CHAIN)?.value).toBe(500);
  });

  it("item-local edges participate (per-item ratios, one engine)", () => {
    const extra: UomEdge[] = [{ from: "box", to: "pc", factor: 12 }];
    expect(convertQuantity(2, "box", "pc", CHAIN, extra)?.value).toBe(24);
    expect(convertQuantity(24, "pc", "box", CHAIN, extra)?.value).toBe(2);
  });
});

describe("relatedUoms (§8)", () => {
  it("recognizes the full chain", () => {
    expect(relatedUoms("ream", CHAIN).sort()).toEqual(["page", "ream", "sheet"]);
  });

  it("isolated units relate only to themselves", () => {
    expect(relatedUoms("kg", CHAIN)).toEqual(["kg"]);
  });
});

describe("validateTransactionQty (§4-7)", () => {
  it("rejects 0.5 Sheet when Sheet is discrete", () => {
    const r = validateTransactionQty(0.5, "sheet", UOMS);
    expect(r.ok).toBe(false);
  });

  it("accepts 1 and 5 Sheets", () => {
    expect(validateTransactionQty(1, "sheet", UOMS).ok).toBe(true);
    expect(validateTransactionQty(100, "sheet", UOMS).ok).toBe(true);
  });

  it("accepts fractions for divisible UOMs (2.5 Kg)", () => {
    expect(validateTransactionQty(2.5, "kg", UOMS).ok).toBe(true);
    expect(validateTransactionQty(0.25, "l", UOMS).ok).toBe(true);
  });

  it("rejects non-positive and non-numeric", () => {
    expect(validateTransactionQty(0, "kg", UOMS).ok).toBe(false);
    expect(validateTransactionQty(-2, "kg", UOMS).ok).toBe(false);
    expect(validateTransactionQty("abc", "kg", UOMS).ok).toBe(false);
  });

  it("legacy item override permits fractions on discrete UOMs", () => {
    expect(validateTransactionQty(0.5, "sheet", UOMS, { itemAllowDecimalQty: true }).ok).toBe(true);
  });

  it("unknown UOM falls back to the item flag (default integer)", () => {
    expect(validateTransactionQty(0.5, "mystery", UOMS).ok).toBe(false);
    expect(validateTransactionQty(0.5, "mystery", UOMS, { itemAllowDecimalQty: true }).ok).toBe(true);
  });
});

describe("isUomDiscrete", () => {
  it("flags discrete vs divisible per master", () => {
    expect(isUomDiscrete("sheet", UOMS)).toBe(true);
    expect(isUomDiscrete("ream", UOMS)).toBe(true);
    expect(isUomDiscrete("box", UOMS)).toBe(true);
    expect(isUomDiscrete("kg", UOMS)).toBe(false);
    expect(isUomDiscrete("ml", UOMS)).toBe(false);
  });
});

describe("validateConversionProposal (§9)", () => {
  it("rejects zero/negative factors", () => {
    expect(validateConversionProposal({ fromUnit: "a", toUnit: "b", factor: 0 }, []).ok).toBe(false);
    expect(validateConversionProposal({ fromUnit: "a", toUnit: "b", factor: -3 }, []).ok).toBe(false);
  });

  it("rejects same-UOM conversions", () => {
    expect(validateConversionProposal({ fromUnit: "sheet", toUnit: "Sheet", factor: 1 }, []).ok).toBe(false);
  });

  it("rejects duplicates", () => {
    const r = validateConversionProposal({ fromUnit: "ream", toUnit: "sheet", factor: 500 }, CHAIN);
    expect(r.ok).toBe(false);
  });

  it("rejects conflicting paths: 1 Ream = 900 Pages", () => {
    const r = validateConversionProposal({ fromUnit: "ream", toUnit: "page", factor: 900 }, CHAIN);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("1000");
  });

  it("accepts consistent redundant paths within tolerance", () => {
    const r = validateConversionProposal({ fromUnit: "ream", toUnit: "page", factor: 1000 }, CHAIN);
    expect(r.ok).toBe(true);
  });

  it("accepts genuinely new relationships", () => {
    expect(validateConversionProposal({ fromUnit: "box", toUnit: "pc", factor: 12 }, CHAIN).ok).toBe(true);
  });

  it("editing the same row is not a duplicate", () => {
    const r = validateConversionProposal({ fromUnit: "ream", toUnit: "sheet", factor: 500, excludeId: "1" }, CHAIN);
    expect(r.ok).toBe(true);
  });
});

describe("categories + reference ratios (§2-3, §9)", () => {
  const FAM: UomInfo[] = [
    { code: "sheet", discrete: true, categoryId: "paper", ratio: 1 },
    { code: "ream", discrete: true, categoryId: "paper", ratio: 500 },
    { code: "page", discrete: true, categoryId: "paper", ratio: 0.5 },
    { code: "kg", discrete: false, categoryId: "weight", ratio: 1 },
    { code: "g", discrete: false, categoryId: "weight", ratio: 0.001 },
  ];

  it("resolves from the reference without pair rows", () => {
    expect(convertQuantity(1, "ream", "page", [], [], FAM)?.value).toBe(1000);
    expect(convertQuantity(2, "kg", "g", [], [], FAM)?.value).toBe(2000);
  });

  it("rejects cross-category conversion (kg → litre)", () => {
    const withLitre: UomInfo[] = [
      ...FAM,
      { code: "litre", discrete: false, categoryId: "volume", ratio: 1 },
    ];
    expect(convertQuantity(1, "kg", "litre", [], [], withLitre)).toBeNull();
    expect(validateCompatibility("kg", "litre", withLitre).compatible).toBe(false);
  });

  it("unknown families stay compatible (legacy fallback)", () => {
    expect(validateCompatibility("ream", "mystery", FAM).compatible).toBe(true);
    expect(validateCompatibility("ream", "sheet", []).compatible).toBe(true);
  });

  it("relatedUoms respects families", () => {
    const rel = relatedUoms("ream", CHAIN, [], FAM);
    expect(rel).toContain("sheet");
    expect(rel).toContain("page");
    expect(rel).not.toContain("kg");
  });
});

describe("precision / rounding (§7-8)", () => {
  const FAM: UomInfo[] = [
    { code: "sheet", discrete: true, rounding: 1 },
    { code: "kg", discrete: false, rounding: 0.001 },
    { code: "metre", discrete: false, rounding: 0.01 },
  ];

  it("uomRounding reads the increment", () => {
    expect(uomRounding("sheet", FAM)).toBe(1);
    expect(uomRounding("kg", FAM)).toBe(0.001);
    expect(uomRounding("metre", FAM)).toBe(0.01);
  });

  it("accepts valid increments, rejects the rest", () => {
    expect(validateTransactionQty(2.5, "kg", FAM).ok).toBe(true);
    expect(validateTransactionQty(2.5009, "kg", FAM).ok).toBe(false);
    expect(validateTransactionQty(1.25, "metre", FAM).ok).toBe(true);
    expect(validateTransactionQty(1.253, "metre", FAM).ok).toBe(false);
  });
});

describe("deriveInventoryCost (§10-11, §14-15)", () => {
  it("2 Reams × UGX 25,000 = 1,000 Sheets @ UGX 50/Sheet", () => {
    const r = deriveInventoryCost({
      purchaseQty: 2,
      purchasePrice: 25000,
      purchaseUom: "ream",
      inventoryUom: "sheet",
      conversions: CHAIN,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.convertedQty).toBe(1000);
      expect(r.totalCost).toBe(50000);
      expect(r.unitCost).toBe(50);
    }
  });

  it("cost chains consistently: UGX 25/Ream… per Page = UGX 25", () => {
    const r = deriveInventoryCost({
      purchaseQty: 1,
      purchasePrice: 25000,
      purchaseUom: "ream",
      inventoryUom: "page",
      conversions: CHAIN,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.unitCost).toBe(25);
  });

  it("rejects incompatible or unconnected UOMs and bad prices", () => {
    const FAM: UomInfo[] = [
      { code: "ream", discrete: true, categoryId: "paper", ratio: 500 },
      { code: "kg", discrete: false, categoryId: "weight", ratio: 1 },
    ];
    expect(
      deriveInventoryCost({ purchaseQty: 1, purchasePrice: 10, purchaseUom: "ream", inventoryUom: "kg", conversions: CHAIN, uoms: FAM }).ok
    ).toBe(false);
    expect(
      deriveInventoryCost({ purchaseQty: 0, purchasePrice: 10, purchaseUom: "ream", inventoryUom: "sheet", conversions: CHAIN }).ok
    ).toBe(false);
    expect(
      deriveInventoryCost({ purchaseQty: 1, purchasePrice: -5, purchaseUom: "ream", inventoryUom: "sheet", conversions: CHAIN }).ok
    ).toBe(false);
  });
});

describe("validateProductUomConfig (§17, §23)", () => {
  const FAM: UomInfo[] = [
    { code: "sheet", discrete: true, categoryId: "paper", isActive: true },
    { code: "ream", discrete: true, categoryId: "paper", isActive: true },
    { code: "kg", discrete: false, categoryId: "weight", isActive: true },
    { code: "old", discrete: true, categoryId: "paper", isActive: false },
  ];

  it("accepts a coherent A4-paper configuration", () => {
    expect(
      validateProductUomConfig(
        { purchaseUom: "ream", saleUom: "sheet", baseUom: "sheet", cost: 50 },
        FAM,
        CHAIN
      ).ok
    ).toBe(true);
  });

  it("rejects cross-family purchase UOMs", () => {
    const r = validateProductUomConfig(
      { purchaseUom: "kg", saleUom: "sheet", baseUom: "sheet" },
      FAM,
      CHAIN
    );
    expect(r.ok).toBe(false);
  });

  it("rejects inactive and unknown UOMs", () => {
    expect(
      validateProductUomConfig({ purchaseUom: "old", saleUom: "sheet", baseUom: "sheet" }, FAM, CHAIN).ok
    ).toBe(false);
    expect(
      validateProductUomConfig({ purchaseUom: "mystery", saleUom: "sheet", baseUom: "sheet" }, FAM, CHAIN).ok
    ).toBe(false);
  });

  it("rejects unconnected sale UOMs and negative cost", () => {
    expect(
      validateProductUomConfig({ purchaseUom: "ream", saleUom: "kg", baseUom: "sheet" }, FAM, CHAIN).ok
    ).toBe(false);
    expect(
      validateProductUomConfig({ purchaseUom: "ream", saleUom: "sheet", baseUom: "sheet", cost: -1 }, FAM, CHAIN).ok
    ).toBe(false);
  });
});

describe("convertPrice (§12, §22)", () => {
  it("converts a box-quoted price into per-sheet price", () => {
    const boxSheet = [
      { id: "1", fromUnit: "box", toUnit: "sheet", factor: 100 },
    ];
    const r = convertPrice(12000, "box", "sheet", boxSheet);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(120);
  });

  it("identity when entry unit equals canonical unit", () => {
    const r = convertPrice(7000, "sheet", "sheet", CHAIN);
    expect(r).toEqual({ ok: true, value: 7000 });
  });

  it("rejects incompatible or unconnected price units", () => {
    const FAM: UomInfo[] = [
      { code: "sheet", discrete: true, categoryId: "paper" },
      { code: "kg", discrete: false, categoryId: "weight" },
    ];
    expect(convertPrice(10, "kg", "sheet", CHAIN, FAM).ok).toBe(false);
    expect(convertPrice(-5, "sheet", "sheet", CHAIN).ok).toBe(false);
    expect(convertPrice(10, "ream", "kg", CHAIN).ok).toBe(false);
  });
});

describe("averageInventoryCost (quantity-weighted)", () => {
  it("5,000 @ 50 + 5,000 @ 60 → 10,000 @ 55", () => {
    expect(
      averageInventoryCost({ oldStock: 5000, oldCost: 50, receivedQty: 5000, receivedUnitCost: 60 })
    ).toBe(55);
  });

  it("weights by quantity, not by simple mean", () => {
    // 9,000 @ 50 + 1,000 @ 60 → 51, not 55.
    expect(
      averageInventoryCost({ oldStock: 9000, oldCost: 50, receivedQty: 1000, receivedUnitCost: 60 })
    ).toBe(51);
  });

  it("empty shelf takes the receipt cost", () => {
    expect(
      averageInventoryCost({ oldStock: 0, oldCost: 50, receivedQty: 100, receivedUnitCost: 60 })
    ).toBe(60);
  });

  it("zero receipt keeps the old cost", () => {
    expect(
      averageInventoryCost({ oldStock: 100, oldCost: 50, receivedQty: 0, receivedUnitCost: 60 })
    ).toBe(50);
  });
});

describe("describeRelationship (§1)", () => {
  it("derives without manual entry: 1 Ream = 500 Sheets", () => {
    expect(describeRelationship("ream", "sheet", CHAIN)).toBe("1 ream = 500 sheet");
  });

  it("derives multi-level: 1 Ream = 1000 Pages", () => {
    expect(describeRelationship("ream", "page", CHAIN)).toBe("1 ream = 1000 page");
  });

  it("returns null when unrelated", () => {
    expect(describeRelationship("ream", "kg", CHAIN)).toBeNull();
  });
});
