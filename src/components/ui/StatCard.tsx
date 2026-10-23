import { useState } from "react";
import { cn } from "@/lib/utils";

export default function StatCard({
  label,
  value,
  fullValue,
  tone,
}: {
  label: string;
  value: string;
  fullValue?: string;
  tone?: "success" | "danger" | "cyan" | "magenta" | "warning";
}) {
  const [expanded, setExpanded] = useState(false);
  const showFull = expanded && !!fullValue;

  return (
    <div
      className="paper-card p-2 md:p-4 min-w-0 cursor-pointer select-none"
      onDoubleClick={() => setExpanded((e) => !e)}
    >
      <div className="text-[7px] md:text-[11px] uppercase tracking-wide md:tracking-widest leading-none text-ink-mute truncate">
        {label}
      </div>
      <div
        title={fullValue ?? value}
        className={cn(
          "font-display font-bold num mt-0.5 md:mt-1 leading-tight break-words",
          showFull
            ? "text-[7px] md:text-[clamp(0.65rem,3vw,0.95rem)]"
            : "text-[12px] md:text-[clamp(1rem,5.5vw,1.5rem)]",
          tone === "success" && "text-success",
          tone === "danger" && "text-danger",
          tone === "cyan" && "text-cyan-reg",
          tone === "magenta" && "text-magenta-reg",
          tone === "warning" && "text-warning"
        )}
      >
        {showFull ? fullValue : value}
      </div>
    </div>
  );
}
