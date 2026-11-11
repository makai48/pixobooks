import type { DateFormat } from "@/types";

/**
 * Render a date using the shop's saved display preference.
 * Kept in one place so Reports, Expenses and document views cannot drift.
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

  if (dateFormat === "D MMM YYYY") {
    const monthName = date.toLocaleDateString(undefined, { month: "short" });
    return `${compact ? Number(day) : day} ${monthName}${compact ? "" : ` ${year}`}`;
  }
  if (dateFormat === "DD MMM YYYY" || dateFormat === "DD MMMM YYYY") {
    const monthName = date.toLocaleDateString(undefined, { month: "short" });
    return `${day} ${monthName} ${year}`;
  }
  if (dateFormat === "MM/DD/YYYY") return `${month}/${day}/${year}`;
  if (dateFormat === "YYYY-MM-DD") return `${year}-${month}-${day}`;
  return `${day}/${month}/${year}`;
}
