import { afterEach, describe, expect, it } from "vitest";
import {
  caretAfterDigits,
  countDigits,
  DEFAULT_NUMBER_FORMAT,
  formatMoneyWithFormat,
  formatPlainNumber,
  formatForDisplay,
  formatForTyping,
  getActiveNumberFormat,
  groupDigits,
  parseTypedNumber,
  setActiveNumberFormat,
  type ActiveNumberFormat,
} from "./numberFormat";
import { formatCurrency, formatMoney, formatNumber } from "./utils";

const western: ActiveNumberFormat = {
  thousand: ",",
  decimal: ".",
  places: 2,
  grouping: "western",
  currency: "USD",
};

afterEach(() => {
  setActiveNumberFormat(DEFAULT_NUMBER_FORMAT);
});

describe("digit grouping", () => {
  it("groups western digits in threes", () => {
    expect(groupDigits("1234567", ",", "western")).toBe("1,234,567");
    expect(groupDigits("999999999.99".split(".")[0], ",", "western")).toBe(
      "999,999,999",
    );
  });

  it("groups indian digits in twos after the last three", () => {
    expect(groupDigits("1234567", ",", "indian")).toBe("12,34,567");
    expect(groupDigits("123456", ",", "indian")).toBe("1,23,456");
  });

  it("uses the shop's separator", () => {
    expect(groupDigits("1234567", ".", "western")).toBe("1.234.567");
    expect(groupDigits("1234567", " ", "western")).toBe("1 234 567");
  });
});

describe("plain numbers", () => {
  it("applies precision, separators and grouping", () => {
    expect(formatPlainNumber(1234567.89, western)).toBe("1,234,567.89");
    expect(formatPlainNumber(-1234567.89, western)).toBe("-1,234,567.89");
    expect(formatPlainNumber(1234567.89, { ...western, places: 0 })).toBe(
      "1,234,568",
    );
    expect(
      formatPlainNumber(1234567.89, {
        ...western,
        thousand: ".",
        decimal: ",",
      }),
    ).toBe("1.234.567,89");
    expect(
      formatPlainNumber(1234567.89, { ...western, grouping: "indian" }),
    ).toBe("12,34,567.89");
  });

  it("drops the fraction for currencies without minor units", () => {
    expect(formatPlainNumber(1234.56, western, "UGX")).toBe("1,235");
  });
});

describe("money", () => {
  it("keeps the currency symbol and its position", () => {
    expect(formatMoneyWithFormat(1234.56, "USD", "en-US", western)).toBe(
      "$1,234.56",
    );
    expect(formatMoneyWithFormat(1234.56, "EUR", "en-US", western)).toBe(
      "€1,234.56",
    );
    // Intl separates a currency code from the digits with a non-breaking
    // space; normalise it before comparing.
    expect(
      formatMoneyWithFormat(1234.56, "UGX", "en-US", western)
        .split("\u00a0")
        .join(" "),
    ).toBe("UGX 1,235");
  });

  it("prints a negative amount with the sign in front", () => {
    expect(formatMoneyWithFormat(-1234.56, "USD", "en-US", western)).toBe(
      "-$1,234.56",
    );
  });
});

describe("app-wide application", () => {
  it("formats every screen with the active shop format", () => {
    setActiveNumberFormat({
      thousand: ".",
      decimal: ",",
      places: 2,
      grouping: "western",
      currency: "EUR",
    });

    expect(getActiveNumberFormat().thousand).toBe(".");
    expect(formatCurrency(1234567.89, "EUR")).toBe("€1.234.567,89");
    expect(formatNumber(1234567.89, "EUR")).toBe("1.234.567,89");
    expect(formatMoney(1234.56, "EUR")).toBe("€1.234,56");
  });

  it("keeps the previous value when a field is missing", () => {
    setActiveNumberFormat({ thousand: " " });
    setActiveNumberFormat({ decimal: "," });
    expect(getActiveNumberFormat().thousand).toBe(" ");
    expect(getActiveNumberFormat().decimal).toBe(",");
  });
});

describe("live typing", () => {
  const western: ActiveNumberFormat = {
    thousand: ",",
    decimal: ".",
    places: 2,
    grouping: "western",
    currency: "USD",
  };
  const european: ActiveNumberFormat = {
    ...western,
    thousand: ".",
    decimal: ",",
  };
  const indian: ActiveNumberFormat = { ...western, grouping: "indian" };

  it("groups the digits while they are typed", () => {
    expect(formatForTyping("50000", western)).toBe("50,000");
    expect(formatForTyping("1234567", western)).toBe("1,234,567");
    expect(formatForTyping("1234567", indian)).toBe("12,34,567");
    expect(formatForTyping("1234.56", european)).toBe("1.234,56");
  });

  it("keeps the sign and the decimal mark the user typed", () => {
    expect(formatForTyping("-50000", western)).toBe("-50,000");
    expect(formatForTyping("50000.", western)).toBe("50,000.");
    expect(formatForTyping("50000.5", western)).toBe("50,000.5");
  });

  it("ignores separators the user types", () => {
    expect(formatForTyping("50,000", western)).toBe("50,000");
    // A space typed in a shop that groups with a dot becomes the shop's dot.
    expect(formatForTyping("1 234", european)).toBe("1.234");
  });

  it("reads the typed amount back in every format", () => {
    expect(parseTypedNumber("50,000.25", western)).toBe(50000.25);
    expect(parseTypedNumber("1.234,56", european)).toBe(1234.56);
    expect(parseTypedNumber("1 234 567,89", european)).toBe(1234567.89);
    expect(parseTypedNumber("-5,000", western)).toBe(-5000);
    expect(parseTypedNumber("", western)).toBe(0);
    expect(parseTypedNumber("abc", western)).toBe(0);
  });

  it("accepts a plain dot on a keypad when it cannot be a separator", () => {
    // European shop: "." is the thousand separator, so a dot stays a separator.
    expect(parseTypedNumber("1.234", european)).toBe(1234);
    // Western shop: "." is the decimal mark.
    expect(parseTypedNumber("1.25", western)).toBe(1.25);
  });

  it("shows the full amount with the shop's precision when not editing", () => {
    expect(formatForDisplay(50000, western)).toBe("50,000.00");
    expect(formatForDisplay(50000.5, western)).toBe("50,000.50");
    expect(formatForDisplay(1234567.89, european)).toBe("1.234.567,89");
    expect(formatForDisplay(0, western)).toBe("0.00");
    expect(formatForDisplay(null, western)).toBe("");
  });

  it("keeps the caret on the same digit when a separator appears", () => {
    expect(countDigits("12,3")).toBe(3);
    // After the third digit of "12,345" the caret sits at index 4.
    expect(caretAfterDigits("12,345", 3)).toBe(4);
    expect(caretAfterDigits("12,345", 0)).toBe(0);
    expect(caretAfterDigits("12,345", 5)).toBe(6);
  });
});
