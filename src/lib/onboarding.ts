import type { Settings } from "@/types";

export type OnboardingStepId =
  | "shop"
  | "catalog"
  | "sale"
  | "team"
  | "backup";

export type OnboardingStep = {
  id: OnboardingStepId;
  label: string;
  done: boolean;
  to: string;
};

const DISMISS_KEY = "pixobooks.onboarding.dismissed";
const BACKUP_KEY = "pixobooks.backup.doneAt";

/** True once any export/backup has completed on this device. */
export function hasBackupDone(): boolean {
  try {
    return !!localStorage.getItem(BACKUP_KEY);
  } catch {
    return false;
  }
}

/** Call on every successful export or cloud backup. */
export function markBackupDone(): void {
  try {
    localStorage.setItem(BACKUP_KEY, new Date().toISOString());
  } catch {
    // ignore
  }
}

export function isOnboardingDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissOnboarding(): void {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // ignore
  }
}

export function buildOnboardingSteps(args: {
  settings?: Settings | null;
  itemCount: number;
  saleCount: number;
  userCount: number;
}): OnboardingStep[] {
  const { settings, itemCount, saleCount, userCount } = args;
  return [
    {
      id: "shop",
      label: "Set up your shop (name, currency, tax)",
      done: Boolean(settings?.shopName && settings?.currency),
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

export function onboardingProgress(steps: OnboardingStep[]): number {
  if (steps.length === 0) return 100;
  return Math.round((steps.filter((s) => s.done).length / steps.length) * 100);
}
