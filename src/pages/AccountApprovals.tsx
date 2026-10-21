import { useMemo, useState } from "react";
import {
  UserCheck,
  Check,
  X,
  Mail,
  User as UserIcon,
  Clock,
  ShieldCheck,
  KeyRound,
  UserCog,
  Wallet,
  Shield,
} from "lucide-react";
import SubNav from "@/components/layout/SubNav";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  useAccountApprovalRequests,
  useApproveAccount,
  useRejectAccount,
} from "@/hooks/useAccountApprovals";
import { cn, formatDateTime, timeAgo } from "@/lib/utils";
import type { AccountApprovalRequest } from "@/types";

export default function AccountApprovalsPage() {
  const { profile, can, isAppOwner } = useAuth();
  const { data: requests = [], isLoading, isFetching } =
    useAccountApprovalRequests();
  const approve = useApproveAccount();
  const reject = useRejectAccount();
  const [filter, setFilter] = useState<
    "pending" | "approved" | "rejected" | "all"
  >("pending");

  const canApprove = isAppOwner || can("employees.manage");

  const filtered = useMemo(() => {
    if (filter === "all") return requests;
    return requests.filter((r) => r.status === filter);
  }, [requests, filter]);

  const counts = useMemo(
    () => ({
      pending: requests.filter((r) => r.status === "pending").length,
      approved: requests.filter((r) => r.status === "approved").length,
      rejected: requests.filter((r) => r.status === "rejected").length,
      all: requests.length,
    }),
    [requests]
  );

  if (!canApprove) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center">
        <div className="paper-card p-8">
          <UserCheck className="w-8 h-8 mx-auto text-ink-mute" />
          <h2 className="font-display text-xl font-bold mt-3">Owner only</h2>
          <p className="text-sm text-ink-mute mt-1">
            Account approvals are restricted to the shop owner and users with
            employee management permission.
          </p>
        </div>
      </div>
    );
  }

  const onApprove = async (r: AccountApprovalRequest) => {
    try {
      await approve.mutateAsync({
        request: r,
        approver: {
          id: profile?.id || "",
          name: profile?.name || "Owner",
          role: profile?.role,
        },
      });
      toast.success(
        `Approved ${r.employeeName}. They can now sign in and will be asked to set a permanent password.`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Approval failed");
    }
  };

  const onReject = async (r: AccountApprovalRequest) => {
    const notes = prompt("Reason for rejection (optional)") || "";
    try {
      await reject.mutateAsync({
        request: r,
        approver: {
          id: profile?.id || "",
          name: profile?.name || "Owner",
          role: profile?.role,
        },
        notes,
      });
      toast.success("Request rejected");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reject failed");
    }
  };

  return (
    <div className="p-3 md:p-6 space-y-3 md:space-y-4">
      <SubNav
        items={[
          { to: "/employees", label: "Team", icon: UserCog },
          { to: "/payroll-history", label: "Payroll", icon: Wallet },
          { to: "/account-approvals", label: "Approvals", icon: UserCheck },
          { to: "/password-resets", label: "Password Resets", icon: KeyRound },
          { to: "/audit-log", label: "Audit Log", icon: Shield },
        ]}
      />
      <div className="paper-card p-3 md:p-4 flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <UserCheck className="w-5 h-5 text-magenta-reg shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h1 className="font-display text-lg md:text-xl font-bold leading-tight">
              Account approvals
            </h1>
            <p className="text-[11px] md:text-xs text-ink-mute mt-0.5">
              Approve or reject new employees whose accounts are pending activation.
              Approval activates the account; users are forced to set a permanent
              password on their next sign-in.
              {isFetching && (
                <span className="ml-1.5 inline-flex items-center gap-1 text-magenta-reg">
                  <span className="w-1.5 h-1.5 rounded-full bg-magenta-reg animate-pulse" />
                  syncing
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {(["pending", "approved", "rejected", "all"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={cn(
                "chip border px-2.5 h-8 text-[10px] md:text-xs uppercase tracking-widest inline-flex items-center gap-1.5",
                filter === k
                  ? "bg-ink text-paper border-ink"
                  : "border-line hover:border-ink"
              )}
            >
              {k}
              <span
                className={cn(
                  "px-1 rounded num text-[9px]",
                  filter === k ? "bg-white/20" : "bg-ink/10"
                )}
              >
                {counts[k]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="paper-card p-10 text-center text-ink-mute">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="paper-card p-10 text-center">
          <ShieldCheck className="w-8 h-8 mx-auto text-success mb-2" />
          <div className="font-semibold">
            No {filter === "all" ? "" : filter} requests
          </div>
          <p className="text-xs text-ink-mute mt-1">
            New employees appear here as soon as they log in for the first time
            with the temporary password you shared.
          </p>
        </div>
      ) : (
        <>
          {/* MOBILE — stacked cards */}
          <div className="grid grid-cols-1 gap-2 md:hidden">
            {filtered.map((r) => (
              <RequestCard
                key={r.id}
                r={r}
                onApprove={() => onApprove(r)}
                onReject={() => onReject(r)}
                approving={approve.isPending}
                rejecting={reject.isPending}
              />
            ))}
          </div>

          {/* DESKTOP — dense table */}
          <div className="paper-card overflow-hidden hidden md:block">
            <div className="overflow-auto max-h-[70vh] scroll-lined">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-widest text-ink-mute bg-paper/60 sticky top-0">
                    <th className="p-3 pl-5">Employee</th>
                    <th className="p-3">Email</th>
                    <th className="p-3">Role</th>
                    <th className="p-3">Requested</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Handled by</th>
                    <th className="p-3 pr-5"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-t align-top hover:bg-paper/40">
                      <td className="p-3 pl-5 font-semibold">
                        {r.employeeName || "—"}
                      </td>
                      <td className="p-3 text-xs">{r.email}</td>
                      <td className="p-3 text-xs">{r.role || "Staff"}</td>
                      <td className="p-3 text-xs text-ink-mute">
                        <div>{formatDateTime(r.requestedAt)}</div>
                        <div className="text-[10px]">{timeAgo(r.requestedAt)}</div>
                      </td>
                      <td className="p-3">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="p-3 text-xs">
                        {r.approvedByName || "—"}
                        {r.approvedAt && (
                          <div className="text-[10px] text-ink-mute">
                            {formatDateTime(r.approvedAt)}
                          </div>
                        )}
                        {r.notes && (
                          <div className="text-[10px] text-ink-mute italic mt-1">
                            "{r.notes}"
                          </div>
                        )}
                      </td>
                      <td className="p-3 pr-5 text-right">
                        {r.status === "pending" ? (
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => onApprove(r)}
                              disabled={approve.isPending}
                              className="btn btn-primary h-8"
                            >
                              <Check className="w-4 h-4" /> Approve
                            </button>
                            <button
                              onClick={() => onReject(r)}
                              disabled={reject.isPending}
                              className="btn btn-ghost h-8 text-danger"
                            >
                              <X className="w-4 h-4" /> Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-ink-mute text-xs">Closed</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function RequestCard({
  r,
  onApprove,
  onReject,
  approving,
  rejecting,
}: {
  r: AccountApprovalRequest;
  onApprove: () => void;
  onReject: () => void;
  approving: boolean;
  rejecting: boolean;
}) {
  return (
    <div className="paper-card p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <UserIcon className="w-3.5 h-3.5 text-ink-mute shrink-0" />
            <div className="font-semibold truncate">
              {r.employeeName || "Unknown"}
            </div>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-ink-mute min-w-0">
            <Mail className="w-3 h-3 shrink-0" />
            <span className="truncate">{r.email}</span>
          </div>
          {r.role && (
            <div className="mt-0.5 text-[11px] text-ink-mute">Role: {r.role}</div>
          )}
        </div>
        <StatusBadge status={r.status} />
      </div>

      <div className="flex items-center gap-2 text-[11px] text-ink-mute">
        <Clock className="w-3 h-3" />
        <span>{timeAgo(r.requestedAt)}</span>
        <span className="opacity-60">· {formatDateTime(r.requestedAt)}</span>
      </div>

      {r.status !== "pending" && (
        <div className="text-[11px] text-ink-mute border-t pt-1.5">
          <span className="opacity-70">Handled by </span>
          <span className="font-semibold text-ink">{r.approvedByName || "—"}</span>
          {r.approvedAt && (
            <span className="opacity-70"> · {formatDateTime(r.approvedAt)}</span>
          )}
          {r.notes && <div className="mt-1 italic">"{r.notes}"</div>}
        </div>
      )}

      {r.status === "pending" && (
        <div className="grid grid-cols-2 gap-1.5 pt-1">
          <button
            onClick={onApprove}
            disabled={approving}
            className="btn btn-primary h-10"
          >
            <Check className="w-4 h-4" /> Approve
          </button>
          <button
            onClick={onReject}
            disabled={rejecting}
            className="btn btn-outline h-10 text-danger !border-danger/40"
          >
            <X className="w-4 h-4" /> Reject
          </button>
        </div>
      )}
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: "pending" | "approved" | "rejected";
}) {
  const meta = {
    pending: {
      color: "bg-yellow-reg/10 text-yellow-reg border-yellow-reg/30",
      label: "Pending",
    },
    approved: {
      color: "bg-success/10 text-success border-success/30",
      label: "Approved",
    },
    rejected: {
      color: "bg-danger/10 text-danger border-danger/30",
      label: "Rejected",
    },
  }[status];
  return (
    <span
      className={cn(
        "chip border text-[10px] uppercase tracking-widest shrink-0",
        meta.color
      )}
    >
      {meta.label}
    </span>
  );
}
