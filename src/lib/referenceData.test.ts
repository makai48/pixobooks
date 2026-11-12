import { describe, expect, it } from "vitest";
import { timezoneLabel } from "./referenceData";

describe("timezone labels", () => {
  it("drops the continent and keeps the offset short", () => {
    expect(timezoneLabel("Africa/Kampala")).toBe("GMT+3 Kampala");
    // Zones with daylight saving move their offset, so only the shape is
    // pinned here.
    expect(timezoneLabel("Europe/Berlin")).toMatch(
      /^GMT[+-]\d{1,2}(:\d{2})? Berlin$/,
    );
    expect(timezoneLabel("America/New_York")).toMatch(
      /^GMT[+-]\d{1,2}(:\d{2})? New York$/,
    );
  });

  it("keeps the minutes only when the zone needs them", () => {
    expect(timezoneLabel("Asia/Kolkata")).toBe("GMT+5:30 Kolkata");
  });

  it("reads UTC without the continent or the padded minutes", () => {
    expect(timezoneLabel("UTC")).toBe("GMT+0 UTC");
  });

  it("keeps the region for a three-part zone name", () => {
    expect(timezoneLabel("America/Argentina/Buenos_Aires")).toBe(
      "GMT-3 Argentina/Buenos Aires",
    );
  });
});
