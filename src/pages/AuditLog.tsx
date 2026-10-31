import { useMemo, useState } from "react";
import { Shield, Search, UserCog, Wallet, UserCheck, KeyRound } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAuditLogs } from "@/hooks/useAudit";
import { formatDateTime } from "@/lib/utils";
import SubNav from "@/components/layout/SubNav";

export default function AuditLogPage() {
  const { can, isAppOwner } = useAuth();
  const { data: logs = [], isLoading } = useAuditLogs(500);
  const [q, setQ] = useState("");

  const canView = isAppOwner || can("audit.view");

  const filtered = useMemo(() => {
    const query = q.toLowerCase();
    if (!query) return logs;
    return logs.filter(
      (l) =>
        (l.actor_name || "").toLowerCase().includes(query) ||
        (l.action || "").toLowerCase().includes(query) ||
        (l.entity || "").toLowerCase().includes(query)
    );
  }, [logs, q]);

  if (!canView) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center">
        <div className="paper-card p-8">
          <Shield className="w-8 h-8 mx-auto text-ink-mute" />
          <h2 className="font-display text-xl font-bold mt-3">Owner only</h2>
          <p className="text-sm text-ink-mute mt-1">
            The audit log is restricted to the shop owner.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-3">
      <SubNav
        items={[
          { to: "/employees", label: "Team", icon: UserCog },
          { to: "/payroll-history", label: "Payroll", icon: Wallet },
          { to: "/account-approvals", label: "Approvals", icon: UserCheck },
          { to: "/password-resets", label: "Password Resets", icon: KeyRound },
          { to: "/audit-log", label: "Audit Log", icon: Shield },
        ]}
      />
      <div className="paper-card p-2.5 md:p-4 flex items-center gap-1.5 md:gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-sm md:text-lg font-bold leading-tight truncate">Owner audit log</h1>
          <p className="hidden md:block text-[10px] md:text-xs text-ink-mute mt-0.5">
            Chronological trail of privileged actions across your shop.
          </p>
        </div>
        <div className="relative flex-1 min-w-0 md:max-w-72">
          <Search className="w-3.5 h-3.5 md:w-4 md:h-4 absolute left-2 md:left-3 top-1/2 -translate-y-1/2 text-ink-mute pointer-events-none" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by actor, action, entity..."
            className="input input-sm pl-7 md:pl-9"
          />
        </div>
      </div>

      {/* Row height reduced ~67% (was ~80px per entry, now ~26px) */}
      <div className="paper-card overflow-hidden">
        <div className="overflow-auto max-h-[75vh] scroll-lined">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-left text-[9px] uppercase tracking-widest text-ink-mute bg-paper/60 sticky top-0">
                <th className="px-2 py-1 pl-3">When</th>
                <th className="px-2 py-1">Actor</th>
                <th className="px-2 py-1">Role</th>
                <th className="px-2 py-1">Action</th>
                <th className="px-2 py-1">Entity</th>
                <th className="px-2 py-1 pr-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-ink-mute text-xs">
                    Loading...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-ink-mute text-xs">
                    No audit entries.
                  </td>
                </tr>
              ) : (
                filtered.map((l) => (
                  <tr key={l.id} className="border-t hover:bg-paper/40 align-middle">
                    <td className="px-2 py-0.5 pl-3 text-[10px] text-ink-mute whitespace-nowrap num">
                      {formatDateTime(l.created_at)}
                    </td>
                    <td className="px-2 py-0.5 font-semibold whitespace-nowrap truncate max-w-[130px]">
                      {l.actor_name}
                    </td>
                    <td className="px-2 py-0.5 text-[9px] uppercase tracking-widest text-ink-mute whitespace-nowrap">
                      {l.actor_role || "—"}
                    </td>
                    <td className="px-2 py-0.5 num whitespace-nowrap">
                      <span className="chip bg-ink/5 text-[9px] px-1.5 py-0">
                        {l.action}
                      </span>
                    </td>
                    <td className="px-2 py-0.5 text-[10px] text-ink-mute whitespace-nowrap truncate max-w-[130px]">
                      {l.entity || "—"}
                      {l.entity_id && (
                        <span className="font-mono ml-1 text-[8px] opacity-70">
                          #{l.entity_id.slice(0, 6)}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-0.5 pr-3 text-[9px] text-ink-mute truncate max-w-[300px]">
                      <span className="font-mono" title={JSON.stringify(l.meta || {})}>
                        {JSON.stringify(l.meta || {}).slice(0, 80)}
                        {JSON.stringify(l.meta || {}).length > 80 ? "…" : ""}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
