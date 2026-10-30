type Point = { label: string; value: number };

type Props = {
  data: Point[];
  height?: number;
  color?: string;
  formatValue?: (value: number) => string;
  emptyLabel?: string;
};

/**
 * Dependency-free SVG line chart with a soft area fill. The viewBox keeps
 * the aspect ratio stable while the wrapper scales to the card width.
 */
export default function LineChart({
  data,
  height = 150,
  color = "var(--magenta-reg)",
  formatValue,
  emptyLabel = "No data for this period.",
}: Props) {
  if (data.length === 0) {
    return <div className="text-[10px] text-ink-mute py-6">{emptyLabel}</div>;
  }

  const width = 600;
  const padX = 6;
  const padY = 10;
  const values = data.map((d) => d.value);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const step = data.length > 1 ? (width - padX * 2) / (data.length - 1) : 0;

  const points = data.map((d, i) => {
    const x = data.length > 1 ? padX + i * step : width / 2;
    const y = padY + (1 - (d.value - min) / span) * (height - padY * 2);
    return { x, y, ...d };
  });

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const area = `${line} L${points[points.length - 1].x},${height - padY} L${points[0].x},${height - padY} Z`;
  const mid = data[Math.floor((data.length - 1) / 2)];

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto"
        role="img"
        aria-label="Line chart"
      >
        <path d={area} fill={color} opacity={0.12} />
        <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2.2} fill={color}>
            <title>{`${p.label}: ${formatValue ? formatValue(p.value) : p.value}`}</title>
          </circle>
        ))}
      </svg>
      <div className="flex justify-between text-[8px] text-ink-mute mt-0.5 px-0.5">
        <span>{data[0].label}</span>
        {mid && data.length > 2 && <span>{mid.label}</span>}
        <span>{data[data.length - 1].label}</span>
      </div>
    </div>
  );
}
