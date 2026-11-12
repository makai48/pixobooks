import { timeAgo } from "@/lib/utils";
import { formatDateByPreference, getActiveDateFormat } from "@/lib/dateFormat";
import NotificationGlyph from "./NotificationGlyph";
import type {
  AppNotification,
  NotificationKindMeta,
} from "@/lib/notifications/types";

type Props = {
  notification: AppNotification;
  meta?: NotificationKindMeta;
  onOpen?: (notification: AppNotification) => void;
  /** The popover shows a category tag; the full page shows the timestamp. */
  showTag?: boolean;
};

export default function NotificationRow({
  notification,
  meta,
  onOpen,
  showTag = false,
}: Props) {
  const unread = !notification.readAt;
  const label = meta?.label ?? notification.title;
  const category = meta?.category;

  return (
    <button
      type="button"
      className={`nt-row${unread ? " is-unread" : " is-read"}`}
      onClick={() => onOpen?.(notification)}
      aria-label={`${label}. ${notification.body}`}
    >
      <NotificationGlyph
        kind={notification.kind}
        severity={notification.severity}
      />
      <span className="nt-row-copy">
        <span className="nt-row-title">{notification.title}</span>
        {notification.body && <span className="nt-row-body">{notification.body}</span>}
        <span className="nt-row-meta">
          {showTag && category && (
            <span className="nt-row-tag">{category}</span>
          )}
          <span title={formatDateByPreference(notification.createdAt, getActiveDateFormat())}>
            {timeAgo(notification.createdAt)}
          </span>
        </span>
      </span>
    </button>
  );
}
