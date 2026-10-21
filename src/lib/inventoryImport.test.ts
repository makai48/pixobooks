import { describe, expect, it } from "vitest";
import { parseInventoryFile, planImport, toItemPayload, remapBom } from "@/lib/inventoryImport";

describe("parseInventoryFile", () => {
  it("accepts {rows} and bare arrays, dedupes by SKU", () => {
    const a = { sku: " A1 ", name: "Alpha", price: 10 };
    const b = { sku: "a1", name: "Alpha v2", price: 12 };
    const bad = { sku: "", name: "Nope" };
    const out = parseInventoryFile({ rows: [a, b, bad] });
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].name).toBe("Alpha v2");
    expect(out.warnings.length).toBeGreaterThan(0);
  });

  it("rejects non-arrays", () => {
    expect(() => parseInventoryFile({ rows: "nope" })).toThrow();
  });
});

describe("planImport", () => {
  it("inserts new, skips existing unless updateExisting", () => {
    const rows = [{ sku: "A", name: "A" }, { sku: "B", name: "B" }];
    const existing = [{ id: "1", sku: "a", stock: 5 }];
    const skip = planImport(rows, existing, { updateExisting: false, stockMode: "set" });
    expect(skip.find((p) => p.row.sku === "A")?.kind).toBe("skip");
    const upd = planImport(rows, existing, { updateExisting: true, stockMode: "set" });
    expect(upd.find((p) => p.row.sku === "A")?.kind).toBe("update");
  });
});

describe("toItemPayload + remapBom", () => {
  it("builds safe payload with defaults", () => {
    const p = toItemPayload({ sku: " X ", name: "N" }, { stock: -5, imageUrl: null });
    expect(p.sku).toBe("X");
    expect(p.stock).toBe(0);
    expect(p.item_type).toBe("product");
  });

  it("remaps BOM via SKU, drops dangling", () => {
    const mat = { sku: "MAT", name: "Mat" };
    const row = { sku: "P", name: "P", bom: [{ materialId: "src-id", qty: 2 }, { materialId: "missing", qty: 1 }] };
    const byId = new Map([["src-id", mat]]);
    const skuToId = new Map([["mat", "real-id"]]);
    const out = remapBom(row, skuToId, byId);
    expect(out.bom).toEqual([{ materialId: "real-id", qty: 2 }]);
    expect(out.dropped).toBe(1);
  });
});
