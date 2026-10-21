import { describe, expect, it } from "vitest";
import {
  buildOnboardingSteps,
  hasBackupDone,
  markBackupDone,
  onboardingProgress,
} from "@/lib/onboarding";

describe("onboarding backup step", () => {
  it("stays incomplete until a backup completes (node has no storage)", () => {
    // No localStorage in vitest node env — must degrade gracefully, never throw.
    expect(() => markBackupDone()).not.toThrow();
    expect(hasBackupDone()).toBe(false);
    const steps = buildOnboardingSteps({ itemCount: 5, saleCount: 2, userCount: 3 });
    expect(steps.find((s) => s.id === "backup")?.done).toBe(false);
  });

  it("computes progress over 5 steps", () => {
    const steps = buildOnboardingSteps({ itemCount: 5, saleCount: 2, userCount: 3 });
    // shop (no settings) + backup incomplete = 3/5
    expect(onboardingProgress(steps)).toBe(60);
  });
});
