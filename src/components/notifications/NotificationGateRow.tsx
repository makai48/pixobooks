import {
  describeGate,
  ROLE_LABELS,
  ROLE_ORDER,
} from "@/lib/notifications/catalog";
import type {
  NotificationKind,
  NotificationKindMeta,
  NotificationRole,
} from "@/lib/notifications/types";

export type GateRowState = {
  minRole: NotificationRole;
  requiredPermission: string | null;
  inAppEnabled: boolean;
  pushEnabled: boolean;
  quietHoursExempt: boolean;
  enabled: boolean;
};

export type GateRecipient = { id: string; name: string };

export type GateRowProps = {
  meta: NotificationKindMeta;
  state: GateRowState;
  recipients: GateRecipient[];
  canEdit: boolean;
  permissionChoices: { key: string; label: string }[];
  onChange: (patch: {
    kind: NotificationKind;
    minRole?: NotificationRole;
    requiredPermission?: string | null;
    inAppEnabled?: boolean;
    pushEnabled?: boolean;
    quietHoursExempt?: boolean;
    enabled?: boolean;
  }) => void;
};

/**
 * One line of the delivery gate: what the notification is, who it reaches
 * and the three switches that control it.
 */
export default function NotificationGateRow({
  meta,
  state,
  recipients,
  canEdit,
  permissionChoices,
  onChange,
}: GateRowProps) {
  return (
    <div className="nt-gate-row">
      <div>
        <div className="nt-gate-lead">
          <div>
            <div className="nt-gate-title">{meta.label}</div>
            <div className="nt-gate-desc">{meta.description}</div>
          </div>
        </div>
        {recipients.length > 0 && (
          <div className="nt-recipients">
            {recipients.slice(0, 8).map((person) => (
              <span className="nt-recipient" key={person.id}>
                <span className="nt-recipient-avatar" aria-hidden="true">
                  {(person.name || "?").trim().charAt(0).toUpperCase()}
                </span>
                {person.name}
              </span>
            ))}
            {recipients.length > 8 && (
              <span className="nt-recipient">+{recipients.length - 8} more</span>
            )}
          </div>
        )}
      </div>

      <div className="nt-gate-controls">
        <label className="nt-switch">
          <input
            type="checkbox"
            checked={state.enabled}
            disabled={!canEdit}
            onChange={(e) => onChange({ kind: meta.kind, enabled: e.target.checked })}
          />
          <span className="nt-switch-track">
            <span className="nt-switch-thumb" />
          </span>
          <span className="nt-switch-label">Raise it</span>
        </label>

        <select
          className="nt-select"
          value={state.minRole}
          disabled={!canEdit}
          aria-label={`Minimum role for ${meta.label}`}
          onChange={(e) =>
            onChange({ kind: meta.kind, minRole: e.target.value as NotificationRole })
          }
        >
          {ROLE_ORDER.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]} and above
            </option>
          ))}
        </select>

        <select
          className="nt-select"
          value={state.requiredPermission ?? ""}
          disabled={!canEdit}
          aria-label={`Permission that unlocks ${meta.label}`}
          onChange={(e) =>
            onChange({ kind: meta.kind, requiredPermission: e.target.value || null })
          }
        >
          <option value="">No extra permission</option>
          {permissionChoices.map((choice) => (
            <option key={choice.key} value={choice.key}>
              {choice.label}
            </option>
          ))}
        </select>
      </div>

      <div className="nt-gate-controls">
        <label className="nt-switch">
          <input
            type="checkbox"
            checked={state.inAppEnabled}
            disabled={!canEdit}
            onChange={(e) =>
              onChange({ kind: meta.kind, inAppEnabled: e.target.checked })
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
            checked={state.pushEnabled}
            disabled={!canEdit}
            onChange={(e) =>
              onChange({ kind: meta.kind, pushEnabled: e.target.checked })
            }
          />
          <span className="nt-switch-track">
            <span className="nt-switch-thumb" />
          </span>
          <span className="nt-switch-label">Device</span>
        </label>

        <label className="nt-switch">
          <input
            type="checkbox"
            checked={state.quietHoursExempt}
            disabled={!canEdit}
            onChange={(e) =>
              onChange({ kind: meta.kind, quietHoursExempt: e.target.checked })
            }
          />
          <span className="nt-switch-track">
            <span className="nt-switch-thumb" />
          </span>
          <span className="nt-switch-label">Ignore quiet hours</span>
        </label>

        <span className="nt-gate-desc">
          {describeGate({
            minRole: state.minRole,
            requiredPermission: state.requiredPermission,
          })}
        </span>
      </div>
    </div>
  );
}
