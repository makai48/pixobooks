import { localISODate } from "./utils";

/** Inclusive business-day window. An empty bound means "no bound", which is
 *  how the Sales Report opens: every transaction, newest first. */
export type DayRange = { from: string; to: string };

/**
 * True when a transaction belongs to the visible window.
 *
 * The comparison uses the business-local calendar day, never the UTC date
 * slice. A sale rung up at 00:30 local can be the previous UTC day; slicing
 * the timestamp would file it (and any imported row near midnight) on the
 * wrong day.
 */
export function inDayRange(createdAt: string, range: DayRange): boolean {
  const day = localISODate(createdAt);
  if (!day) return false;
  if (range.from && day < range.from) return false;
  if (range.to && day > range.to) return false;
  return true;
}

/** Newest transaction first — imported sales keep their real `created_at`, so
 *  they sort among live sales by when they actually happened. */
export function byTransactionDateDesc<T extends { createdAt: string }>(
  a: T,
  b: T
): number {
  if (a.createdAt === b.createdAt) return 0;
  return a.createdAt < b.createdAt ? 1 : -1;
}
