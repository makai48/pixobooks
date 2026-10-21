import { describe, expect, it } from "vitest";
import {
  formatDocTimestamp,
  isDocumentNumber,
  makeDocumentNumber,
  randomLetter,
  resetDocNumberGuard,
} from "@/lib/docNumber";

describe("formatDocTimestamp", () => {
  it("formats the spec example exactly (14 Oct 2026 19:30:45 local)", () => {
    const d = new Date(2026, 9, 14, 19, 30, 45, 237);
    expect(formatDocTimestamp(d)).toBe("261014193045");
    expect(formatDocTimestamp(d)).toHaveLength(12);
  });

  it("pads every component with leading zeros", () => {
    // 5 Jan 2027 03:04:05 local → 270105030405
    const d = new Date(2027, 0, 5, 3, 4, 5, 6);
    expect(formatDocTimestamp(d)).toBe("270105030405");
  });

  it("drops milliseconds (seconds precision only)", () => {
    expect(formatDocTimestamp(new Date(2026, 0, 1, 0, 0, 0, 0))).toBe(
      "260101000000"
    );
    expect(formatDocTimestamp(new Date(2026, 0, 1, 0, 0, 0, 999))).toBe(
      "260101000000"
    );
  });
});

describe("makeDocumentNumber", () => {
  it("builds receipt and invoice numbers with prefix + separator letters", () => {
    resetDocNumberGuard();
    const at = new Date(2026, 9, 14, 19, 30, 45, 237);
    expect(makeDocumentNumber("receipt", "PX", at, ["K", "Q", "Z"])).toBe(
      "RPXK261014Q193045Z"
    );
    resetDocNumberGuard();
    expect(makeDocumentNumber("invoice", "PX", at, ["K", "Q", "Z"])).toBe(
      "IPXK261014Q193045Z"
    );
  });

  it("places random letters between prefix/date, date/time, and at the end", () => {
    resetDocNumberGuard();
    const n = makeDocumentNumber("receipt", "PB-");
    expect(n).toMatch(/^RPB-[A-Z]\d{6}[A-Z]\d{6}[A-Z]$/);
  });

  it("never draws H, I, or O as separators (confusable on print)", () => {
    for (let i = 0; i < 500; i++) {
      const l = randomLetter();
      expect(l).toMatch(/^[A-Z]$/);
      expect("HIO").not.toContain(l);
    }
    resetDocNumberGuard();
    const at = new Date(2026, 9, 14, 19, 30, 45);
    for (let i = 0; i < 100; i++) {
      const n = makeDocumentNumber(i % 2 ? "invoice" : "receipt", "PX", at);
      const m = n.match(/^[RI].*?([A-Z])\d{6}([A-Z])\d{6}([A-Z])$/);
      expect(m).not.toBeNull();
      for (const l of m!.slice(1)) expect("HIO").not.toContain(l);
    }
  });

  it("never visibly repeats within the same second on one device", () => {
    resetDocNumberGuard();
    const at = new Date(2026, 9, 14, 19, 30, 45, 237);
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      // Same frozen second: the letter redraw must separate them.
      const n = makeDocumentNumber("receipt", "PX", at);
      expect(seen.has(n)).toBe(false);
      seen.add(n);
      expect(n).toMatch(/^RPX[A-Z]\d{6}[A-Z]\d{6}[A-Z]$/);
    }
  });
});

describe("isDocumentNumber", () => {
  it("accepts the required visible format only", () => {
    expect(isDocumentNumber("RPXK261014Q193045Z")).toBe(true);
    expect(isDocumentNumber("IPB-K261014Q193045Z")).toBe(true);
    expect(isDocumentNumber("PB-1000")).toBe(false); // legacy counter format
    expect(isDocumentNumber("RPXK261014Q193045237Z")).toBe(false); // ms variant
    expect(isDocumentNumber("RPXK261014Q193045")).toBe(false); // truncated
    expect(isDocumentNumber(null)).toBe(false);
  });
});
