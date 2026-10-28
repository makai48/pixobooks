import { describe, expect, it } from "vitest";
import {
  describePasswordUpdateError,
  describeSignInError,
  isTempPasswordExpired,
  isWrongPasswordError,
  resolveSignInGate,
} from "@/lib/signInFlow";

const NOW = new Date("2026-10-27T12:00:00.000Z");
const PAST = "2026-10-26T12:00:00.000Z";
const FUTURE = "2026-10-29T12:00:00.000Z";

describe("isTempPasswordExpired", () => {
  it("treats a missing or unparseable expiry as not expired", () => {
    expect(isTempPasswordExpired(null, NOW)).toBe(false);
    expect(isTempPasswordExpired(undefined, NOW)).toBe(false);
    expect(isTempPasswordExpired("not-a-date", NOW)).toBe(false);
  });

  it("compares against the supplied clock", () => {
    expect(isTempPasswordExpired(PAST, NOW)).toBe(true);
    expect(isTempPasswordExpired(FUTURE, NOW)).toBe(false);
  });
});

describe("resolveSignInGate", () => {
  it("reports rejection even when the temp password has lapsed", () => {
    expect(
      resolveSignInGate(
        {
          approvalStatus: "rejected",
          mustChangePassword: true,
          tempPasswordExpiresAt: PAST,
          notes: "No longer with the shop",
        },
        NOW
      )
    ).toEqual({ type: "rejected", notes: "No longer with the shop" });
  });

  it("blocks an expired temp password for a never-used invite", () => {
    expect(
      resolveSignInGate(
        {
          approvalStatus: "pending_first_login",
          mustChangePassword: true,
          tempPasswordExpiresAt: PAST,
        },
        NOW
      )
    ).toEqual({ type: "expired" });
  });

  it("keeps an awaiting-approval account in pending even if the temp lapsed", () => {
    expect(
      resolveSignInGate(
        {
          approvalStatus: "pending_approval",
          mustChangePassword: true,
          tempPasswordExpiresAt: PAST,
        },
        NOW
      )
    ).toEqual({ type: "pending_approval", requestedAt: null });
  });

  it("blocks an approved account whose temp password lapsed before the change", () => {
    expect(
      resolveSignInGate(
        {
          approvalStatus: "approved",
          mustChangePassword: true,
          tempPasswordExpiresAt: PAST,
        },
        NOW
      )
    ).toEqual({ type: "expired" });
  });

  it("sends a never-used invite to the pending_first_login gate", () => {
    expect(
      resolveSignInGate(
        {
          approvalStatus: "pending_first_login",
          mustChangePassword: true,
          tempPasswordExpiresAt: FUTURE,
        },
        NOW
      )
    ).toEqual({ type: "pending_first_login", requestedAt: null });
  });

  it("keeps an already-used invite in pending_approval", () => {
    expect(
      resolveSignInGate(
        {
          approvalStatus: "pending_approval",
          mustChangePassword: true,
          tempPasswordExpiresAt: FUTURE,
          approvalRequestedAt: "2026-10-27T10:00:00.000Z",
        },
        NOW
      )
    ).toEqual({
      type: "pending_approval",
      requestedAt: "2026-10-27T10:00:00.000Z",
    });
  });

  it("routes an approved account to the forced password change", () => {
    expect(
      resolveSignInGate(
        {
          approvalStatus: "approved",
          mustChangePassword: true,
          tempPasswordExpiresAt: FUTURE,
        },
        NOW
      )
    ).toEqual({ type: "approved", mustChangePassword: true });
  });

  it("lets a fully onboarded account straight through", () => {
    expect(resolveSignInGate({ approvalStatus: "approved" }, NOW)).toEqual({
      type: "approved",
      mustChangePassword: false,
    });
  });

  it("ignores expiry once the permanent password is set", () => {
    expect(
      resolveSignInGate(
        {
          approvalStatus: "approved",
          mustChangePassword: false,
          tempPasswordExpiresAt: PAST,
        },
        NOW
      )
    ).toEqual({ type: "approved", mustChangePassword: false });
  });

  it("treats legacy rows without an approval_status as approved", () => {
    expect(
      resolveSignInGate({ approvalStatus: null, mustChangePassword: false }, NOW)
    ).toEqual({ type: "approved", mustChangePassword: false });
  });
});

describe("describeSignInError", () => {
  it("explains the GoTrue schema failure in user terms", () => {
    expect(
      describeSignInError(new Error("500: Database error querying schema"))
    ).toMatch(/re-issue your temporary password/i);
  });

  it("explains an unconfirmed email", () => {
    expect(describeSignInError(new Error("Email not confirmed"))).toMatch(
      /not confirmed/i
    );
  });

  it("explains wrong credentials without leaking the raw error", () => {
    const msg = describeSignInError(new Error("Invalid login credentials"));
    expect(msg).toMatch(/case-sensitive/i);
    expect(msg).not.toMatch(/invalid login credentials/i);
  });

  it("passes unknown errors through unchanged", () => {
    expect(describeSignInError(new Error("Approval request blocked"))).toBe(
      "Approval request blocked"
    );
  });

  it("has a fallback for empty failures", () => {
    expect(describeSignInError(null)).toBe("Sign in failed");
  });
});

describe("isWrongPasswordError", () => {
  it("counts real credential failures", () => {
    expect(isWrongPasswordError(new Error("Invalid login credentials"))).toBe(true);
    expect(isWrongPasswordError(new Error("invalid_grant"))).toBe(true);
  });

  it("does not lock users out for infrastructure failures", () => {
    expect(
      isWrongPasswordError(new Error("500: Database error querying schema"))
    ).toBe(false);
    expect(isWrongPasswordError(new Error("Failed to fetch"))).toBe(false);
  });
});

describe("describePasswordUpdateError", () => {
  it("explains a rejected current password without echoing GoTrue", () => {
    const msg = describePasswordUpdateError(
      new Error("Current password required when setting new password.")
    );
    expect(msg).toMatch(/temporary password/i);
    expect(msg).toMatch(/case-sensitive/i);
    expect(msg).not.toMatch(/Current password required when setting/i);
  });

  it("explains reusing the old password", () => {
    expect(
      describePasswordUpdateError(
        new Error("New password should be different from the old password.")
      )
    ).toMatch(/must be different/i);
  });

  it("explains an expired session", () => {
    expect(
      describePasswordUpdateError(new Error("Auth session missing!"))
    ).toMatch(/sign in again/i);
  });

  it("passes unknown errors through and never returns an empty message", () => {
    expect(describePasswordUpdateError(new Error("Kaboom"))).toBe("Kaboom");
    expect(describePasswordUpdateError(null)).toBe("Could not update your password.");
  });
});
