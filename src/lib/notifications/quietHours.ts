import type { NotificationSettings } from "./types";

/** Parse a "HH:MM" string into minutes past midnight. */
export function parseClock(value: string | null | undefined, fallback: number): number {
  if (!value) return fallback;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return fallback;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return fallback;
  return Math.min(23, Math.max(0, hours)) * 60 + Math.min(59, Math.max(0, minutes));
}

/**
 * Is `date` inside the workspace's quiet hours?
 *
 * The window usually crosses midnight (20:00 → 06:00), so it is evaluated as
 * two ranges: the same-day part and the part that spills into the next day.
 */
export function isWithinQuietHours(
  settings: Pick<NotificationSettings, "quietHoursEnabled" | "quietStart" | "quietEnd">,
  date: Date = new Date(),
): boolean {
  if (!settings.quietHoursEnabled) return false;
  const start = parseClock(settings.quietStart, 20 * 60);
  const end = parseClock(settings.quietEnd, 6 * 60);
  if (start === end) return false;
  const minutes = date.getHours() * 60 + date.getMinutes();
  if (start < end) return minutes >= start && minutes < end;
  return minutes >= start || minutes < end;
}

/** `20:00` → `8:00 PM`, using the browser's own locale. */
export function formatClock(value: string | null | undefined): string {
  const fallback = value ?? "";
  const match = /^(\d{1,2}):(\d{2})$/.exec(fallback.trim());
  if (!match) return fallback;
  const hours = Number(match[1]);
  const minutes = match[2];
  const suffix = hours >= 12 ? "PM" : "AM";
  const display = hours % 12 === 0 ? 12 : hours % 12;
  return `${display}:${minutes} ${suffix}`;
}
