import type { BillingInfo, PlanLimits, Settings, SubscriptionPlan } from "@/types";

export const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimits> = {
  starter: { branches: 1, users: 2, items: 200, clientBilling: false, payroll: false, api: false },
  growth: { branches: 3, users: 10, items: 5000, clientBilling: true, payroll: true, api: false },
  pro: { branches: 99, users: 99, items: 50000, clientBilling: true, payroll: true, api: true },
};

export const PLAN_NAMES: Record<SubscriptionPlan, string> = {
  starter: "Starter",
  growth: "Growth",
  pro: "Pro",
};

export function getBilling(settings?: Settings | null): BillingInfo {
  const b = settings?.billing;
  if (b?.plan && b?.status) return b;
  // Default: 14-day trial on starter until DB backfills billing columns.
  return { plan: "starter", status: "trialing", trialEndsAt: null };
}

export function trialEndsAt(settings?: Settings | null): Date | null {
  const raw = getBilling(settings).trialEndsAt;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isTrialing(settings?: Settings | null): boolean {
  return getBilling(settings).status === "trialing";
}

export function trialDaysLeft(settings?: Settings | null, now = new Date()): number | null {
  const end = trialEndsAt(settings);
  if (!end) return null;
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86400000));
}

export function isSubscriptionActive(settings?: Settings | null, now = new Date()): boolean {
  const b = getBilling(settings);
  if (b.status === "active") return true;
  if (b.status === "trialing") {
    const end = trialEndsAt(settings);
    // No trial end stored yet (pre-migration) -> treat as active trial.
    if (!end) return true;
    return end.getTime() > now.getTime();
  }
  return false;
}

export function getPlanLimits(settings?: Settings | null): PlanLimits {
  return PLAN_LIMITS[getBilling(settings).plan] ?? PLAN_LIMITS.starter;
}

export function canAddBranch(branchCount: number, settings?: Settings | null): boolean {
  return branchCount < getPlanLimits(settings).branches;
}

export function canAddUser(userCount: number, settings?: Settings | null): boolean {
  return userCount < getPlanLimits(settings).users;
}

export function canAddItem(itemCount: number, settings?: Settings | null): boolean {
  return itemCount < getPlanLimits(settings).items;
}

export function canUseClientBilling(settings?: Settings | null): boolean {
  return getPlanLimits(settings).clientBilling;
}
