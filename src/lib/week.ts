import type { WeekStart } from "@/types";

/**
 * Week-start helpers.
 *
 * The admin chooses which weekday opens the business week (default Monday).
 * "This Week" and "Last Week" in Sales Report and Statistics both resolve
 * through this module so the two screens can never disagree.
 */

export const WEEK_START_INDEX: Record<WeekStart, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export const WEEK_START_OPTIONS: { value: WeekStart; label: string }[] = [
  { value: "sunday", label: "Sunday" },
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
];

export const DEFAULT_WEEK_START: WeekStart = "monday";

export type RangePreset =
  | "today"
  | "thisWeek"
  | "lastWeek"
  | "thisMonth"
  | "thisYear";

/** Chips are rendered in this exact order on both reports. */
export const RANGE_PRESET_OPTIONS: { id: RangePreset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "thisWeek", label: "This Week" },
  { id: "lastWeek", label: "Last Week" },
  { id: "thisMonth", label: "This Month" },
  { id: "thisYear", label: "This Year" },
];

export function weekStartsOn(weekStart?: WeekStart | null): number {
  return WEEK_START_INDEX[weekStart ?? DEFAULT_WEEK_START] ?? 1;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

/** Midnight on the first day of the week containing `date`. */
export function startOfWeekOn(date: Date, weekStartsOnDay: number): Date {
  const d = startOfDay(date);
  const diff = (d.getDay() - weekStartsOnDay + 7) % 7;
  return addDays(d, -diff);
}

/**
 * Resolve a preset to an inclusive Date window.
 *
 * - Today        today 00:00 → today 23:59:59.999
 * - This Week    configured week start → today end
 * - Last Week    previous week start → the millisecond before this week
 * - This Month   1st of this month → today end
 * - This Year    1 Jan → today end
 */
export function resolveRange(
  preset: RangePreset,
  weekStart?: WeekStart | null,
  now: Date = new Date()
): { from: Date; to: Date } {
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const weekStartDay = weekStartsOn(weekStart);
  const thisWeekStart = startOfWeekOn(now, weekStartDay);

  switch (preset) {
    case "today":
      return { from: todayStart, to: todayEnd };
    case "thisWeek":
      return { from: thisWeekStart, to: todayEnd };
    case "lastWeek": {
      const from = addDays(thisWeekStart, -7);
      const to = new Date(thisWeekStart.getTime() - 1);
      return { from, to };
    }
    case "thisMonth":
      return {
        from: new Date(now.getFullYear(), now.getMonth(), 1),
        to: todayEnd,
      };
    case "thisYear":
      return { from: new Date(now.getFullYear(), 0, 1), to: todayEnd };
  }
}
