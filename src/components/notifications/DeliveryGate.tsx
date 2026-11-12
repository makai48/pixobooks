import { useMemo } from "react";
import { ShieldCheck } from "lucide-react";
import {
  useNotificationKinds,
  useNotificationPolicies,
  useUpdateNotificationPolicy,
} from "@/hooks/useNotifications";
import { useEmployees } from "@/hooks/useEmployees";
import { useAuth } from "@/hooks/useAuth";
import { gateAllows, resolveRole } from "@/lib/notifications/catalog";
import NotificationGateRow from "./NotificationGateRow";
import type { NotificationKind, NotificationPolicy } from "@/lib/notifications/types";

/**
 * The permission keys that may unlock a notification.
 *
 * Only keys that already exist in the app's permission model are offered, so
 * a gate can never reference a right nobody can hold.
 */
export const PERMISSION_CHOICES: { key: string; label: string }[] = [
  { key: "settings.manage", label: "Manage all settings" },
  { key: "inventory.view", label: "View inventory" },
  { key: "inventory.edit", label: "Edit inventory" },
  { key: "inventory.adjust", label: "Adjust stock" },
  { key: "po.view", label: "View purchase orders" },
  { key: "po.manage", label: "Manage purchase orders" },
  { key: "po.receive", label: "Receive purchase orders" },
  { key: "stats.view", label: "View statistics" },
  { key: "customers.view", label: "View customers" },
  { key: "customers.manage", label: "Manage customers" },
  { key: "quotes.view", label: "View quotes" },
  { key: "finance.view", label: "View finance" },
  { key: "finance.manage", label: "Manage finance" },
  { key: "finance.cashbook.view", label: "View the cash book" },
  { key: "expenses.manage", label: "Manage expenses" },
  { key: "employees.manage", label: "Manage the team" },
  { key: "employees.attendance", label: "View attendance" },
  { key: "audit.view", label: "View the audit log" },
];

type Props = {
  /** Read-only mode for staff: the gate is shown, never edited. */
  readOnly?: boolean;
};

export default function DeliveryGate({ readOnly = false }: Props) {
  const { data: kinds } = useNotificationKinds();
  const { data: policies } = useNotificationPolicies();
  const update = useUpdateNotificationPolicy();
  const { data: employees } = useEmployees();
  const { isAppAdmin, isAdmin, can } = useAuth();

  const canEdit = !readOnly && (isAppAdmin || isAdmin || can("settings.manage"));

  const policyFor = useMemo(() => {
    const map = new Map<NotificationKind, NotificationPolicy>();
    (policies ?? []).forEach((p) => map.set(p.kind, p));
    return map;
  }, [policies]);

  const team = useMemo(
    () => (employees ?? []).filter((e) => e.active !== false),
    [employees],
  );

  if (!kinds || kinds.length === 0) {
    return (
      <div className="nt-panel">
        <div className="nt-empty">
          <span className="nt-empty-glyph" aria-hidden="true">
            <ShieldCheck strokeWidth={1.6} />
          </span>
          <div className="nt-empty-title">Delivery gate unavailable</div>
          <p className="nt-empty-text">
            The notification migration has not been applied to this workspace
            yet, so there is no gate to configure.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="nt-panel">
      <div className="nt-panel-head">
        <div>
          <div className="nt-panel-title">Who receives what</div>
          <p className="nt-panel-sub">
            Every notification is filtered through this gate before it is
            raised. A person receives a notification when their role reaches
            the minimum below, or when they hold the listed permission.
          </p>
        </div>
      </div>

      <div className="nt-gate">
        {kinds.map((kind) => {
          const policy = policyFor.get(kind.kind);
          const state = {
            minRole: policy?.minRole ?? kind.minRole,
            requiredPermission:
              policy?.requiredPermission ?? kind.requiredPermission ?? null,
            inAppEnabled: policy?.inAppEnabled ?? kind.allowInApp,
            pushEnabled: policy?.pushEnabled ?? kind.allowPush,
            quietHoursExempt:
              policy?.quietHoursExempt ?? kind.quietHoursExempt,
            enabled: policy?.enabled ?? kind.enabled,
          };

          const recipients = team
            .filter((employee) =>
              gateAllows({
                policy: {
                  minRole: state.minRole,
                  requiredPermission: state.requiredPermission,
                  enabled: state.enabled,
                },
                role: resolveRole(null, employee.role),
                permissions: employee.permissions ?? [],
              }),
            )
            .map((employee) => ({ id: employee.id, name: employee.name }));

          return (
            <NotificationGateRow
              key={kind.kind}
              meta={kind}
              state={state}
              recipients={recipients}
              canEdit={canEdit}
              permissionChoices={PERMISSION_CHOICES}
              onChange={(patch) => update.mutate(patch)}
            />
          );
        })}
      </div>
    </div>
  );
}
