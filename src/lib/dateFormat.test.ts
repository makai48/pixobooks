import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_DATE_FORMAT,
  formatDateByPreference,
  formatDateTimeByPreference,
  formatMonthByPreference,
  getActiveDateFormat,
  setActiveDateFormat,
} from "./dateFormat";

// Local wall-clock date: every preset is asserted on local parts, so the test
// is time-zone independent.
const sample = new Date(2026, 10, 7, 14, 5);

describe("formatDateByPreference", () => {
  afterEach(() => setActiveDateFormat(DEFAULT_DATE_FORMAT));

  it("renders every presets the settings screen offers", () => {
    expect(formatDateByPreference(sample, "DD/MM/YYYY")).toBe("07/11/2026");
    expect(formatDateByPreference(sample, "DD MMM YYYY")).toBe("07 Nov 2026");
    expect(formatDateByPreference(sample, "DD MMMM YYYY")).toBe("07 November 2026");
    expect(formatDateByPreference(sample, "D MMM YYYY")).toBe("07 Nov 2026");
    expect(formatDateByPreference(sample, "MM/DD/YYYY")).toBe("11/07/2026");
    expect(formatDateByPreference(sample, "YYYY-MM-DD")).toBe("2026-11-07");
  });

  it("drops the year only for compact D MMM YYYY", () => {
    expect(formatDateByPreference(sample, "D MMM YYYY", true)).toBe("7 Nov");
    expect(formatDateByPreference(sample, "DD/MM/YYYY", true)).toBe("07/11/2026");
  });

  it("returns an em dash for invalid input", () => {
    expect(formatDateByPreference("not-a-date", "DD/MM/YYYY")).toBe("—");
  });

  it("keeps the active preset in sync for the plain helpers", () => {
    expect(getActiveDateFormat()).toBe(DEFAULT_DATE_FORMAT);
    setActiveDateFormat("YYYY-MM-DD");
    expect(getActiveDateFormat()).toBe("YYYY-MM-DD");
    setActiveDateFormat(null);
    expect(getActiveDateFormat()).toBe(DEFAULT_DATE_FORMAT);
  });
});

describe("formatMonthByPreference", () => {
  it("follows the preset for YYYY-MM keys and date values", () => {
    expect(formatMonthByPreference("2026-11", "DD/MM/YYYY")).toBe("11/2026");
    expect(formatMonthByPreference("2026-11", "MM/DD/YYYY")).toBe("11/2026");
    expect(formatMonthByPreference("2026-11", "YYYY-MM-DD")).toBe("2026-11");
    expect(formatMonthByPreference("2026-11", "DD MMM YYYY")).toBe("Nov 2026");
    expect(formatMonthByPreference("2026-11", "D MMM YYYY")).toBe("Nov 2026");
    expect(formatMonthByPreference("2026-11", "DD MMMM YYYY")).toBe("November 2026");
    expect(formatMonthByPreference(sample, "YYYY-MM-DD")).toBe("2026-11");
  });

  it("returns an em dash for invalid input", () => {
    expect(formatMonthByPreference("nope", "DD/MM/YYYY")).toBe("—");
  });
});

describe("formatDateTimeByPreference", () => {
  it("prefixes the preset date and keeps a short time", () => {
    const out = formatDateTimeByPreference(sample, "DD MMM YYYY");
    expect(out.startsWith("07 Nov 2026 · ")).toBe(true);
    expect(out).toMatch(/\d{1,2}:\d{2}/);
  });
});
