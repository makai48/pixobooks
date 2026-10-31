import { Link } from "react-router-dom";
import { useShopSettings } from "@/hooks/useShopSettings";
import { useItems } from "@/hooks/useItems";
import { useSales } from "@/hooks/useSales";
import { useEmployees } from "@/hooks/useEmployees";
import {
  buildOnboardingSteps,
  dismissOnboarding,
  isOnboardingDismissed,
  onboardingProgress,
} from "@/lib/onboarding";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

export default function OnboardingChecklist() {
  const { data: settings } = useShopSettings();
  const { data: items = [] } = useItems();
  const { data: sales = [] } = useSales(5);
  const { data: employees = [] } = useEmployees();
  const [dismissed, setDismissed] = useState(isOnboardingDismissed);
  // Mobile: the checklist is an info block that can eat a quarter of the
  // screen, so it collapses to one summary line by default (Stock Ledger
  // §7). Desktop keeps the full card expanded.
  const [openMobile, setOpenMobile] = useState(false);

  const steps = buildOnboardingSteps({
    settings,
    itemCount: items.length,
    saleCount: sales.length,
    userCount: employees.length + 1,
  });
  const pct = onboardingProgress(steps);
  if (dismissed || pct >= 100) return null;

  const done = steps.filter((s) => s.done).length;

  return (
    <div className="paper-card p-2 md:p-4 mb-2 md:mb-4">
      <button
        type="button"
        onClick={() => setOpenMobile((o) => !o)}
        aria-expanded={openMobile}
        className="md:hidden w-full flex items-center gap-2 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="font-display font-bold text-[11px] leading-tight truncate">
            Get set up · {pct}%
          </div>
          <div className="text-[9px] text-ink-mute leading-tight">
            {done} of {steps.length} steps done
          </div>
        </div>
        <ChevronDown
          className={cn("w-3.5 h-3.5 shrink-0 text-ink-mute transition", openMobile && "rotate-180")}
        />
      </button>
      <div className="hidden md:flex items-center justify-between mb-2">
        <div className="font-display font-bold">Get set up in ~5 minutes ({pct}%)</div>
        <button
          className="btn btn-ghost h-8 text-xs"
          onClick={() => {
            dismissOnboarding();
            setDismissed(true);
          }}
        >
          Dismiss
        </button>
      </div>
      <div className={cn("mt-1.5 md:mt-0", !openMobile && "max-md:hidden")}>
        <div className="h-1 md:h-1.5 rounded bg-ink/5 overflow-hidden mb-1.5 md:mb-3">
          <div className="h-full bg-magenta-reg" style={{ width: `${pct}%` }} />
        </div>
        <div className="space-y-1 md:space-y-1.5">
          {steps.map((s) => (
            <Link
              key={s.id}
              to={s.to}
              className={cn("flex items-center gap-2 text-[11px] md:text-sm hover:underline", s.done && "line-through opacity-60")}
            >
              <span className={cn("w-4 h-4 rounded-full border flex items-center justify-center text-[10px]", s.done && "bg-success text-white border-success")}>
                {s.done ? "✓" : ""}
              </span>
              {s.label}
            </Link>
          ))}
        </div>
        <button
          className="md:hidden btn btn-ghost btn-sm w-full mt-1.5"
          onClick={() => {
            dismissOnboarding();
            setDismissed(true);
          }}
        >
          Dismiss checklist
        </button>
      </div>
    </div>
  );
}
