import { NO_DECIMAL_CURRENCIES } from "@/types";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  formatDateByPreference,
  formatDateTimeByPreference,
  getActiveDateFormat,
} from "./dateFormat";

/** Conditional classnames (clsx) with Tailwind conflict resolution (twMerge). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = "USD", locale = "en-US") {
  const decimals = NO_DECIMAL_CURRENCIES.includes(currency) ? 0 : 2;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount || 0);
  } catch {
    return `${currency} ${(amount || 0).toFixed(decimals)}`;
  }
}

/** Compact currency formatting — e.g. $1.2K, $3.4M, $2.1B — used in
 *  stat tiles where horizontal space is limited. Falls back to full
 *  formatting for values under 1,000. */
export function formatCompactCurrency(amount: number, currency = "USD", locale = "en-US") {
  const value = amount || 0;
  const abs = Math.abs(value);
  if (abs < 1000) return formatCurrency(value, currency, locale);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      notation: "compact",
      compactDisplay: "short",
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    // Manual fallback for environments without Intl compact support
    const units = [
      { v: 1e12, s: "T" },
      { v: 1e9, s: "B" },
      { v: 1e6, s: "M" },
      { v: 1e3, s: "K" },
    ];
    for (const u of units) {
      if (abs >= u.v) {
        const sign = value < 0 ? "-" : "";
        return `${currency} ${sign}${(abs / u.v).toFixed(1)}${u.s}`;
      }
    }
    return formatCurrency(value, currency, locale);
  }
}

/** Full currency until it would overflow a stat tile, then compact.
 *  Shared by every Traditional-design stat card. */
export function formatMoney(amount: number, currency = "USD", locale = "en-US") {
  return Math.abs(amount || 0) >= 1_000_000
    ? formatCompactCurrency(amount, currency, locale)
    : formatCurrency(amount, currency, locale);
}

/** Format a numeric amount without any currency prefix — used in the POS
 *  current-ticket table to keep the layout compact and unambiguous. */
export function formatNumber(amount: number, currency = "USD", locale = "en-US") {
  const decimals = NO_DECIMAL_CURRENCIES.includes(currency) ? 0 : 2;
  try {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount || 0);
  } catch {
    return (amount || 0).toFixed(decimals);
  }
}

/** Dates always follow the shop's saved preset (see `src/lib/dateFormat.ts`). */
export function formatDate(d: string | number | Date) {
  return formatDateByPreference(d, getActiveDateFormat());
}

export function formatDateTime(d: string | number | Date) {
  return formatDateTimeByPreference(d, getActiveDateFormat());
}

