import { NO_DECIMAL_CURRENCIES } from "@/types";
import type { GroupingSystem } from "@/lib/referenceData";

/**
 * The shop's active number format.
 *
 * `AppLayout` keeps this in sync with the saved `shop_settings` row, exactly
 * like `setActiveDateFormat`, so every screen — POS, reports, statements,
 * inventory, expenses — prints money the way the shop configured it instead
 * of the browser's locale.
 */
export type ActiveNumberFormat = {
  /** Character between groups of three (or two, in Indian grouping). */
  thousand: string;
  /** Character between the whole and the fractional part. */
  decimal: string;
  /** Digits after the decimal separator. */
  places: number;
  grouping: GroupingSystem;
  /** Base operating currency of the workspace. */
  currency: string;
};

export const DEFAULT_NUMBER_FORMAT: ActiveNumberFormat = {
  thousand: ",",
  decimal: ".",
  places: 2,
  grouping: "western",
  currency: "USD",
};

const activeNumberFormat: ActiveNumberFormat = { ...DEFAULT_NUMBER_FORMAT };

/**
 * Apply the saved number format app-wide.
 *
 * A missing value keeps the current setting rather than resetting to the
 * default, so a workspace that has not saved its preferences yet still shows
 * a sensible format. The object is mutated in place so a reference stays
 * stable for the consumers that memo on it.
 */
export function setActiveNumberFormat(
  format: Partial<ActiveNumberFormat> | null | undefined,
): void {
  if (!format) return;
  activeNumberFormat.thousand =
    format.thousand || activeNumberFormat.thousand;
  activeNumberFormat.decimal =
    format.decimal || activeNumberFormat.decimal;
  activeNumberFormat.grouping =
    format.grouping === "indian" ? "indian" : "western";
  activeNumberFormat.places = Number.isFinite(Number(format.places))
    ? Math.min(4, Math.max(0, Number(format.places)))
    : activeNumberFormat.places;
  activeNumberFormat.currency =
    format.currency || activeNumberFormat.currency;
}

export function getActiveNumberFormat(): ActiveNumberFormat {
  return activeNumberFormat;
}

/** Group an integer string with the shop's separator and grouping system. */
export function groupDigits(
  integerPart: string,
  thousand: string,
  grouping: GroupingSystem,
): string {
  if (grouping === "indian") {
    const last3 = integerPart.slice(-3);
    const rest = integerPart.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, thousand);
    return (rest ? rest + thousand : "") + last3;
  }
  return integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, thousand);
}

/**
 * The digits of an amount in the shop's format, without a currency symbol.
 *
 * `places` follows the shop's decimal precision unless the currency has no
 * minor unit at all (UGX, JPY, …), which always prints whole units.
 */
export function formatPlainNumber(
  value: number,
  format: ActiveNumberFormat = activeNumberFormat,
  currency?: string,
): string {
  const safe = Number.isFinite(value) ? value : 0;
  const code = currency ?? format.currency;
  const places = NO_DECIMAL_CURRENCIES.includes(code)
    ? 0
    : Math.min(4, Math.max(0, format.places));
  const fixed = Math.abs(safe).toFixed(places);
  const [integerPart, fractionPart] = fixed.split(".");
  const grouped = groupDigits(integerPart, format.thousand, format.grouping);
  return `${safe < 0 ? "-" : ""}${grouped}${
    places > 0 ? format.decimal + (fractionPart || "") : ""
  }`;
}

/**
 * A money amount in the shop's format.
 *
 * The currency symbol and its position still come from `Intl` — that is the
 * locale's job — but the digits themselves are the shop's, so "1.234,56"
 * stays "1.234,56" everywhere in the workspace.
 */
export function formatMoneyWithFormat(
  value: number,
  currency: string,
  locale = "en-US",
  format: ActiveNumberFormat = activeNumberFormat,
): string {
  const safe = Number.isFinite(value) ? value : 0;
  const decimals = NO_DECIMAL_CURRENCIES.includes(currency)
    ? 0
    : Math.min(4, Math.max(0, format.places));
  const digits = formatPlainNumber(Math.abs(safe), format, currency);

  try {
    const parts = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).formatToParts(Math.abs(safe));

    let out = "";
    let placed = false;
    for (const part of parts) {
      if (
        part.type === "integer" ||
        part.type === "group" ||
        part.type === "decimal" ||
        part.type === "fraction"
      ) {
        if (!placed) {
          out += digits;
          placed = true;
        }
        continue;
      }
      out += part.value;
    }
    if (!placed) out += digits;
    return `${safe < 0 ? "-" : ""}${out}`;
  } catch {
    return `${currency} ${digits}`;
  }
}

