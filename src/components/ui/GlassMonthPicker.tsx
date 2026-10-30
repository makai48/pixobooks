import { useEffect, useState } from "react";
import GlassSelect from "./GlassSelect";
import { cn } from "@/lib/utils";

/** Short month labels in the user's locale, built once. */
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i),
  label: new Date(2000, i, 1).toLocaleDateString(undefined, { month: "short" }),
}));

/** Guard rails for the year field, wide enough for any bookkeeping period. */
const MIN_YEAR = 1900;
const MAX_YEAR = 2200;

function splitMonth(value: string): { year: number; month: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]) - 1;
    if (month >= 0 && month <= 11 && year >= MIN_YEAR && year <= MAX_YEAR) {
      return { year, month };
    }
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

function joinMonth(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

/**
 * Frosted month picker for `YYYY-MM` values (billing periods, salary months).
 *
 * A native `<input type="month">` is a bare OS widget and on some browsers
 * degrades to a free-text field. This control exposes the month as a dropdown
 * and the year as an editable field, so any month in any year is one edit away.
 */
export default function GlassMonthPicker({
  value,
  onChange,
  ariaLabel,
  id,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  id?: string;
  className?: string;
}) {
  const parsed = splitMonth(value);
  const [yearText, setYearText] = useState(() => String(parsed.year));

  // Month/year can change from the outside (e.g. the server picks a period).
  useEffect(() => {
    setYearText(String(parsed.year));
  }, [parsed.year]);

  const setMonth = (month: number) => onChange(joinMonth(parsed.year, month));

  const commitYear = (raw: string) => {
    const n = Math.trunc(Number(raw));
    if (Number.isFinite(n) && n >= MIN_YEAR && n <= MAX_YEAR) {
      if (n !== parsed.year) onChange(joinMonth(n, parsed.month));
    } else {
      setYearText(String(parsed.year));
    }
  };

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <GlassSelect
        id={id}
        value={String(parsed.month)}
        onChange={(v) => setMonth(Number(v))}
        options={MONTH_OPTIONS}
        ariaLabel={`${ariaLabel} month`}
        className="input"
      />
      <input
        aria-label={`${ariaLabel} year`}
        type="number"
        inputMode="numeric"
        min={MIN_YEAR}
        max={MAX_YEAR}
        step={1}
        value={yearText}
        onChange={(e) => setYearText(e.target.value)}
        onBlur={() => commitYear(yearText)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitYear(yearText);
          }
        }}
        className="input num w-20 text-center font-semibold"
      />
    </div>
  );
}
