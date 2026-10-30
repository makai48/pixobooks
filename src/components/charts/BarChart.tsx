import { cn } from "@/lib/utils";

export type BarDatum = { label: string; value: number; color?: string };

type Props = {
  data: BarDatum[];
  formatValue?: (value: number) => string;
  color?: string;
  emptyLabel?: string;
  className?: string;
  maxRows?: number;
};

/**
 * Lightweight horizontal bar chart (CSS bars). Used where category names
 * are long — items, staff, clients — so every label stays readable without
 * rotating text or needing a charting library.
 */
export default function BarChart({
  data,
  formatValue,
  color = "var(--magenta-reg)",
  emptyLabel = "No data for this period.",
  className,
  maxRows,
}: Props) {
  const rows = (maxRows ? data.slice(0, maxRows) : data).filter((d) => d.value > 0);
  if (rows.length === 0) {
    return <div className="text-[10px] text-ink-mute py-3">{emptyLabel}</div>;
  }
  const max = Math.max(...rows.map((d) => Math.abs(d.value)), 1);
  return (
    <div className={cn("space-y-1.5", className)}>
      {rows.map((d) => (
        <div key={d.label} className="min-w-0">
          <div className="flex items-baseline justify-between gap-2 text-[9px] md:text-[10px] leading-tight">
            <span className="truncate">{d.label}</span>
            <span className="num text-ink-mute shrink-0">
              {formatValue ? formatValue(d.value) : d.value}
            </span>
          </div>
          <div className="h-1.5 rounded bg-ink/5 overflow-hidden mt-0.5">
            <div
              className="h-full rounded"
              style={{
                width: `${(Math.abs(d.value) / max) * 100}%`,
                background: d.color || color,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