/* -------------------------------------------------------------------------- */
/* Typing helpers                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The text an amount field shows when it is NOT being edited.
 *
 * The full amount in the shop's format, with the shop's precision.
 */
export function formatForDisplay(
  value: number | null | undefined,
  format: ActiveNumberFormat = activeNumberFormat,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  const places = NO_DECIMAL_CURRENCIES.includes(format.currency)
    ? 0
    : Math.min(4, Math.max(0, format.places));
  const negative = value < 0;
  const fixed = Math.abs(value).toFixed(places);
  const [integerPart, fractionPart] = fixed.split(".");
  const grouped = groupDigits(
    integerPart,
    format.thousand,
    format.grouping,
  );
  return `${negative ? "-" : ""}${grouped}${
    fractionPart ? format.decimal + fractionPart : ""
  }`;
}

/**
 * Where the decimal separator sits in a typed string.
 *
 * The shop's own mark wins. A phone keypad only offers ".", so a dot is
 * accepted as the decimal when it cannot be a separator — either because the
 * shop does not use a dot for grouping, or because the trailing group is not
 * a full group of three ("1.234" is a thousand, "1.25" is a decimal).
 */
function decimalIndexOf(text: string, format: ActiveNumberFormat): number {
  const shopIndex = text.indexOf(format.decimal);
  if (shopIndex >= 0) return shopIndex;

  const dot = text.indexOf(".");
  if (dot < 0) return -1;

  if (format.thousand !== ".") return dot;

  // The shop groups with a dot: a single dot followed by a FULL group is a
  // separator ("1.234"), a partial group is a decimal the user meant
  // ("1.25"). The group size follows the shop's grouping system.
  const dots = text.split(".").length - 1;
  if (dots !== 1) return -1;
  const trailing = text.length - dot - 1;
  const groupSize = format.grouping === "indian" ? 2 : 3;
  return trailing === groupSize ? -1 : dot;
}

/**
 * Format raw keystrokes with the shop's separators, live.
 *
 * The digits the user typed are preserved exactly; only the grouping and the
 * decimal mark are applied, so "50000" becomes "50,000" while they type and
 * "50000." stays "50,000." with the mark still there.
 */
export function formatForTyping(
  text: string,
  format: ActiveNumberFormat = activeNumberFormat,
): string {
  const raw = text ?? "";
  const negative = raw.trim().startsWith("-");
  const cleaned = raw.replace(/-/g, "");
  const dotIndex = decimalIndexOf(cleaned, format);
  const integerRaw = dotIndex >= 0 ? cleaned.slice(0, dotIndex) : cleaned;
  const fractionRaw = dotIndex >= 0 ? cleaned.slice(dotIndex + 1) : "";

  const integerDigits = integerRaw.replace(/\D/g, "");
  const fractionDigits = fractionRaw.replace(/\D/g, "");
  const grouped = groupDigits(integerDigits, format.thousand, format.grouping);

  // The decimal mark the user typed stays even with no digits after it, so
  // "50000." can still become "50000.50".
  const mark = dotIndex >= 0 ? format.decimal : "";

  return `${negative ? "-" : ""}${grouped}${mark}${fractionDigits}`;
}

/**
 * Read a typed amount back as a number.
 *
 * The shop's thousand separator and decimal mark are removed first, so
 * "1.234,56" and "1,234.56" both read as 1234.56.
 */
export function parseTypedNumber(
  text: string,
  format: ActiveNumberFormat = activeNumberFormat,
): number {
  const raw = (text ?? "").trim();
  if (!raw) return 0;
  const negative = raw.startsWith("-");
  const cleaned = raw.replace(/-/g, "");
  const dotIndex = decimalIndexOf(cleaned, format);

  let integerPart = dotIndex >= 0 ? cleaned.slice(0, dotIndex) : cleaned;
  let fractionPart = dotIndex >= 0 ? cleaned.slice(dotIndex + 1) : "";
  integerPart = integerPart.replace(/\D/g, "");
  fractionPart = fractionPart.replace(/\D/g, "");

  if (!integerPart && !fractionPart) return 0;
  const value = Number(
    fractionPart ? `${integerPart || "0"}.${fractionPart}` : integerPart || "0",
  );
  if (!Number.isFinite(value)) return 0;
  return negative ? -value : value;
}

/** The number of digits in a string, used to keep the caret in place. */
export function countDigits(text: string): number {
  return (text.match(/\d/g) || []).length;
}

/**
 * The caret offset that sits after the same number of digits.
 *
 * When a separator is inserted the text grows, so the caret has to move with
 * it — otherwise typing in the middle of a number jumps to the end.
 */
export function caretAfterDigits(text: string, digits: number): number {
  if (digits <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (/\d/.test(text[i])) {
      seen += 1;
      if (seen === digits) return i + 1;
    }
  }
  return text.length;
}
