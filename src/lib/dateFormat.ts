import type { DateFormat } from "@/types";

/**
 * The app-wide fallback until the shop's saved preference arrives. Mirrors the
 * database default so the first paint never shows a different shape than the
 * stored setting.
 */
export const DEFAULT_DATE_FORMAT: DateFormat = "DD/MM/YYYY";

/**
 * Active preset. `AppLayout` keeps this in sync with `shop_settings.date_format`
 * on every render, so plain helpers (`formatDate`, `formatDateTime`, print and
 * PDF code) obey the same preset as the settings screen without prop-drilling.
 */
let activeDateFormat: DateFormat = DEFAULT_DATE_FORMAT;

export function setActiveDateFormat(format: DateFormat | null | undefined): void {
  activeDateFormat = format ?? DEFAULT_DATE_FORMAT;
}

export function getActiveDateFormat(): DateFormat {
  return activeDateFormat;
}

/**
 * Render a date using the shop's saved display preference.
 * Kept in one place so Reports, Expenses and document views cannot drift.
 *
 * `compact` is the mobile/compact variant of `D MMM YYYY`: `7 Nov` instead of
 * `7 Nov 2026`. Every other preset is identical at both sizes.
 */
export function formatDateByPreference(
  value: string | number | Date,
  dateFormat: DateFormat,
  compact = false
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  const monthName = date.toLocaleDateString(undefined, { month: "short" });
  const longMonthName = date.toLocaleDateString(undefined, { month: "long" });
  return composeDateByPreference(
    day,
    month,
    year,
    monthName,
    dateFormat,
    compact,
    longMonthName
  );
}

/**
 * Assemble a date from already-resolved parts. Printing code needs this because
 * it renders in the shop's time zone, where `new Date(iso)` would land on a
 * different day. `monthNumber` is 1-based and zero-padded.
 */
export function composeDateByPreference(
  day: string,
  monthNumber: string,
  year: string,
  monthName: string,
  dateFormat: DateFormat,
  compact = false,
  longMonthName?: string
): string {
  if (dateFormat === "D MMM YYYY") {
    return `${compact ? Number(day) : day} ${monthName}${compact ? "" : ` ${year}`}`;
  }
  if (dateFormat === "DD MMMM YYYY") {
    return `${day} ${longMonthName ?? monthName} ${year}`;
  }
  if (dateFormat === "DD MMM YYYY") {
    return `${day} ${monthName} ${year}`;
  }
  if (dateFormat === "MM/DD/YYYY") return `${monthNumber}/${day}/${year}`;
  if (dateFormat === "YYYY-MM-DD") return `${year}-${monthNumber}-${day}`;
  return `${day}/${monthNumber}/${year}`;
}

/**
 * Month + year (for billing periods, salary months and report ranges) in the
 * saved preset. Input may be a `YYYY-MM` key or any date value.
 *
 * The preset decides the shape, not just the separator: name formats read
 * `Nov 2026` / `November 2026`, numeric formats read `11/2026`, and the ISO
 * preset reads `2026-11`. That keeps a month label from being the one date
 * surface that ignores the shop setting.
 */
export function formatMonthByPreference(
  value: string | number | Date,
  dateFormat: DateFormat = getActiveDateFormat()
): string {
  let date: Date;
  if (typeof value === "string" && /^\d{4}-\d{2}$/.test(value)) {
    const [y, m] = value.split("-").map(Number);
    date = new Date(y, m - 1, 1);
  } else {
    date = new Date(value);
  }
  if (Number.isNaN(date.getTime())) return "—";
  const monthNumber = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  const monthName = date.toLocaleDateString(undefined, { month: "short" });
  const longMonthName = date.toLocaleDateString(undefined, { month: "long" });
  if (dateFormat === "YYYY-MM-DD") return `${year}-${monthNumber}`;
  if (dateFormat === "MM/DD/YYYY" || dateFormat === "DD/MM/YYYY") {
    return `${monthNumber}/${year}`;
  }
  if (dateFormat === "DD MMMM YYYY") return `${longMonthName} ${year}`;
  return `${monthName} ${year}`;
}

/** Date + time in the saved preset, e.g. `07/11/2026 · 14:30`. */
export function formatDateTimeByPreference(
  value: string | number | Date,
  dateFormat: DateFormat,
  timeZone?: string
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const time = date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  });
  return `${formatDateByPreference(date, dateFormat)} · ${time}`;
}
