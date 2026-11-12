import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Bell, BellOff, CheckCheck, Settings2 } from "lucide-react";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationKinds,
  useNotifications,
  useUnreadCount,
} from "@/hooks/useNotifications";
import { kindMeta } from "@/lib/notifications/catalog";
import NotificationRow from "./NotificationRow";
import type { AppNotification } from "@/lib/notifications/types";
import "./notifications.css";

const PREVIEW_COUNT = 8;
const MOBILE_QUERY = "(max-width: 767px)";

/**
 * The bell and its panel.
 *
 * On phones the panel is a bottom sheet; from tablet up it floats under the
 * bell. The sheet is portalled to `document.body` because the top bar uses
 * `backdrop-filter`, and a filtered ancestor becomes the containing block of
 * a fixed-position child — the sheet would otherwise be trapped inside the
 * bar. The list is a preview: the full inbox, the delivery gate and the
 * personal preferences live on `/notifications`.
 */
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const nav = useNavigate();

  const { data: notifications } = useNotifications();
  const { data: kinds } = useNotificationKinds();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const unread = useUnreadCount(notifications);
  const items = notifications ?? [];

  useEffect(() => {
    const query = window.matchMedia(MOBILE_QUERY);
    const apply = () => setIsMobile(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  // The sheet covers the page, so the page behind it must not scroll.
  useEffect(() => {
    if (!open || !isMobile) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open, isMobile]);

  const openItem = (notification: AppNotification) => {
    if (!notification.readAt) markRead.mutate(notification.id);
    setOpen(false);
    if (notification.link) nav(notification.link);
  };

  const panel = (
    <>
      {isMobile && <div className="nt-scrim" onClick={() => setOpen(false)} />}
      <div className="nt-popover" role="dialog" aria-label="Notifications" ref={panelRef}>
        <div className="nt-popover-head">
          <span className="nt-popover-title">Notifications</span>
          <span className="nt-popover-count">
            {unread > 0 ? `${unread} unread` : "All caught up"}
          </span>
          {unread > 0 && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => markAllRead.mutate()}
              title="Mark every notification as read"
            >
              <CheckCheck className="w-4 h-4" />
              <span className="hidden sm:inline">Mark read</span>
            </button>
          )}
        </div>

        <div className="nt-popover-body">
          {items.length === 0 ? (
            <div className="nt-empty">
              <span className="nt-empty-glyph" aria-hidden="true">
                <BellOff strokeWidth={1.6} />
              </span>
              <div className="nt-empty-title">Nothing needs you</div>
              <p className="nt-empty-text">
                Low stock, overdue orders, closing reminders and revenue
                milestones will land here.
              </p>
            </div>
          ) : (
            items.slice(0, PREVIEW_COUNT).map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                meta={kinds ? kindMeta(kinds, notification.kind) : undefined}
                onOpen={openItem}
                showTag
              />
            ))
          )}
        </div>

        <div className="nt-popover-foot">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setOpen(false);
              nav("/notifications");
            }}
          >
            View all notifications
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setOpen(false);
              nav("/notifications?tab=preferences");
            }}
            title="Notification preferences"
            aria-label="Notification preferences"
          >
            <Settings2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="nt" ref={rootRef} style={{ position: "relative" }}>
      <button
        ref={buttonRef}
        type="button"
        className={`nt-bell${unread > 0 ? " has-unread" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={
          unread > 0
            ? `Notifications, ${unread} unread`
            : "Notifications, none unread"
        }
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Notifications"
      >
        <Bell strokeWidth={1.75} />
        {unread > 0 && (
          <span className="nt-badge num">{unread > 99 ? "99+" : unread}</span>
        )}
      </button>

      {open &&
        (isMobile ? (
          createPortal(<div className="nt">{panel}</div>, document.body)
        ) : (
          panel
        ))}
    </div>
  );
}
