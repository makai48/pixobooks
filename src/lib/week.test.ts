import { describe, expect, it } from "vitest";
import {
  RANGE_PRESET_OPTIONS,
  resolveRange,
  startOfWeekOn,
  weekStartsOn,
} from "./week";

// Reference calendar: Sunday 8 Nov 2026. Wednesday = 4 Nov 2026.
const NOW = new Date(2026, 10, 4, 15, 30, 0, 0); // Wed 4 Nov 2026, 15:30 local
const MONDAY = new Date(2026, 10, 2, 0, 0, 0, 0); // Mon 2 Nov
const SUNDAY = new Date(2026, 10, 1, 0, 0, 0, 0); // Sun 1 Nov
const PREV_MONDAY = new Date(2026, 9, 26, 0, 0, 0, 0); // Mon 26 Oct
const PREV_SUNDAY = new Date(2026, 9, 25, 0, 0, 0, 0); // Sun 25 Oct
const PREV_WEEK_END = new Date(MONDAY.getTime() - 1); // Sun 1 Nov 23:59:59.999

describe("week start", () => {
  it("defaults to Monday", () => {
    expect(weekStartsOn()).toBe(1);
    expect(weekStartsOn("monday")).toBe(1);
  });

  it("maps every weekday name", () => {
    expect(weekStartsOn("sunday")).toBe(0);
    expect(weekStartsOn("saturday")).toBe(6);
  });

  it("picks the Monday that starts the containing week", () => {
    expect(startOfWeekOn(NOW, 1).getDay()).toBe(1);
    expect(startOfWeekOn(NOW, 1).getDate()).toBe(2);
  });

  it("picks the Sunday that starts the containing week", () => {
    expect(startOfWeekOn(NOW, 0).getDay()).toBe(0);
    expect(startOfWeekOn(NOW, 0).getDate()).toBe(1);
  });
});

describe("resolveRange", () => {
  it("Today is the current calendar day only", () => {
    const { from, to } = resolveRange("today", "monday", NOW);
    expect(from.getDate()).toBe(4);
    expect(from.getHours()).toBe(0);
    expect(to.getDate()).toBe(4);
    expect(to.getHours()).toBe(23);
  });

  it("This Week runs from Monday to today (Monday start)", () => {
    const { from, to } = resolveRange("thisWeek", "monday", NOW);
    expect(from.getTime()).toBe(MONDAY.getTime());
    expect(to.getDate()).toBe(4);
    expect(to.getHours()).toBe(23);
  });

  it("This Week runs from Sunday to today (Sunday start)", () => {
    const { from } = resolveRange("thisWeek", "sunday", NOW);
    expect(from.getTime()).toBe(SUNDAY.getTime());
  });

  it("Last Week is the full previous Monday–Sunday window", () => {
    const { from, to } = resolveRange("lastWeek", "monday", NOW);
    expect(from.getTime()).toBe(PREV_MONDAY.getTime());
    expect(to.getTime()).toBe(PREV_WEEK_END.getTime());
    expect(to.getDate()).toBe(1); // Sunday 1 Nov
  });

  it("Last Week is the previous Sunday–Saturday window for Sunday start", () => {
    const { from, to } = resolveRange("lastWeek", "sunday", NOW);
    expect(from.getTime()).toBe(PREV_SUNDAY.getTime());
    expect(to.getDate()).toBe(31); // Saturday 31 Oct
  });

  it("never overlaps This Week with Last Week", () => {
    const thisWeek = resolveRange("thisWeek", "monday", NOW);
    const lastWeek = resolveRange("lastWeek", "monday", NOW);
    expect(lastWeek.to.getTime()).toBeLessThan(thisWeek.from.getTime());
  });

  it("This Week includes today and excludes the future", () => {
    const { to } = resolveRange("thisWeek", "monday", NOW);
    expect(to.getDate()).toBe(4);
  });

  it("This Month runs from the 1st to today", () => {
    const { from, to } = resolveRange("thisMonth", "monday", NOW);
    expect(from.getDate()).toBe(1);
    expect(from.getMonth()).toBe(10);
    expect(to.getDate()).toBe(4);
  });

  it("This Year runs from 1 January to today", () => {
    const { from, to } = resolveRange("thisYear", "monday", NOW);
    expect(from.getMonth()).toBe(0);
    expect(from.getDate()).toBe(1);
    expect(to.getDate()).toBe(4);
  });
});

describe("preset chips", () => {
  it("lists the required order on every report", () => {
    expect(RANGE_PRESET_OPTIONS.map((p) => p.label)).toEqual([
      "Today",
      "This Week",
      "Last Week",
      "This Month",
      "This Year",
    ]);
  });
});
