import { describe, expect, it } from "vitest";
import { mapSettings } from "@/lib/mappers";

describe("mapSettings empty-data safety", () => {
  it("fills safe defaults for a bare {id} row (fresh DB)", () => {
    const s = mapSettings({ id: "main" });
    expect(s.shopName).toBe("My Shop");
    expect(s.currency).toBe("USD");
    expect(s.invoice.prefix).toBe("PB-");
    expect(s.invoice.nextNumber).toBe(1000);
    expect(s.billing?.plan).toBe("starter");
    expect(s.printer.successPopupMs).toBe(1500);
    expect(s.printer.receiptPreviewMs).toBe(2000);
  });

  it("keeps real values when present", () => {
    const s = mapSettings({ id: "main", shop_name: "Kampala Prints", currency: "UGX" });
    expect(s.shopName).toBe("Kampala Prints");
    expect(s.currency).toBe("UGX");
  });

  it("maps the after-sale timings, including no-preview and keep-open", () => {
    const custom = mapSettings({
      id: "main",
      printer: { successPopupMs: 3000, receiptPreviewMs: 5000 },
    });
    expect(custom.printer.successPopupMs).toBe(3000);
    expect(custom.printer.receiptPreviewMs).toBe(5000);

    expect(
      mapSettings({ id: "main", printer: { receiptPreviewMs: 0 } }).printer
        .receiptPreviewMs
    ).toBe(0);

    expect(
      mapSettings({ id: "main", printer: { receiptPreviewMs: -1 } }).printer
        .receiptPreviewMs
    ).toBe(-1);
  });
});
