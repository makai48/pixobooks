import { describe, expect, it } from "vitest";
import {
  describeGate,
  gateAllows,
  kindMeta,
  NOTIFICATION_KIND_META,
  resolveRole,
  roleRank,
  ROLE_LABELS,
  ROLE_ORDER,
} from "./catalog";
import { formatClock, isWithinQuietHours, parseClock } from "./quietHours";
import type { NotificationRole } from "./types";

describe("notification roles", () => {
  it("ranks the workspace tiers", () => {
    expect(roleRank("owner")).toBe(4);
    expect(roleRank("Admin")).toBe(3);
    expect(roleRank(" manager ")).toBe(2);
    expect(roleRank("staff")).toBe(1);
    expect(roleRank("Cashier")).toBe(0);
    expect(roleRank(null)).toBe(0);
  });

  it("resolves a tier from the membership role and the free-text job title", () => {
    expect(resolveRole("owner", "Cashier")).toBe("owner");
    expect(resolveRole("staff", "Manager")).toBe("manager");
    expect(resolveRole("staff", "Designer")).toBe("staff");
    expect(resolveRole(null, undefined)).toBe("staff");
  });
});

describe("delivery gate", () => {
  const policy = {
    minRole: "manager" as NotificationRole,
    requiredPermission: "inventory.edit",
    enabled: true,
  };

  it("lets a role at or above the minimum through", () => {
    expect(
      gateAllows({
        policy,
        role: "manager",
        permissions: [],
      }),
    ).toBe(true);
    expect(
      gateAllows({
        policy,
        role: "owner",
        permissions: [],
      }),
    ).toBe(true);
  });

  it("blocks a role below the minimum without the permission", () => {
    expect(
      gateAllows({
        policy,
        role: "staff",
        permissions: ["pos.sell"],
      }),
    ).toBe(false);
  });

  it("lets the permission override the role floor", () => {
    expect(
      gateAllows({
        policy,
        role: "staff",
        permissions: ["inventory.edit"],
      }),
    ).toBe(true);
  });

  it("always lets staff through a staff-floor policy", () => {
    expect(
      gateAllows({
        policy: {
          minRole: "staff",
          requiredPermission: "po.view",
          enabled: true,
        },
        role: "staff",
        permissions: [],
      }),
    ).toBe(true);
  });

  it("blocks everything when the policy is switched off", () => {
    expect(
      gateAllows({
        policy: { ...policy, enabled: false },
        role: "owner",
        permissions: [],
      }),
    ).toBe(false);
  });

  it("describes the rule in plain words", () => {
    expect(describeGate({ minRole: "manager", requiredPermission: null })).toBe(
      "Manager and above",
    );
    expect(
      describeGate({ minRole: "owner", requiredPermission: "finance.manage" }),
    ).toBe("Owner and above, or anyone with finance.manage");
  });
});

describe("quiet hours", () => {
  const settings = {
    quietHoursEnabled: true,
    quietStart: "20:00",
    quietEnd: "06:00",
  };

  it("reads a clock string", () => {
    expect(parseClock("20:00", 0)).toBe(20 * 60);
    expect(parseClock("6:05", 0)).toBe(365);
    expect(parseClock("nonsense", 42)).toBe(42);
  });

  it("holds the evening quiet across midnight", () => {
    expect(
      isWithinQuietHours(settings, new Date("2026-11-12T21:30:00")),
    ).toBe(true);
    expect(
      isWithinQuietHours(settings, new Date("2026-11-12T02:00:00")),
    ).toBe(true);
    expect(
      isWithinQuietHours(settings, new Date("2026-11-12T09:00:00")),
    ).toBe(false);
    expect(
      isWithinQuietHours(settings, new Date("2026-11-12T19:59:00")),
    ).toBe(false);
  });

  it("handles a same-day window", () => {
    const daytime = { ...settings, quietStart: "13:00", quietEnd: "14:00" };
    expect(isWithinQuietHours(daytime, new Date("2026-11-12T13:30:00"))).toBe(
      true,
    );
    expect(isWithinQuietHours(daytime, new Date("2026-11-12T15:30:00"))).toBe(
      false,
    );
  });

  it("is silent when quiet hours are switched off", () => {
    expect(
      isWithinQuietHours(
        { ...settings, quietHoursEnabled: false },
        new Date("2026-11-12T22:00:00"),
      ),
    ).toBe(false);
  });

  it("formats a clock for people", () => {
    expect(formatClock("20:00")).toBe("8:00 PM");
    expect(formatClock("06:30")).toBe("6:30 AM");
    expect(formatClock("12:05")).toBe("12:05 PM");
  });
});

describe("notification catalog", () => {
  it("has no duplicate kinds", () => {
    const keys = NOTIFICATION_KIND_META.map((k) => k.kind);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("covers every event the shop must be told about", () => {
    const keys = NOTIFICATION_KIND_META.map((k) => k.kind);
    expect(keys).toEqual(
      expect.arrayContaining([
        "stock.low",
        "stock.take.due",
        "po.progress",
        "po.overdue",
        "sales.peak.month",
        "sales.top.customer",
        "closing.due",
        "closing.variance",
        "drawings.exceed.expenses",
        "client.invoice.overdue",
      ]),
    );
  });

  it("gives every kind a label, a description and a valid gate", () => {
    for (const kind of NOTIFICATION_KIND_META) {
      expect(kind.label.length).toBeGreaterThan(0);
      expect(kind.description.length).toBeGreaterThan(0);
      expect(ROLE_ORDER).toContain(kind.minRole);
      expect(ROLE_LABELS[kind.minRole]).toBeTruthy();
      expect(["info", "success", "warning", "critical"]).toContain(kind.severity);
    }
  });

  it("finds a kind by its key", () => {
    expect(kindMeta(NOTIFICATION_KIND_META, "closing.due")?.label).toBe(
      "Daily closing due",
    );
    expect(kindMeta(NOTIFICATION_KIND_META, "nope")).toBeUndefined();
  });
});