export function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`;
}

/** Extract a human-readable message from anything thrown.
 *  Supabase PostgREST failures arrive as plain `{ message, details, hint,
 *  code }` objects (not `Error` instances, since the app never calls
 *  `.throwOnError()`), so `err instanceof Error ? err.message : fallback`
 *  swallows the real reason. This preserves message + details + code. */
export function toErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message || fallback;
  if (typeof err === "string") return err || fallback;
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof e.message === "string" && e.message) parts.push(e.message);
    if (typeof e.details === "string" && e.details) parts.push(e.details);
    if (typeof e.hint === "string" && e.hint) parts.push(e.hint);
    if (typeof e.code === "string" && e.code) parts.push(`code ${e.code}`);
    if (parts.length) return parts.join(" · ");
  }
  return fallback;
}

/** Wrap anything thrown into a real `Error` preserving Supabase details. */
export function toError(err: unknown, fallback: string): Error {
  if (err instanceof Error) return err;
  return new Error(toErrorMessage(err, fallback));
}

/**
 * Business-local "today" as an ISO YYYY-MM-DD string.
 *
 * IMPORTANT: uses the device's local timezone — NOT UTC — because the
 * app is installed on the business's own device and every downstream
 * accounting concept (business day, cash sales, banking, cashbook,
 * daily balancing, B/F → C/D chain, reports) MUST agree with the local
 * calendar day. Using `toISOString().slice(0,10)` would return the UTC
 * date, which for shops east of GMT can be one day BEHIND local at any
 * time between midnight local and midnight UTC (e.g. Uganda 01:00 =
 * UTC 22:00 previous day). That inconsistency is the primary source of
 * the "balance from wrong day carried forward" class of bugs.
 */
export function todayISO() {
  return localISODate(new Date());
}

/**
 * Convert an ISO timestamp OR Date object to a business-local
 * YYYY-MM-DD string. Used everywhere sales.created_at (a UTC timestamp)
 * is compared against a business day — so that a sale rung up at
 * 23:59 local (which may be 02:59 UTC next day depending on offset)
 * is correctly attributed to the business day the shop was open, not
 * the following UTC day.
 */
export function localISODate(dateOrIso: string | Date): string {
  const d = typeof dateOrIso === "string" ? new Date(dateOrIso) : dateOrIso;
  if (isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function sum(arr: number[]) {
  return arr.reduce((a, b) => a + b, 0);
}

export function download(name: string, content: string, mime = "text/csv") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Convert #RRGGBB to `H S% L%` (as expected by Tailwind hsl(var(...)) tokens). */
export function hexToHslString(hex: string): string | null {
  const clean = hex.replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function getMonthMatrix(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  const days: Date[] = [];
  const start = new Date(year, month, 1 - startDay);
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return days;
}

export function startOfWeek(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

export function startOfMonth(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d;
}

export function startOfYear(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setMonth(0, 1);
  return d;
}

/** Word-safe line wrapper — breaks `text` into lines of no more than
 *  `maxCharsPerLine` characters WITHOUT truncating any word. Words that
 *  exceed the limit on their own occupy their own line intact. Whitespace
 *  is preserved between words but collapsed. Used by the POS ticket to
 *  wrap long item names onto multiple lines (default: 20 chars). */
export function wrapByWords(text: string, maxCharsPerLine = 20): string[] {
  const clean = String(text || "").trim();
  if (!clean) return [];
  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    if (current.length + 1 + word.length <= maxCharsPerLine) {
      current += " " + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Format an integer with thousands separators (e.g. 99000 → "99,000").
 *  Used for the POS Qty field and similar large-number inputs. */
export function formatIntegerWithCommas(n: number | string): string {
  const raw = typeof n === "number" ? String(Math.max(0, Math.floor(n))) : String(n).replace(/[^\d]/g, "");
  if (!raw) return "";
  return raw.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Group thousands while typing a money amount, keeping at most one decimal
 *  point and two decimal places. "12500.5" -> "12,500.5". */
export function formatAmountInput(raw: string): string {
  const cleaned = String(raw).replace(/[^\d.]/g, "");
  const firstDot = cleaned.indexOf(".");
  const intRaw = (firstDot === -1 ? cleaned : cleaned.slice(0, firstDot)).replace(/^0+(?=\d)/, "");
  const decRaw = firstDot === -1 ? "" : cleaned.slice(firstDot + 1).replace(/\./g, "").slice(0, 2);
  const grouped = intRaw.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (firstDot === -1) return grouped;
  return `${grouped || "0"}.${decRaw}`;
}

/** Human-readable "time ago" — 6min ago, abt 2hrs ago, 3d ago... */
export function timeAgo(d: string | number | Date): string {
  const then = new Date(d).getTime();
  const now = Date.now();
  const seconds = Math.max(0, Math.floor((now - then) / 1000));
  if (seconds < 60) return "Just Now";
  const minutes = Math.floor(seconds / 60);
  if (minutes === 1) return "1min ago";
  if (minutes < 60) return `${minutes}min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return "abt 1hr ago";
  if (hours < 24) return `abt ${hours}hrs ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1d ago";
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks === 1) return "1w ago";
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return "1mo ago";
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? "1y ago" : `${years}y ago`;
}
