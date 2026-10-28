import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildOnboardingSteps,
  dismissOnboarding,
  hasBackupDone,
  isOnboardingDismissed,
  markBackupDone,
  onboardingProgress,
} from "@/lib/onboarding";
import type { Settings } from "@/types";

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

const settings = {
  shopName: "Ink & Paper",
  currency: "USD",
} as unknown as Settings;

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("backup marker", () => {
  it("starts unset", () => {
    expect(hasBackupDone()).toBe(false);
  });

  it("records a completed backup", () => {
    markBackupDone();
    expect(hasBackupDone()).toBe(true);
  });

  it("stays false when storage is unavailable", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(hasBackupDone()).toBe(false);
    expect(() => markBackupDone()).not.toThrow();
  });
});

describe("onboarding dismissal", () => {
  it("starts visible", () => {
    expect(isOnboardingDismissed()).toBe(false);
  });

  it("stays dismissed after a reload", () => {
    dismissOnboarding();
    expect(isOnboardingDismissed()).toBe(true);
  });

  it("stays visible when storage is unavailable", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(isOnboardingDismissed()).toBe(false);
    expect(() => dismissOnboarding()).not.toThrow();
  });
});

describe("buildOnboardingSteps", () => {
  it("marks nothing done for a brand-new shop", () => {
    const steps = buildOnboardingSteps({
      settings: null,
      itemCount: 0,
      saleCount: 0,
      userCount: 1,
    });
    expect(steps.map((s) => s.done)).toEqual([false, false, false, false, false]);
    expect(onboardingProgress(steps)).toBe(0);
  });

  it("ticks shop setup only when name and currency are present", () => {
    const partial = buildOnboardingSteps({
      settings: { shopName: "Ink & Paper" } as unknown as Settings,
      itemCount: 0,
      saleCount: 0,
      userCount: 1,
    });
    expect(partial[0].done).toBe(false);
  });

  it("ticks the catalog at three items and the sale at one", () => {
    const steps = buildOnboardingSteps({
      settings,
      itemCount: 3,
      saleCount: 1,
      userCount: 2,
    });
    expect(steps.map((s) => s.id)).toEqual([
      "shop",
      "catalog",
      "sale",
      "team",
      "backup",
    ]);
    expect(steps.map((s) => s.done)).toEqual([true, true, true, true, false]);
  });

  it("ticks the backup step after markBackupDone", () => {
    markBackupDone();
    const steps = buildOnboardingSteps({
      settings,
      itemCount: 3,
      saleCount: 1,
      userCount: 2,
    });
    expect(steps[4].done).toBe(true);
    expect(onboardingProgress(steps)).toBe(100);
  });
});

describe("onboardingProgress", () => {
  it("treats an empty checklist as complete", () => {
    expect(onboardingProgress([])).toBe(100);
  });

  it("rounds to the nearest percent", () => {
    expect(onboardingProgress([{ done: true }, { done: false }, { done: false }])).toBe(
      33
    );
    expect(onboardingProgress([{ done: true }, { done: true }, { done: false }])).toBe(
      67
    );
  });
});
