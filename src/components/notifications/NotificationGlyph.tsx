import {
  Banknote,
  CalendarDays,
  CalendarX,
  ClipboardCheck,
  Crown,
  FileClock,
  FileText,
  Moon,
  PackageMinus,
  ReceiptText,
  Scale,
  TrendingUp,
  Truck,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import type { NotificationKind, NotificationSeverity } from "@/lib/notifications/types";

/** The glyph that identifies each kind of notification. */
export const KIND_ICONS: Record<NotificationKind, LucideIcon> = {
  "stock.low": PackageMinus,
  "stock.take.due": ClipboardCheck,
  "po.progress": Truck,
  "po.overdue": CalendarX,
  "po.draft.stale": FileClock,
  "sales.peak.month": TrendingUp,
  "sales.top.customer": Crown,
  "closing.due": Moon,
  "closing.variance": Scale,
  "drawings.exceed.expenses": Banknote,
  "client.invoice.overdue": ReceiptText,
  "quote.stale": FileText,
  "staff.approval.pending": UserCheck,
  "attendance.missing": CalendarDays,
};

export function severityClass(severity: NotificationSeverity): string {
  switch (severity) {
    case "critical":
      return "is-critical";
    case "warning":
      return "is-warning";
    case "success":
      return "is-success";
    default:
      return "is-info";
  }
}

export default function NotificationGlyph({
  kind,
  severity,
}: {
  kind: NotificationKind;
  severity: NotificationSeverity;
}) {
  const Icon = KIND_ICONS[kind] ?? FileText;
  return (
    <span className={`nt-glyph ${severityClass(severity)}`} aria-hidden="true">
      <Icon strokeWidth={1.7} />
    </span>
  );
}
