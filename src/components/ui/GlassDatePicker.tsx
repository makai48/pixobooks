import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { glassFitWidth } from "./glassFit";
import type { DateFormat } from "@/types";

type Pos = {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
};

const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const isoToDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1);
};

const formatLabel = (iso: string, dateFormat: DateFormat, compactMonth = false) => {
  const date = isoToDate(iso);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  if (dateFormat === "D MMM YYYY") {
    return `${compactMonth ? Number(day) : day} ${date.toLocaleDateString(undefined, { month: "short" })}${compactMonth ? "" : ` ${year}`}`;
  }
  if (dateFormat === "DD MMM YYYY" || dateFormat === "DD MMMM YYYY") {
    return `${day} ${date.toLocaleDateString(undefined, { month: "short" })} ${year}`;
  }
  if (dateFormat === "MM/DD/YYYY") return `${month}/${day}/${year}`;
  if (dateFormat === "YYYY-MM-DD") return `${year}-${month}-${day}`;
  return `${day}/${month}/${year}`;
};

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/** Short month names in the user's locale, built once. */
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) =>
  new Date(2000, i, 1).toLocaleDateString(undefined, { month: "short" })
);

/** Guard rails for the year field. Wide enough for any real bookkeeping
 *  period, narrow enough to reject typos like 20026. */
const MIN_YEAR = 1900;
const MAX_YEAR = 2200;

/**
 * Frosted-glass calendar for `YYYY-MM-DD` values. The popover is portaled,
 * clamped to the viewport and flipped above the trigger when needed.
 *
 * The header exposes the month and the year as direct controls (a month
 * dropdown and an editable year field) so jumping from e.g. March 2024 to
 * August 2019 does not mean clicking through five years of months.
 */
