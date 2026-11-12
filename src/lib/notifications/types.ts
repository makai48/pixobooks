/**
 * Notification domain types.
 *
 * The database is the source of truth for the catalog and the delivery gate;
 * these types mirror the columns so the UI never guesses at a shape.
 */

export type NotificationSeverity = "info" | "success" | "warning" | "critical";

export type NotificationCategory =
  | "Inventory"
  | "Purchasing"
  | "Performance"
  | "Finance"
  | "Sales"
  | "Team";

export type NotificationKind =
  | "stock.low"
  | "stock.take.due"
  | "po.progress"
  | "po.overdue"
  | "po.draft.stale"
  | "sales.peak.month"
  | "sales.top.customer"
  | "closing.due"
  | "closing.variance"
  | "drawings.exceed.expenses"
  | "client.invoice.overdue"
  | "quote.stale"
  | "staff.approval.pending"
  | "attendance.missing";

/** Workspace tiers, ordered from most to least privileged. */
export type NotificationRole = "owner" | "admin" | "manager" | "staff";

export type NotificationChannel = "in_app" | "push";

/** A row in the global catalog (`notification_kinds`). */
export type NotificationKindMeta = {
  kind: NotificationKind;
  label: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  description: string;
  minRole: NotificationRole;
  requiredPermission: string | null;
  allowInApp: boolean;
  allowPush: boolean;
  quietHoursExempt: boolean;
  sortOrder: number;
  enabled: boolean;
};

/** A row in the per-business delivery gate (`notification_policies`). */
export type NotificationPolicy = {
  businessId: string;
  kind: NotificationKind;
  minRole: NotificationRole;
  requiredPermission: string | null;
  inAppEnabled: boolean;
  pushEnabled: boolean;
  quietHoursExempt: boolean;
  enabled: boolean;
};

/** A per-user channel switch (`notification_preferences`). */
export type NotificationPreference = {
  kind: NotificationKind;
  inAppEnabled: boolean;
  pushEnabled: boolean;
  quietHoursExempt: boolean | null;
};

/** Business-level delivery settings (`notification_settings`). */
export type NotificationSettings = {
  businessId: string;
  quietHoursEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  closingReminderTime: string;
  digestHour: number;
};

/** One inbox row (`notifications`) — always addressed to a single person. */
export type AppNotification = {
  id: string;
  businessId: string;
  kind: NotificationKind;
  severity: NotificationSeverity;
  title: string;
  body: string;
  link: string | null;
  meta: Record<string, unknown>;
  dedupeKey: string;
  source: string;
  createdAt: string;
  readAt: string | null;
  dismissedAt: string | null;
  deliveredAt: string | null;
};

export type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};
