import { useMemo } from "react";
import { Moon, Timer } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  useNotificationKinds,
  useNotificationPreferences,
  useNotificationSettings,
  useUpdateNotificationPreference,
  useUpdateNotificationSettings,
} from "@/hooks/useNotifications";
import { formatClock } from "@/lib/notifications/quietHours";
import PushOptIn from "./PushOptIn";
import type {
  NotificationKind,
  NotificationPreference,
} from "@/lib/notifications/types";

/**
 * The personal half of the gate: quiet hours and the per-kind channels this
 * person wants. The workspace half (who is allowed to receive a kind at
 * all) lives in the delivery gate.
 */
export default function NotificationPreferencesPanel() {
  const { data: kinds } = useNotificationKinds();
  const { data: preferences } = useNotificationPreferences();
  const { data: settings } = useNotificationSettings();
  const savePreference = useUpdateNotificationPreference();
  const saveSettings = useUpdateNotificationSettings();
  const { isAdmin, isAppAdmin, can } = useAuth();

  // Quiet hours and the closing reminder belong to the workspace, so only a
  // privileged tier may change them. A personal channel switch is always the
  // member's own.
  const canEditWorkspace = isAppAdmin || isAdmin || can("settings.manage");

  const preferenceFor = useMemo(() => {
    const map = new Map<NotificationKind, NotificationPreference>();
    (preferences ?? []).forEach((p) => map.set(p.kind, p));
    return map;
  }, [preferences]);

  const quietStart = settings?.quietStart ?? "20:00";
  const quietEnd = settings?.quietEnd ?? "06:00";

  return (
    <div className="nt-page" style={{ padding: 0 }}>
      <div className="nt-panel">
        <div className="nt-panel-head">
          <div>
            <div className="nt-panel-title">When may we reach you?</div>
            <p className="nt-panel-sub">
              Quiet hours silence device alerts and in-app pop-ups. The inbox
              still records everything, so nothing is lost — it is only held
              back until the shop wakes up.
            </p>
          </div>
        </div>
        <div className="nt-gate-row" style={{ borderBottom: 0 }}>
          <div className="nt-gate-controls">
            <label className="nt-switch">
              <input
                type="checkbox"
                checked={settings?.quietHoursEnabled ?? true}
                disabled={!canEditWorkspace}
                onChange={(e) =>
                  saveSettings.mutate({ quietHoursEnabled: e.target.checked })
                }
              />
              <span className="nt-switch-track">
                <span className="nt-switch-thumb" />
              </span>
              <span className="nt-switch-label">
                <Moon className="inline w-3.5 h-3.5" /> Quiet hours
              </span>
            </label>
            <span className="nt-gate-desc">from</span>
            <input
              type="time"
              className="nt-input"
              value={quietStart}
              disabled={!canEditWorkspace}
              aria-label="Quiet hours start"
              onChange={(e) =>
                saveSettings.mutate({ quietStart: e.target.value })
              }
            />
            <span className="nt-gate-desc">to</span>
            <input
              type="time"
              className="nt-input"
              value={quietEnd}
              disabled={!canEditWorkspace}
              aria-label="Quiet hours end"
              onChange={(e) => saveSettings.mutate({ quietEnd: e.target.value })}
            />
            <span className="nt-gate-desc">
              {formatClock(quietStart)} → {formatClock(quietEnd)}
            </span>
          </div>

          <div className="nt-gate-controls">
            <Timer className="w-4 h-4" />
            <span className="nt-gate-desc">Closing reminder</span>
            <input
              type="time"
              className="nt-input"
              value={settings?.closingReminderTime ?? "19:00"}
              disabled={!canEditWorkspace}
              aria-label="Daily closing reminder time"
              onChange={(e) =>
                saveSettings.mutate({ closingReminderTime: e.target.value })
              }
            />
            {!canEditWorkspace && (
              <span className="nt-gate-desc">
                A workspace setting — ask an owner, admin or manager to change
                it.
              </span>
            )}
          </div>

          <div className="nt-gate-controls">
            <PushOptIn />
          </div>
        </div>
      </div>

      <div className="nt-panel">
        <div className="nt-panel-head">
          <div>
            <div className="nt-panel-title">Your channels</div>
            <p className="nt-panel-sub">
              Switch off anything you do not want to hear about. This only
              affects you — the workspace gate decides who receives a kind
              in the first place.
            </p>
          </div>
        </div>
        <div className="nt-gate">
          {(kinds ?? []).map((kind) => {
            const preference = preferenceFor.get(kind.kind);
            const inApp = preference?.inAppEnabled ?? true;
            const push = preference?.pushEnabled ?? kind.allowPush;
            const exempt = preference?.quietHoursExempt ?? null;

            return (
              <div className="nt-gate-row" key={kind.kind}>
                <div>
                  <div className="nt-gate-title">{kind.label}</div>
                  <div className="nt-gate-desc">{kind.description}</div>
                </div>
                <div className="nt-gate-controls">
                  <label className="nt-switch">
                    <input
                      type="checkbox"
                      checked={inApp}
                      onChange={(e) =>
                        savePreference.mutate({
                          kind: kind.kind,
                          inAppEnabled: e.target.checked,
                          pushEnabled: push,
                          quietHoursExempt: exempt,
                        })
                      }
                    />
                    <span className="nt-switch-track">
                      <span className="nt-switch-thumb" />
                    </span>
                    <span className="nt-switch-label">In app</span>
                  </label>
                  <label className="nt-switch">
                    <input
                      type="checkbox"
                      checked={push}
                      onChange={(e) =>
                        savePreference.mutate({
                          kind: kind.kind,
                          inAppEnabled: inApp,
                          pushEnabled: e.target.checked,
                          quietHoursExempt: exempt,
                        })
                      }
                    />
                    <span className="nt-switch-track">
                      <span className="nt-switch-thumb" />
                    </span>
                    <span className="nt-switch-label">Device</span>
                  </label>
                </div>
                <div className="nt-gate-controls">
                  <label className="nt-switch">
                    <input
                      type="checkbox"
                      checked={exempt === null ? kind.quietHoursExempt : exempt}
                      onChange={(e) =>
                        savePreference.mutate({
                          kind: kind.kind,
                          inAppEnabled: inApp,
                          pushEnabled: push,
                          quietHoursExempt: e.target.checked,
                        })
                      }
                    />
                    <span className="nt-switch-track">
                      <span className="nt-switch-thumb" />
                    </span>
                    <span className="nt-switch-label">Break quiet hours</span>
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
