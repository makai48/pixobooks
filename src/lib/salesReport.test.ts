import { describe, expect, it } from "vitest";
import { byTransactionDateDesc, inDayRange } from "./salesReport";

/**
 * Regression coverage for the Sales Report: imported sales used to show on the
 * import date (or vanish behind a default "today" filter). They now keep their
 * original `created_at`, and the report reads every transaction by the
 * business-local day it happened.
 */

describe("inDayRange", () => {
  it("includes an old imported sale when the report is not date-filtered", () => {
    // All-time view: no lower/upper bound must never hide history.
    expect(inDayRange("2024-03-15T12:00:00Z", { from: "", to: "" })).toBe(true);
  });

  it("matches an imported sale by its transaction day, not the import day", () => {
    const imported = "2024-03-15T12:00:00Z";
    expect(inDayRange(imported, { from: "2024-03-01", to: "2024-03-31" })).toBe(true);
    expect(inDayRange(imported, { from: "2024-04-01", to: "2024-04-30" })).toBe(false);
  });

  it("supports open-ended windows", () => {
    const imported = "2024-03-15T12:00:00Z";
    expect(inDayRange(imported, { from: "2024-01-01", to: "" })).toBe(true);
    expect(inDayRange(imported, { from: "", to: "2024-02-29" })).toBe(false);
  });

  it("drops rows with an unusable timestamp instead of filing them on today", () => {
    expect(inDayRange("not-a-date", { from: "", to: "" })).toBe(false);
  });
});

describe("byTransactionDateDesc", () => {
  it("orders imported and live sales together by transaction date", () => {
    const rows = [
      { id: "imported-old", createdAt: "2023-01-10T09:00:00Z" },
      { id: "live-new", createdAt: "2026-10-29T09:00:00Z" },
      { id: "imported-mid", createdAt: "2024-06-01T09:00:00Z" },
    ];

    expect([...rows].sort(byTransactionDateDesc).map((r) => r.id)).toEqual([
      "live-new",
      "imported-mid",
      "imported-old",
    ]);
  });
});
