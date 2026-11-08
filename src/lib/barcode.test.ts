import { describe, expect, it } from "vitest";
import {
  barcodeLabel,
  toJsBarcodeFormat,
  zxingFormatName,
} from "./barcode";

describe("barcode format mapping", () => {
  it("maps ZXing names to JsBarcode symbologies", () => {
    expect(toJsBarcodeFormat("EAN_13")).toBe("EAN13");
    expect(toJsBarcodeFormat("EAN_8")).toBe("EAN8");
    expect(toJsBarcodeFormat("UPC_A")).toBe("UPC");
    expect(toJsBarcodeFormat("CODE_128")).toBe("CODE128");
    expect(toJsBarcodeFormat("ITF")).toBe("ITF");
  });

  it("falls back to Code 128 for unknown formats", () => {
    expect(toJsBarcodeFormat("QR_CODE")).toBe("CODE128");
    expect(toJsBarcodeFormat(null)).toBe("CODE128");
  });

  it("reverse-maps ZXing numeric formats", () => {
    const enumObject = { 7: "EAN_13", 14: "UPC_A", 4: "CODE_128" };
    expect(zxingFormatName(enumObject, 7)).toBe("EAN_13");
    expect(zxingFormatName(enumObject, 14)).toBe("UPC_A");
    expect(zxingFormatName(enumObject, 99)).toBe("CODE128");
    expect(zxingFormatName(enumObject, undefined)).toBe("CODE128");
  });

  it("gives human-readable labels for the result screen", () => {
    expect(barcodeLabel("EAN_13")).toBe("EAN-13");
    expect(barcodeLabel("EAN_8")).toBe("EAN-8");
    expect(barcodeLabel("UPC_E")).toBe("UPC");
    expect(barcodeLabel("CODE_128")).toBe("Code 128");
  });
});
