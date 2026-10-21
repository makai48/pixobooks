import { describe, expect, it } from "vitest";
import { formatPhone, isValidPhone, joinPhone, splitPhone } from "./referenceData";

describe("splitPhone", () => {
  it("splits a stored dial-prefixed number", () => {
    expect(splitPhone("+256 712 345 678")).toEqual({
      dial: "256",
      number: "712 345 678",
    });
  });

  it("keeps unprefixed numbers intact with no dial", () => {
    expect(splitPhone("712345678")).toEqual({ dial: "", number: "712345678" });
  });

  it("treats an empty value safely", () => {
    expect(splitPhone("")).toEqual({ dial: "", number: "" });
  });
});

describe("joinPhone", () => {
  it("combines dial and digits into the stored format", () => {
    expect(joinPhone("256", "712 345 678")).toBe("+256 712345678");
  });

  it("strips number punctuation and dial non-digits", () => {
    expect(joinPhone("+2 5 6", "712-345-678")).toBe("+256 712345678");
  });

  it("keeps plain digits when no dial is selected", () => {
    expect(joinPhone("", "712 345 678")).toBe("712345678");
  });

  it("returns empty when there are no number digits", () => {
    expect(joinPhone("256", " ")).toBe("");
    expect(joinPhone("256", "")).toBe("");
  });
});

describe("formatPhone", () => {
  it("formats a dial-prefixed display value", () => {
    expect(formatPhone("256", "712 345 678")).toBe("+256 712345678");
  });
});

describe("isValidPhone", () => {
  it("accepts 4 to 15 number digits with a dial code", () => {
    expect(isValidPhone("256", "7123")).toBe(true);
    expect(isValidPhone("256", "712 345 678")).toBe(true);
    expect(isValidPhone("256", "123456789012345")).toBe(true);
  });

  it("rejects missing dial, short numbers, long numbers, and letters", () => {
    expect(isValidPhone("", "712345678")).toBe(false);
    expect(isValidPhone("256", "123")).toBe(false);
    expect(isValidPhone("256", "1234567890123456")).toBe(false);
    expect(isValidPhone("abc", "712345678")).toBe(false);
  });
});
