import { describe, expect, it } from "vitest";
import {
  buildWorksheetRows,
  parseCsv,
  planWorksheetUpload,
  worksheetToCsv,
  type WorksheetItem,
} from "./stockWorksheet";

const items: WorksheetItem[] = [
  { id: "a", sku: "PAP-001", name: "A4 Paper", category: "Paper", baseUnit: "ream", stock: 20 },
  { id: "b", sku: "INK-002", name: "Black Ink, 1L", category: "Ink", baseUnit: "btl", stock: 5 },
];

describe("buildWorksheetRows", () => {
  it("emits one row per item with a blank counted cell", () => {
    const rows = buildWorksheetRows(items);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(["PAP-001", "A4 Paper", "Paper", "ream", "20", "", ""]);
  });
});

describe("worksheetToCsv + parseCsv round-trip", () => {
  it("survives commas and quotes in names", () => {
    const csv = worksheetToCsv(buildWorksheetRows(items));
    expect(csv.split("\n")[0]).toBe("SKU,Item,Category,Unit,System Qty,Counted Qty,Notes");
    const back = parseCsv(csv);
    expect(back[2][1]).toBe("Black Ink, 1L");
  });

  it("parses CRLF and escaped quotes", () => {
    const rows = parseCsv('SKU,Item,Counted Qty\r\nA,"X ""big"" one",3\r\n');
    expect(rows).toEqual([
      ["SKU", "Item", "Counted Qty"],
      ["A", 'X "big" one', "3"],
    ]);
  });
});

describe("planWorksheetUpload", () => {
  const csv = (body: string) =>
    planWorksheetUpload(parseCsv(`SKU,Item,Category,Unit,System Qty,Counted Qty,Notes\n${body}`), items);

  it("matches by SKU case-insensitively and computes deltas", () => {
    const p = csv('pap-001,A4 Paper,Paper,ream,20,18,""\n');
    expect(p.planned).toHaveLength(1);
    expect(p.planned[0].counted).toBe(18);
    expect(p.planned[0].delta).toBe(-2);
  });

  it("falls back to item-name match", () => {
    const p = csv(',Black Ink 1L,,,,4,\n');
    expect(p.planned).toHaveLength(1);
    expect(p.planned[0].item.id).toBe("b");
  });

  it("skips blank counted cells without zeroing stock", () => {
    const p = csv('PAP-001,A4 Paper,Paper,ream,20,,\n');
    expect(p.planned).toHaveLength(0);
    expect(p.skippedBlank).toBe(1);
  });

  it("reports unknown SKUs and invalid quantities", () => {
    const p = csv('NOPE,Missing,Paper,ream,0,3,\nPAP-001,A4 Paper,Paper,ream,20,lots,\nINK-002,Black Ink 1L,Ink,btl,5,-2,\n');
    expect(p.unknown).toEqual(["NOPE"]);
    expect(p.invalid).toHaveLength(2);
  });

  it("lets the last duplicate win", () => {
    const p = csv('PAP-001,A4 Paper,Paper,ream,20,18,\nPAP-001,A4 Paper,Paper,ream,20,19,\n');
    expect(p.planned).toHaveLength(1);
    expect(p.planned[0].counted).toBe(19);
    expect(p.duplicates).toEqual(["PAP-001"]);
  });
});
