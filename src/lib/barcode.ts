/**
 * Barcode symbology helpers.
 *
 * ZXing reports formats as names such as "EAN_13"; JsBarcode expects "EAN13".
 * Only 1D retail symbologies are enabled in the scanner, so every decoded
 * value can be re-rendered as a crisp vector barcode.
 */

const TO_JSBARCODE: Record<string, string> = {
  EAN_13: "EAN13",
  EAN_8: "EAN8",
  UPC_A: "UPC",
  UPC_E: "UPC",
  CODE_128: "CODE128",
  CODE_39: "CODE39",
  ITF: "ITF",
  CODABAR: "CODABAR",
};

export const BARCODE_FORMATS = [
  "EAN_13",
  "EAN_8",
  "UPC_A",
  "UPC_E",
  "CODE_128",
  "CODE_39",
  "ITF",
  "CODABAR",
] as const;

export function toJsBarcodeFormat(format?: string | null): string {
  return TO_JSBARCODE[(format || "").toUpperCase()] ?? "CODE128";
}

/** Reverse-map a ZXing numeric BarcodeFormat to its name. */
export function zxingFormatName(
  enumObject: Record<string | number, unknown>,
  value?: number
): string {
  if (typeof value !== "number") return "CODE128";
  const name = (enumObject as Record<number, string>)[value];
  return typeof name === "string" ? name : "CODE128";
}

/** Friendly label shown under the result barcode. */
export function barcodeLabel(format?: string | null): string {  const key = (format || "").toUpperCase();
  if (key === "EAN_13") return "EAN-13";
  if (key === "EAN_8") return "EAN-8";
  if (key === "UPC_A" || key === "UPC_E") return "UPC";
  if (key === "CODE_128") return "Code 128";
  if (key === "CODE_39") return "Code 39";
  if (key === "ITF") return "ITF";
  if (key === "CODABAR") return "Codabar";
  return "Code 128";
}

/** Decorative but valid EAN-13 shown inside the live scanning frame. */
export const SAMPLE_BARCODE = "1234567890128";
