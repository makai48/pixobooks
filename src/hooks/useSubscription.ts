import { useShopSettings } from "@/hooks/useShopSettings";
import {
  getBilling,
  getPlanLimits,
  isSubscriptionActive,
  isTrialing,
  trialDaysLeft,
} from "@/lib/billing";

export function useSubscription() {
  const { data: settings, ...rest } = useShopSettings();
  const billing = getBilling(settings);
  return {
    ...rest,
    settings,
    billing,
    limits: getPlanLimits(settings),
    isTrialing: isTrialing(settings),
    trialDaysLeft: trialDaysLeft(settings),
    isActive: isSubscriptionActive(settings),
  };
}
