import { toast } from "sonner";
import { PLAN_NAMES } from "@/lib/billing";
import type { SubscriptionPlan } from "@/types";

export function upgradeToast(feature: string, plan: SubscriptionPlan = "growth"): void {
  toast.error(`${feature} needs ${PLAN_NAMES[plan]} — open Settings → Billing to upgrade.`, {
    duration: 5000,
  });
}
