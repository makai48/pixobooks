// First-run checklist state + step calculation. Kept free of React so it can
// be unit-tested and reused by the dashboard card.
import type { Settings } from "@/types";

const DISMISSED_KEY = "pixobooks.onboarding.dismissed";
const BACKUP_KEY = "pixobooks.backup.doneAt";

/** True once the owner has successfully uploaded a backup. */
export function hasBackupDone(): boolean {
  try {
    return !!localStorage.getItem(BACKUP_KEY);
  } catch {
    return false;
  }
}

/** Record a successful backup so the checklist can tick itself off. */
export function markBackupDone(): void {
  try {
    localStorage.setItem(BACKUP_KEY, new Date().toISOString());
  } catch {
    // Storage can be unavailable (private mode) — the checklist is cosmetic.
  }
}

export function isOnboardingDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissOnboarding(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // Ignore storage failures — dismissal only hides a hint card.
  }
}

export type OnboardingStep = {
  id: string;
  label: string;
  done: boolean;
  to: string;
};

export type OnboardingFacts = {
  settings?: Settings | null;
  itemCount: number;
  saleCount: number;
  userCount: number;
};

export function buildOnboardingSteps({
  settings,
  itemCount,
  saleCount,
  userCount,
}: OnboardingFacts): OnboardingStep[] {
  return [
    {
      id: "shop",
      label: "Set up your shop (name, currency, tax)",
      done: !!(settings?.shopName && settings?.currency),
      to: "/settings",
    },
    {
      id: "catalog",
      label: "Add your first 3 items",
      done: itemCount >= 3,
      to: "/inventory",
    },
    {
      id: "sale",
      label: "Record your first sale",
      done: saleCount >= 1,
      to: "/",
    },
    {
      id: "team",
      label: "Invite a teammate",
      done: userCount >= 2,
      to: "/employees",
    },
    {
      id: "backup",
      label: "Download your first backup",
      done: hasBackupDone(),
      to: "/settings",
    },
  ];
}

export function onboardingProgress(steps: Pick<OnboardingStep, "done">[]): number {
  if (steps.length === 0) return 100;
  return Math.round((steps.filter((s) => s.done).length / steps.length) * 100);
}
