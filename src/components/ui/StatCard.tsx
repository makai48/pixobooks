import { useState } from "react";
import { cn } from "@/lib/utils";
import MoneyText from "./MoneyText";

/** Subtle skin-bound tints for high-signal metric cards. */
export type StatFill =
  | "brand"
  | "ink"
  | "success"
  | "danger"
  | "warning"
  | "cyan";

// Literal class names so Tailwind keeps every surface rule in the build.
const FILL_CLASS: Record<StatFill, string> = {
  brand: "surface-brand",
  ink: "surface-ink",
  success: "surface-success",
  danger: "surface-danger",
  warning: "surface-warning",
  cyan: "surface-cyan",
};

/**
 * `paper` keeps the quiet ledger card (optionally with a flat semantic tint).
 * `solid` is the filled gradient card used on the Sales screen: large radius,
 * deep paper shadow, colour drawn from the active skin.
 */
export type StatVariant = "paper" | "solid";

export default function StatCard({
  label,
  value,
  fullValue,
  tone,
  fill,
  variant = "paper",
}: {
  label: string;
  value: string;
  fullValue?: string;
  tone?: "success" | "danger" | "cyan" | "magenta" | "warning";
  fill?: StatFill;
  variant?: StatVariant;
}) {
  const [expanded, setExpanded] = useState(false);
  const showFull = expanded && !!fullValue;
  const solid = variant === "solid" && !!fill;

  return (
    <div
      className={cn(
        "paper-card min-w-0 cursor-pointer select-none",
        solid
          ? "stat-card--solid p-3 md:p-7 min-h-[72px] md:min-h-[150px]"
          : "p-2 md:p-4",
        fill && FILL_CLASS[fill]
      )}
      onDoubleClick={() => setExpanded((e) => !e)}
    >
      <div className="stat-card__body min-w-0">
        <div
          className={cn(
            "stat-card__label truncate",
            solid
              ? "text-[11px] md:text-[clamp(18px,1.8vw,23px)] font-medium leading-none tracking-[-0.015em]"
              : "text-[7px] md:text-[11px] uppercase tracking-wide md:tracking-widest leading-none",
            !solid && (fill ? "stat-label" : "text-ink-mute")
          )}
        >
          {label}
        </div>
        <div
          title={fullValue ?? value}
          className={cn(
            "break-words",
            solid
              ? "mt-1 md:mt-2 text-[13px] md:text-[clamp(20px,2.1vw,28px)] font-bold leading-none tabular-nums"
              : "font-display font-bold num mt-0.5 md:mt-1 leading-tight",
            !solid &&
              (showFull
                ? "text-[7px] md:text-[clamp(0.65rem,3vw,0.95rem)]"
                : "text-[12px] md:text-[clamp(1rem,5.5vw,1.5rem)]"),
            !fill && tone === "success" && "text-success",
            !fill && tone === "danger" && "text-danger",
            !fill && tone === "cyan" && "text-cyan-reg",
            !fill && tone === "magenta" && "text-magenta-reg",
            !fill && tone === "warning" && "text-warning"
          )}
        >
          <MoneyText
            value={showFull && fullValue ? fullValue : value}
            muted={!fill}
            symbolClassName={solid ? "text-[0.62em] font-medium" : undefined}
          />
        </div>
      </div>
    </div>
  );
}
