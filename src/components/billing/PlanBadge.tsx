import { PLAN_NAMES } from "@/lib/billing";
import { useSubscription } from "@/hooks/useSubscription";
import { cn } from "@/lib/utils";

export default function PlanBadge({ className }: { className?: string }) {
  const { billing, trialDaysLeft, isActive } = useSubscription();
  const label = `${PLAN_NAMES[billing.plan]} · ${billing.status}`;
  const trial = billing.status === "trialing" && trialDaysLeft !== null
    ? ` · ${trialDaysLeft}d left`
    : "";
  return (
    <span
      title={isActive ? "Subscription active" : "Subscription needs attention — open Settings → Billing"}
      className={cn(
        "chip text-[10px] uppercase",
        isActive ? "text-success" : "text-danger",
        className
      )}
    >
      {label}{trial}
    </span>
  );
}
