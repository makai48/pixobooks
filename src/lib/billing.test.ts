import { describe, expect, it } from "vitest";
import {
  getBilling,
  getPlanLimits,
  isSubscriptionActive,
  canAddBranch,
  canUseClientBilling,
} from "@/lib/billing";

describe("billing", () => {
  it("defaults to starter trial when unset", () => {
    const b = getBilling(null);
    expect(b.plan).toBe("starter");
    expect(b.status).toBe("trialing");
    expect(isSubscriptionActive(null)).toBe(true);
  });

  it("enforces plan limits", () => {
    expect(getPlanLimits({ billing: { plan: "starter", status: "active" } } as never).branches).toBe(1);
    expect(canAddBranch(1, { billing: { plan: "starter", status: "active" } } as never)).toBe(false);
    expect(canAddBranch(0, { billing: { plan: "starter", status: "active" } } as never)).toBe(true);
    expect(canUseClientBilling({ billing: { plan: "starter", status: "active" } } as never)).toBe(false);
    expect(canUseClientBilling({ billing: { plan: "growth", status: "active" } } as never)).toBe(true);
  });

  it("expires trials", () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    expect(isSubscriptionActive({ billing: { plan: "starter", status: "trialing", trialEndsAt: past } } as never)).toBe(false);
    expect(isSubscriptionActive({ billing: { plan: "starter", status: "active" } } as never)).toBe(true);
  });
});
