import { chartColor } from "./palette";

export type PieDatum = { label: string; value: number; color?: string };

type Props = {
  data: PieDatum[];
  size?: number;
  formatValue?: (value: number) => string;
  emptyLabel?: string;
};

/**
 * Dependency-free SVG donut chart. Each slice is a stroked circle segment;
 * the legend doubles as the value table.
 */
export default function PieChart({
  data,
  size = 132,
  formatValue,
  emptyLabel = "No data for this period.",
}: Props) {
  const rows = data.filter((d) => d.value > 0);
  const total = rows.reduce((sum, d) => sum + d.value, 0);
  if (total <= 0) {
    return <div className="text-[10px] text-ink-mute py-6">{emptyLabel}</div>;
  }

  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex items-center gap-3 md:gap-4 min-w-0">
      <svg
        viewBox="0 0 120 120"
        width={size}
        height={size}
        className="shrink-0"
        role="img"
        aria-label="Pie chart"
      >
        {rows.map((d, i) => {
          const fraction = d.value / total;
          const dash = fraction * circumference;
          const el = (
            <circle
              key={d.label}
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke={d.color || chartColor(i)}
              strokeWidth="16"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 60 60)"
            >
              <title>{`${d.label}: ${formatValue ? formatValue(d.value) : d.value}`}</title>
            </circle>
          );
          offset += dash;
          return el;
        })}
      </svg>
      <div className="min-w-0 flex-1 space-y-1">
        {rows.map((d, i) => (
          <div
            key={d.label}
            className="flex items-center gap-1.5 text-[9px] md:text-[10px] leading-tight"
          >
            <span
              className="w-2 h-2 rounded-sm shrink-0"
              style={{ background: d.color || chartColor(i) }}
            />
            <span className="truncate">{d.label}</span>
            <span className="num text-ink-mute ml-auto shrink-0 pl-1">
              {formatValue ? formatValue(d.value) : d.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
