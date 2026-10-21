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

export default function OnboardingChecklist() {
  const { data: settings } = useShopSettings();
  const { data: items = [] } = useItems();
  const { data: sales = [] } = useSales(5);
  const { data: employees = [] } = useEmployees();
  const [dismissed, setDismissed] = useState(isOnboardingDismissed);

  const steps = buildOnboardingSteps({
    settings,
    itemCount: items.length,
    saleCount: sales.length,
    userCount: employees.length + 1,
  });
  const pct = onboardingProgress(steps);
  if (dismissed || pct >= 100) return null;

  return (
    <div className="paper-card p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
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
      <div className="h-1.5 rounded bg-ink/5 overflow-hidden mb-3">
        <div className="h-full bg-magenta-reg" style={{ width: `${pct}%` }} />
      </div>
      <div className="space-y-1.5">
        {steps.map((s) => (
          <Link
            key={s.id}
            to={s.to}
            className={cn("flex items-center gap-2 text-sm hover:underline", s.done && "line-through opacity-60")}
          >
            <span className={cn("w-4 h-4 rounded-full border flex items-center justify-center text-[10px]", s.done && "bg-success text-white border-success")}>
              {s.done ? "✓" : ""}
            </span>
            {s.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
