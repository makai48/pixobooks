import type {
  NotificationKind,
  NotificationKindMeta,
  NotificationRole,
} from "./types";

/**
 * Local mirror of the `notification_kinds` catalog.
 *
 * The database row is authoritative — `useNotificationKinds()` replaces this
 * list at runtime. The mirror exists so the UI still renders sensible labels,
 * icons and gate copy on a workspace whose migration has not been applied
 * yet, and so the delivery-gate screen can explain a kind before the first
 * server round-trip resolves.
 */
export const NOTIFICATION_KIND_META: NotificationKindMeta[] = [
  {
    kind: "stock.low",
    label: "Low stock",
    category: "Inventory",
    severity: "warning",
    description: "Products at or below their reorder level.",
    minRole: "manager",
    requiredPermission: "inventory.edit",
    allowInApp: true,
    allowPush: true,
    quietHoursExempt: false,
    sortOrder: 10,
    enabled: true,
  },
  {
    kind: "stock.take.due",
    label: "Stock take due",
    category: "Inventory",
    severity: "info",
    description: "The shop has not counted stock for a week.",
    minRole: "manager",
    requiredPermission: "inventory.adjust",
    allowInApp: true,
    allowPush: true,
    quietHoursExempt: false,
    sortOrder: 20,
    enabled: true,
  },
  {
    kind: "po.progress",
    label: "Purchase order progress",
    category: "Purchasing",
    severity: "info",
    description: "Orders placed and still waiting for delivery.",
    minRole: "staff",
    requiredPermission: "po.view",
    allowInApp: true,
    allowPush: true,
    quietHoursExempt: false,
    sortOrder: 30,
    enabled: true,
  },
  {
    kind: "po.overdue",
    label: "Purchase order overdue",
    category: "Purchasing",
    severity: "critical",
    description: "A purchase order passed its expected delivery date.",
    minRole: "manager",
    requiredPermission: "po.manage",
    allowInApp: true,
    allowPush: true,
    quietHoursExempt: true,
    sortOrder: 40,
    enabled: true,
  },
  {
    kind: "po.draft.stale",
    label: "Draft order forgotten",
    category: "Purchasing",
    severity: "info",
    description: "A purchase order has been left in draft.",
    minRole: "manager",
    requiredPermission: "po.manage",
    allowInApp: true,
    allowPush: true,
    quietHoursExempt: false,
    sortOrder: 50,
    enabled: true,
  },
  {
    kind: "sales.peak.month",
    label: "Monthly peak sales",
    category: "Performance",
    severity: "success",
    description: "This month is the best trading month so far.",
    minRole: "owner",
    requiredPermission: "stats.view",
    allowInApp: true,
    allowPush: true,
    quietHoursExempt: false,
    sortOrder: 60,
    enabled: true,
  },
  {
    kind: "sales.top.customer",
    label: "Top customer this month",
    category: "Performance",
    severity: "success",
    description: "The customer bringing in the most revenue this month.",
    minRole: "manager",
    requiredPermission: "customers.view",
    allowInApp: true,
    allowPush: true,
    quietHoursExempt: false,
    sortOrder: 70,
    enabled: true,
  },
  {
    kind: "closing.due",
    label: "Daily closing due",
    category: "Finance",
    severity: "warning",
    description: "The till has not been balanced for today.",
    minRole: "manager",
    requiredPermission: "finance.cashbook.view",
    allowInApp: true,
    allowPush: true,
    quietHoursExempt: false,
    sortOrder: 80,
    enabled: true,
  },
  {
    kind: "closing.variance",
    label: "Closing variance",
    category: "Finance",
    severity: "critical",
    description: "The counted cash does not match the ledger.",
    minRole: "manager",
    requiredPermission: "finance.cashbook.view",
    allowInApp: true,
    allowPush: true,
    quietHoursExempt: true,
    sortOrder: 90,
    enabled: true,
  },
  {
    kind: "drawings.exceed.expenses",
    label: "Drawings exceed expenses",
    category: "Finance",
    severity: "critical",
    description: "Money drawn out is more than the shop has spent.",
    minRole: "owner",
    requiredPermission: "finance.manage",
    allowInApp: true,
    allowPush: true,
    quietHoursExempt: true,
    sortOrder: 100,
    enabled: true,
  },
  {
    kind: "client.invoice.overdue",
    label: "Client invoice overdue",
    category: "Finance",
    severity: "warning",
    description: "Client invoices are past their due date.",
    minRole: "manager",
    requiredPermission: "finance.view",
    allowInApp: true,
    allowPush: true,
    quietHoursExempt: false,
    sortOrder: 110,
    enabled: true,
  },
  {
    kind: "quote.stale",
    label: "Quote awaiting a decision",
    category: "Sales",
    severity: "info",
    description: "A quote has been waiting for an answer.",
    minRole: "staff",
    requiredPermission: "quotes.view",
    allowInApp: true,
    allowPush: true,
    quietHoursExempt: false,
    sortOrder: 120,
    enabled: true,
  },
  {
    kind: "staff.approval.pending",
    label: "Approval waiting",
    category: "Team",
    severity: "info",
    description: "An account is waiting for approval.",
    minRole: "manager",
    requiredPermission: "employees.manage",
    allowInApp: true,
    allowPush: true,
    quietHoursExempt: false,
    sortOrder: 130,
    enabled: true,
  },
  {
    kind: "attendance.missing",
    label: "Attendance not marked",
    category: "Team",
    severity: "info",
    description: "Team members have no attendance record today.",
    minRole: "manager",
    requiredPermission: "employees.attendance",
    allowInApp: true,
    allowPush: true,
    quietHoursExempt: false,
    sortOrder: 140,
    enabled: true,
  },
];

