import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BellOff, CheckCheck, Inbox, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationKinds,
  useNotifications,
  useUnreadCount,
} from "@/hooks/useNotifications";
import { kindMeta } from "@/lib/notifications/catalog";
import NotificationRow from "@/components/notifications/NotificationRow";
import DeliveryGate from "@/components/notifications/DeliveryGate";
import NotificationPreferencesPanel from "@/components/notifications/NotificationPreferencesPanel";
import "@/components/notifications/notifications.css";

type Tab = "inbox" | "gate" | "preferences";

const TAB_ICONS = {
  inbox: Inbox,
  gate: ShieldCheck,
  preferences: SlidersHorizontal,
} as const;

export default function Notifications() {
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const { can, isAdmin, isAppAdmin } = useAuth();

  const tab = (params.get("tab") as Tab) || "inbox";
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const { data: notifications } = useNotifications();
  const { data: kinds } = useNotificationKinds();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const unread = useUnreadCount(notifications);
  const items = notifications ?? [];

  const canEditGate = isAppAdmin || isAdmin || can("settings.manage");

  const visible = useMemo(() => {
    if (filter === "unread") return items.filter((n) => !n.readAt);
    return items;
  }, [items, filter]);

  const openItem = (id: string, link: string | null) => {
    markRead.mutate(id);
    if (link) nav(link);
  };

  const setTab = (next: Tab) => {
    if (next === tab) return;
    setParams(next === "inbox" ? {} : { tab: next }, { replace: true });
  };

  return (
    <div className="nt">
      <div className="nt-page">
        <header className="nt-page-head">
          <div>
            <h1 className="nt-page-title">Notifications</h1>
            <p className="nt-page-sub">
              Stock levels, purchase orders, daily closing, revenue milestones
              and team requests — filtered through your workspace's delivery
              gate so only the right people are interrupted.
            </p>
          </div>
          {tab === "inbox" && unread > 0 && (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => markAllRead.mutate()}
            >
              <CheckCheck className="w-4 h-4" />
              Mark all read
            </button>
          )}
        </header>

        <nav className="nt-tabs" aria-label="Notification views">
          {(["inbox", "gate", "preferences"] as Tab[]).map((key) => {
            const Icon = TAB_ICONS[key];
            const active = tab === key;
            return (
              <button
                key={key}
                type="button"
                className={`nt-tab${active ? " is-active" : ""}`}
                aria-current={active ? "page" : undefined}
                onClick={() => setTab(key)}
              >
                <Icon className="w-3.5 h-3.5" strokeWidth={1.9} />
                {key === "inbox"
                  ? "Inbox"
                  : key === "gate"
                    ? "Delivery gate"
                    : "Preferences"}
                {key === "inbox" && unread > 0 && (
                  <span className="num">{unread}</span>
                )}
              </button>
            );
          })}
        </nav>

        {tab === "inbox" && (
          <>
            <div className="nt-chip-row">
              <button
                type="button"
                className={`nt-chip${filter === "all" ? " is-active" : ""}`}
                onClick={() => setFilter("all")}
              >
                All · {items.length}
              </button>
              <button
                type="button"
                className={`nt-chip${filter === "unread" ? " is-active" : ""}`}
                onClick={() => setFilter("unread")}
              >
                Unread · {unread}
              </button>
            </div>

            <div className="nt-panel">
              {visible.length === 0 ? (
                <div className="nt-empty">
                  <span className="nt-empty-glyph" aria-hidden="true">
                    <BellOff strokeWidth={1.6} />
                  </span>
                  <div className="nt-empty-title">
                    {filter === "unread" ? "Nothing unread" : "Nothing needs you"}
                  </div>
                  <p className="nt-empty-text">
                    Low stock, overdue purchase orders, the daily closing, a
                    record month and top customers will all arrive here.
                  </p>
                </div>
              ) : (
                visible.map((notification) => (
                  <NotificationRow
                    key={notification.id}
                    notification={notification}
                    meta={kinds ? kindMeta(kinds, notification.kind) : undefined}
                    onOpen={(item) => openItem(item.id, item.link)}
                    showTag
                  />
                ))
              )}
            </div>
          </>
        )}

        {tab === "gate" && <DeliveryGate readOnly={!canEditGate} />}

        {tab === "preferences" && <NotificationPreferencesPanel />}
      </div>
    </div>
  );
}
