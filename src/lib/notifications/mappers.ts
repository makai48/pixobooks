import type { DbRow } from "@/lib/mappers";
import type {
  AppNotification,
  NotificationKind,
  NotificationKindMeta,
  NotificationPolicy,
  NotificationPreference,
  NotificationRole,
  NotificationSettings,
} from "./types";

/**
 * Row → domain mappers for the notification system.
 *
 * Kept next to the notification code so the whole feature reads as one
 * module: the database column names never leak into the components.
 */

function str(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function bool(value: unknown, fallback = false): boolean {
  if (value === null || value === undefined) return fallback;
  return !!value;
}

export function mapNotification(r: DbRow): AppNotification {
  return {
    id: str(r.id),
    businessId: str(r.business_id),
    kind: str(r.kind) as NotificationKind,
    severity: (str(r.severity, "info") as AppNotification["severity"]),
    title: str(r.title),
    body: str(r.body),
    link: r.link ? str(r.link) : null,
    meta: (r.meta && typeof r.meta === "object" ? r.meta : {}) as Record<
      string,
      unknown
    >,
    dedupeKey: str(r.dedupe_key),
    source: str(r.source, "system"),
    createdAt: str(r.created_at),
    readAt: r.read_at ? str(r.read_at) : null,
    dismissedAt: r.dismissed_at ? str(r.dismissed_at) : null,
    deliveredAt: r.delivered_at ? str(r.delivered_at) : null,
  };
}

export function mapNotificationKind(r: DbRow): NotificationKindMeta {
  return {
    kind: str(r.kind) as NotificationKind,
    label: str(r.label),
    category: str(r.category, "General") as NotificationKindMeta["category"],
    severity: str(r.severity, "info") as NotificationKindMeta["severity"],
    description: str(r.description),
    minRole: str(r.min_role, "staff") as NotificationRole,
    requiredPermission: r.required_permission
      ? str(r.required_permission)
      : null,
    allowInApp: bool(r.allow_in_app, true),
    allowPush: bool(r.allow_push, true),
    quietHoursExempt: bool(r.quiet_hours_exempt, false),
    sortOrder: Number(r.sort_order ?? 100),
    enabled: bool(r.enabled, true),
  };
}

export function mapNotificationPolicy(r: DbRow): NotificationPolicy {
  return {
    businessId: str(r.business_id),
    kind: str(r.kind) as NotificationKind,
    minRole: str(r.min_role, "staff") as NotificationRole,
    requiredPermission: r.required_permission
      ? str(r.required_permission)
      : null,
    inAppEnabled: bool(r.in_app_enabled, true),
    pushEnabled: bool(r.push_enabled, true),
    quietHoursExempt: bool(r.quiet_hours_exempt, false),
    enabled: bool(r.enabled, true),
  };
}

export function mapNotificationPreference(
  r: DbRow,
): NotificationPreference {
  return {
    kind: str(r.kind) as NotificationKind,
    inAppEnabled: bool(r.in_app_enabled, true),
    pushEnabled: bool(r.push_enabled, true),
    quietHoursExempt:
      r.quiet_hours_exempt === null || r.quiet_hours_exempt === undefined
        ? null
        : bool(r.quiet_hours_exempt),
  };
}

export function mapNotificationSettings(r: DbRow): NotificationSettings {
  return {
    businessId: str(r.business_id),
    quietHoursEnabled: bool(r.quiet_hours_enabled, true),
    quietStart: str(r.quiet_start, "20:00").slice(0, 5),
    quietEnd: str(r.quiet_end, "06:00").slice(0, 5),
    closingReminderTime: str(r.closing_reminder_time, "19:00").slice(0, 5),
    digestHour: Number(r.digest_hour ?? 7),
  };
}