export const NOTIFICATION_KIND_KEYS = NOTIFICATION_KIND_META.map(
  (k) => k.kind,
) as NotificationKind[];

export function kindMeta(
  kinds: NotificationKindMeta[],
  kind: string,
): NotificationKindMeta | undefined {
  return kinds.find((k) => k.kind === kind);
}

/** The four workspace tiers, most privileged first. */
export const ROLE_ORDER: NotificationRole[] = ["owner", "admin", "manager", "staff"];

export const ROLE_LABELS: Record<NotificationRole, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  staff: "Staff",
};

/** Higher wins. Mirrors `public.notification_role_rank` in the database. */
export function roleRank(role: string | null | undefined): number {
  switch ((role || "").trim().toLowerCase()) {
    case "owner":
      return 4;
    case "admin":
      return 3;
    case "manager":
      return 2;
    case "staff":
      return 1;
    default:
      return 0;
  }
}

/**
 * Map a free-text job title onto a workspace tier.
 *
 * `user_profiles.role` holds whatever the admin typed ("Cashier", "Head
 * Printer"), so only the four known tiers map; everything else is staff.
 */
export function resolveRole(
  membershipRole: string | null | undefined,
  profileRole: string | null | undefined,
): NotificationRole {
  const tier = Math.max(roleRank(membershipRole), roleRank(profileRole));
  if (tier >= 4) return "owner";
  if (tier === 3) return "admin";
  if (tier === 2) return "manager";
  return "staff";
}

/**
 * The client-side twin of the database gate.
 *
 * The database is the only thing that actually decides who receives a
 * notification; this exists so the delivery-gate screen can explain the rule
 * and preview the recipients before anything is raised.
 */
export function gateAllows(input: {
  policy: {
    minRole: NotificationRole;
    requiredPermission: string | null;
    enabled: boolean;
  };
  role: NotificationRole;
  permissions: string[];
}): boolean {
  if (!input.policy.enabled) return false;
  if (input.role !== "staff" && roleRank(input.role) >= roleRank(input.policy.minRole)) {
    return true;
  }
  if (input.policy.minRole === "staff") return true;
  if (
    input.policy.requiredPermission &&
    input.permissions.includes(input.policy.requiredPermission)
  ) {
    return true;
  }
  return false;
}

/** Human sentence describing a gate rule, used in the gate editor. */
export function describeGate(input: {
  minRole: NotificationRole;
  requiredPermission: string | null;
}): string {
  const role = ROLE_LABELS[input.minRole];
  if (!input.requiredPermission) return `${role} and above`;
  return `${role} and above, or anyone with ${input.requiredPermission}`;
}
