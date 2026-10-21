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
  });

  it("keeps real values when present", () => {
    const s = mapSettings({ id: "main", shop_name: "Kampala Prints", currency: "UGX" });
    expect(s.shopName).toBe("Kampala Prints");
    expect(s.currency).toBe("UGX");
  });
});