export default function GlassDatePicker({
  value,
  onChange,
  ariaLabel,
  id,
  className,
  fullWidth = false,
  placeholder = "Select date",
  allowClear = false,
  dateFormat = "DD MMM YYYY",
}: {
  value: string;
  onChange: (iso: string) => void;
  ariaLabel: string;
  id?: string;
  className?: string;
  /** Fill the parent instead of shrinking to the label width. */
  fullWidth?: boolean;
  /** Shown on the trigger when `value` is empty (optional dates). */
  placeholder?: string;
  /** Offer a Clear button so an optional date can go back to empty. */
  allowClear?: boolean;
  dateFormat?: DateFormat;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const [view, setView] = useState(() => {
    const d = value ? isoToDate(value) : new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  /** Free-typed year. Kept as text so the field can be cleared while typing
   *  and only committed when it is a usable year. */
  const [yearText, setYearText] = useState(() =>
    String((value ? isoToDate(value) : new Date()).getFullYear())
  );
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const label = value ? formatLabel(value, dateFormat) : placeholder;
  const mobileLabel = value ? formatLabel(value, dateFormat, true) : placeholder;
  // The trigger's own padding, gap and calendar glyph must sit outside the
  // measured label, otherwise the icon eats into the date text.
  const fitWidth = useMemo(
    () => glassFitWidth([label, "Today"], 0.15, 36),
    [label]
  );

  // Arrows can cross a year boundary; keep the editable field in step.
  useEffect(() => {
    setYearText(String(view.y));
  }, [view.y]);

  const commitYear = useCallback(
    (raw: string) => {
      const n = Math.trunc(Number(raw));
      if (Number.isFinite(n) && n >= MIN_YEAR && n <= MAX_YEAR) {
        setView((v) => (v.y === n ? v : { ...v, y: n }));
      } else {
        setYearText(String(view.y));
      }
    },
    [view.y]
  );

  const place = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(Math.max(r.width, 252), vw - 16);
    const openUp = r.bottom + 300 + 8 > vh && r.top > vh - r.bottom;
    setPos({
      left: Math.min(Math.max(8, r.left), vw - width - 8),
      width,
      ...(openUp ? { bottom: vh - r.top + 4 } : { top: r.bottom + 4 }),
    });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!btnRef.current?.contains(target) && !popRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    const onScroll = (e: Event) => {
      if (popRef.current && e.target instanceof Node && popRef.current.contains(e.target)) return;
      setOpen(false);
    };
    const onResize = () => setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  const cells = useMemo(() => {
    const offset = new Date(view.y, view.m, 1).getDay();
    const total = new Date(view.y, view.m + 1, 0).getDate();
    return Array.from({ length: offset + total }, (_, i) => (i < offset ? null : i - offset + 1));
  }, [view]);

  const monthLabel = new Date(view.y, view.m, 1).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });

  const today = toISO(new Date());

  const expand = () => {
    const d = value ? isoToDate(value) : new Date();
    setView({ y: d.getFullYear(), m: d.getMonth() });
    setYearText(String(d.getFullYear()));
    setOpen(true);
  };

  const pick = (day: number) => {
    onChange(toISO(new Date(view.y, view.m, day)));
    setOpen(false);
    btnRef.current?.focus();
  };

  const shiftMonth = (delta: number) => {
    setView((v) => {
      const d = new Date(v.y, v.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };

  return (
    <>
      <button
        ref={btnRef}
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : expand())}
        className={cn(
          "input select-glass flex items-center justify-between gap-1 text-left cursor-pointer max-w-full",
          fullWidth && "w-full",
          className
        )}
        style={fitWidth && !fullWidth ? { width: fitWidth } : undefined}
      >
        <span className="whitespace-nowrap">
          <span className="hidden md:inline">{label}</span>
          <span className="md:hidden">{mobileLabel}</span>
        </span>
        <CalendarDays className="w-3.5 h-3.5 shrink-0 opacity-60" />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={popRef}
            role="dialog"
            aria-label={ariaLabel}
            className="glass-pop fixed z-[70] rounded-xl p-2 animate-fade-in"
            style={{
              left: pos.left,
              width: pos.width,
              top: pos.top,
              bottom: pos.bottom,
              maxHeight: "calc(100dvh - 16px)",
              overflowY: "auto",
            }}
          >
            <div className="flex items-center justify-between gap-1 mb-1">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => shiftMonth(-1)}
                className="h-7 w-7 inline-flex items-center justify-center rounded-md text-ink hover:bg-ink/10 transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-1 min-w-0">
                {/* Direct month + year controls: jumping years is one edit,
                    not a dozen arrow clicks. */}
                <select
                  aria-label={`${ariaLabel} month`}
                  value={view.m}
                  onChange={(e) => setView((v) => ({ ...v, m: Number(e.target.value) }))}
                  className="h-7 rounded-md border border-line bg-paper px-1 text-[12px] font-semibold text-ink"
                >
                  {MONTH_OPTIONS.map((name, i) => (
                    <option key={name} value={i}>
                      {name}
                    </option>
                  ))}
                </select>
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
                  className="h-7 w-16 rounded-md border border-line bg-paper px-1 text-[12px] font-semibold text-ink num text-center"
                />
              </div>
              <button
                type="button"
                aria-label="Next month"
                onClick={() => shiftMonth(1)}
                className="h-7 w-7 inline-flex items-center justify-center rounded-md text-ink hover:bg-ink/10 transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center text-[9px] uppercase tracking-wide text-ink-mute mb-0.5">
              {WEEKDAYS.map((w) => (
                <div key={w} className="h-4 leading-4">
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {cells.map((day, i) =>
                day === null ? (
                  <div key={`blank-${i}`} />
                ) : (
                  <button
                    key={day}
                    type="button"
                    onClick={() => pick(day)}
                    aria-label={`${day} ${monthLabel}`}
                    aria-current={toISO(new Date(view.y, view.m, day)) === today ? "date" : undefined}
                    className={cn(
                      "h-8 rounded-md text-[12px] num transition",
                      toISO(new Date(view.y, view.m, day)) === value
                        ? "bg-ink text-paper font-semibold"
                        : "text-ink hover:bg-ink/10",
                      toISO(new Date(view.y, view.m, day)) === today &&
                        toISO(new Date(view.y, view.m, day)) !== value &&
                        "ring-1 ring-inset ring-ink/40"
                    )}
                  >
                    {day}
                  </button>
                )
              )}
            </div>
            <div className="flex items-center justify-between gap-2 mt-1.5 px-0.5">
              <span className="text-[10px] text-ink-mute truncate">
                <span className="hidden md:inline">{label}</span>
                <span className="md:hidden">{mobileLabel}</span>
              </span>
              <div className="flex items-center gap-1 shrink-0">
                {allowClear && value && (
                  <button
                    type="button"
                    onClick={() => {
                      onChange("");
                      setOpen(false);
                      btnRef.current?.focus();
                    }}
                    className="text-[11px] font-semibold h-6 px-2 rounded-md text-ink-mute hover:bg-ink/10 hover:text-ink transition"
                  >
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    onChange(today);
                    setOpen(false);
                    btnRef.current?.focus();
                  }}
                  className="text-[11px] font-semibold h-6 px-2 rounded-md text-ink hover:bg-ink/10 transition"
                >
                  Today
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
