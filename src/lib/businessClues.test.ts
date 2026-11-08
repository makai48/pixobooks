import { describe, expect, it } from "vitest";
import {
  addressHint,
  businessClues,
  businessNameHint,
  categoryHint,
  emailHint,
  holdHint,
  itemHint,
  receiptFooterHint,
  receiptHeaderHint,
} from "./businessClues";

describe("business type clues", () => {
  it("uses the declared type for name and item examples", () => {
    expect(businessNameHint("Pharmacy")).toBe("e.g. City Care Pharmacy");
    expect(itemHint("Restaurant / Cafe")).toBe("e.g. Chicken Sandwich");
    expect(categoryHint("Hardware")).toBe("e.g. Building Materials");
  });

  it("falls back to a generic business for unknown types", () => {
    expect(businessClues("").businessName).toBe("Your Business");
    expect(businessClues("Unknown type").item).toBe("Product or service name");
  });

  it("localises the address with the country provided at setup", () => {
    expect(addressHint("Retail", "Uganda")).toBe(
      "e.g. 12 Market Street, Uganda"
    );
    expect(addressHint("Retail")).toBe(
      "e.g. 12 Market Street, your country"
    );
  });

  it("derives the support email from the business name", () => {
    expect(emailHint("Sunrise Retail Ltd")).toBe("support@sunriseretailltd.com");
    expect(emailHint("")).toBe("support@yourbusiness.com");
  });

  it("offers receipt copy that matches the trade", () => {
    expect(receiptHeaderHint("Restaurant / Cafe")).toBe(
      "Thank you for dining with us!"
    );
    expect(receiptFooterHint("Retail")).toBe(
      "Goods sold are not returnable after 7 days."
    );
    expect(receiptHeaderHint("Wholesale")).toBe("Thank you for your order!");
  });

  it("gives hold tickets a trade-appropriate label", () => {
    expect(holdHint("Restaurant / Cafe")).toContain("Table");
    expect(holdHint("Motor Spares / Garage")).toContain("Job card");
    expect(holdHint("Retail")).toContain("Customer pickup");
  });
});
