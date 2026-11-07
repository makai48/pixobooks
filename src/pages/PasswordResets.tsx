import { useMemo, useState } from "react";
import {
  ShieldQuestion,
  Check,
  X,
  Copy,
  KeyRound,
  Mail,
  User as UserIcon,
  Clock,
  ShieldCheck,
  UserCheck,
  UserCog,
  Wallet,
  Shield,
  MessageCircle,
  Link as LinkIcon,
} from "lucide-react";
import SubNav from "@/components/layout/SubNav";
import GlassSelect from "@/components/ui/GlassSelect";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  usePasswordResetRequests,
  useApprovePasswordReset,
  useRejectPasswordReset,
  useClearStoredTempPassword,
  type PasswordResetApprovalResult,
} from "@/hooks/usePasswordResets";
import { useShopSettings } from "@/hooks/useShopSettings";
import { cn, formatDateTime, timeAgo } from "@/lib/utils";
import type { PasswordResetRequest } from "@/types";

const TEMP_PASSWORD_HOUR_PRESETS = [12, 24, 48, 72, 168];

export default function PasswordResetsPage() {
  const { profile, can, isAppOwner } = useAuth();
  const { data: requests = [], isLoading, isFetching } =
    usePasswordResetRequests();
  const { data: settings } = useShopSettings();
  const approve = useApprovePasswordReset();
  const reject = useRejectPasswordReset();
  const clearTemp = useClearStoredTempPassword();
  const [filter, setFilter] = useState<
    "pending" | "approved" | "rejected" | "all"
  >("pending");
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [expirationHours, setExpirationHours] = useState<number>(24);
  const [result, setResult] = useState<
    (PasswordResetApprovalResult & { requestId: string }) | null
  >(null);

  const canApprove = isAppOwner || can("password.approve");

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
          <ShieldQuestion className="w-8 h-8 mx-auto text-ink-mute" />
          <h2 className="font-display text-xl font-bold mt-3">Admin only</h2>
          <p className="text-sm text-ink-mute mt-1">
            Password reset approvals are restricted to the shop admin.
          </p>
        </div>
      </div>
    );
  }

  const onApprove = async (req: PasswordResetRequest) => {
    setApprovingId(req.id);
    try {
      const res = await approve.mutateAsync({
        request: req,
        approver: {
          id: profile?.id || "",
          name: profile?.name || "Admin",
          role: profile?.role,
        },
        expirationHours,
      });
      // Show the temp password in a secure result modal — the admin
      // shares it via email / WhatsApp / manual delivery to the employee.
      setResult(res);
      toast.success(`Approved — ${req.employeeName || req.email} unlocked.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setApprovingId(null);
    }
  };

  const onReject = async (req: PasswordResetRequest) => {
    const notes = prompt("Reason for rejection (optional)") || "";
    try {
      await reject.mutateAsync({
        request: req,
        approver: {
          id: profile?.id || "",
          name: profile?.name || "Admin",
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
    <div className="p-2.5 md:p-6 space-y-2 md:space-y-4">
      <SubNav
        items={[
          { to: "/employees", label: "Team", icon: UserCog },
          { to: "/payroll-history", label: "Payroll", icon: Wallet },
          { to: "/account-approvals", label: "Approvals", icon: UserCheck },
          { to: "/password-resets", label: "Password Resets", icon: KeyRound },
          { to: "/audit-log", label: "Audit Log", icon: Shield },
        ]}
      />

      {/* Header + filter chips (responsive) */}
      <div className="paper-card p-2.5 md:p-4 flex flex-wrap items-center gap-x-1.5 gap-y-1.5 md:gap-3">
        <div className="flex items-center gap-1.5 md:gap-2 flex-1 min-w-[140px]">
          <ShieldQuestion className="w-4 h-4 md:w-5 md:h-5 text-magenta-reg shrink-0" />
          <div className="min-w-0">
            <h1 className="font-display text-sm md:text-xl font-bold leading-tight truncate">
              Password reset requests
            </h1>
            <p className="hidden md:block text-[11px] md:text-xs text-ink-mute mt-0.5">
              Approvals reset the login and unlock the account. The temp password shows once — share it directly.
              {isFetching && (
                <span className="ml-1.5 inline-flex items-center gap-1 text-magenta-reg">
                  <span className="w-1.5 h-1.5 rounded-full bg-magenta-reg animate-pulse" />
                  syncing
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <label htmlFor="pr-temp-expires" className="label text-[9px] md:text-[10px] whitespace-nowrap">Temp expires</label>
          <GlassSelect
            id="pr-temp-expires"
            value={String(expirationHours)}
            onChange={(v) => setExpirationHours(Number(v))}
            ariaLabel="Temp expires"
            options={TEMP_PASSWORD_HOUR_PRESETS.map((h) => ({
              value: String(h),
              label: h < 48 ? `${h}h` : `${Math.round(h / 24)}d`,
            }))}
            className="input input-sm select-glass max-md:px-1.5"
          />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {(["pending", "approved", "rejected", "all"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={cn(
                  "chip border px-2 h-6 md:h-8 text-[9px] md:text-xs uppercase tracking-widest inline-flex items-center gap-1 shrink-0 transition",
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

      {/* Empty / loading state */}
      {isLoading ? (
        <div className="paper-card p-10 text-center text-ink-mute">
          Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="paper-card p-10 text-center">
          <ShieldCheck className="w-8 h-8 mx-auto text-success mb-2" />
          <div className="font-semibold">
            No {filter === "all" ? "" : filter} requests
          </div>
          <p className="text-xs text-ink-mute mt-1">
            Reset requests submitted from the Login screen will appear here
            within seconds.
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
                approving={approvingId === r.id}
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
                    <th className="p-3">Requested</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Handled by</th>
                    <th className="p-3 pr-5"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr
                      key={r.id}
                      className="border-t align-top hover:bg-paper/40"
                    >
                      <td className="p-3 pl-5 font-semibold">
                        {r.employeeName || "—"}
                      </td>
                      <td className="p-3 text-xs break-all">{r.email}</td>
                      <td className="p-3 text-xs text-ink-mute whitespace-nowrap">
                        <div>{formatDateTime(r.requestedAt)}</div>
                        <div className="text-[10px]">{timeAgo(r.requestedAt)}</div>
                      </td>
                      <td className="p-3">
                        <StatusBadge status={r.status} />
                        {r.status === "approved" && r.tempPasswordExpiresAt && (
                          <div className="mt-1 text-[10px] text-ink-mute">
                            Temp expires{" "}
                            {formatDateTime(r.tempPasswordExpiresAt)}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-xs">
                        {r.approvedByName || "—"}
                        {r.approvedAt && (
                          <div className="text-[10px] text-ink-mute">
                            {formatDateTime(r.approvedAt)}
                          </div>
                        )}
                      </td>
                      <td className="p-3 pr-5 text-right">
                        {r.status === "pending" ? (
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => onApprove(r)}
                              disabled={approvingId === r.id}
                              className="btn btn-primary h-8"
                            >
                              <Check className="w-4 h-4" />
                              {approvingId === r.id
                                ? "Resetting…"
                                : "Approve"}
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

      {result && (
        <PasswordResetResultModal
          result={result}
          shopName={settings?.shopName || "the shop"}
          onClose={() => {
            // Remove the stored temp password from the DB row so it is
            // NOT permanently persisted (per the security requirement).
            void clearTemp.mutateAsync(result.requestId).catch(() => {});
            setResult(null);
          }}
        />
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
  r: PasswordResetRequest;
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
          <span className="font-semibold text-ink">
            {r.approvedByName || "—"}
          </span>
          {r.approvedAt && (
            <span className="opacity-70"> · {formatDateTime(r.approvedAt)}</span>
          )}
          {r.tempPasswordExpiresAt && r.status === "approved" && (
            <div className="mt-0.5">
              Temp expires {formatDateTime(r.tempPasswordExpiresAt)}
            </div>
          )}
          {r.notes && (
            <div className="mt-1 italic">"{r.notes}"</div>
          )}
        </div>
      )}

      {r.status === "pending" && (
        <div className="grid grid-cols-2 gap-1.5 pt-1">
          <button
            onClick={onApprove}
            disabled={approving}
            className="btn btn-primary h-10"
          >
            <Check className="w-4 h-4" />
            {approving ? "Resetting…" : "Approve"}
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

/**
 * Secure result modal — mirrors the invite-result flow so the admin
 * gets the same professional presentation with copy / mail / WhatsApp
 * delivery shortcuts. The temp password is cleared from the DB row
 * when this modal is dismissed.
 */
function PasswordResetResultModal({
  result,
  shopName,
  onClose,
}: {
  result: PasswordResetApprovalResult;
  shopName: string;
  onClose: () => void;
}) {
  const loginUrl =
    typeof window !== "undefined" ? window.location.origin + "/login" : "";

  const message = `Hello ${result.employeeName},

Your password on ${shopName} (PixoBooks) has been reset.

Login email:        ${result.email}
Temporary password: ${result.tempPassword}
Expires:            ${new Date(result.expiresAt).toLocaleString()}
Login link:         ${loginUrl}

Please sign in with the temporary password above. You will be asked to set
a new permanent password immediately after signing in.

— ${shopName}`;

  const copy = (label: string, value: string) =>
    navigator.clipboard
      .writeText(value)
      .then(() => toast.success(`${label} copied`));

  return (
    <div className="fixed inset-0 z-50 bg-ink/50 flex items-end md:items-center justify-center p-0 md:p-4 animate-fade-in">
      <div className="paper-card w-full max-w-md overflow-hidden max-h-[95dvh] flex flex-col rounded-t-2xl md:rounded-xl">
        <div className="p-4 md:p-5 border-b flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-widest text-ink-mute">
              Password reset approved
            </div>
            <h2 className="font-display text-lg md:text-xl font-bold truncate">
              Share these credentials
            </h2>
          </div>
          <button
            onClick={onClose}
            className="btn btn-ghost h-9 w-9 p-0 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto scroll-lined p-5 space-y-4">
          <div className="w-14 h-14 rounded-full bg-success/10 mx-auto flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-success" />
          </div>
          <div className="text-center">
            <h3 className="font-display text-lg font-bold">
              Password reset & account unlocked
            </h3>
            <p className="text-xs text-ink-mute mt-1">
              A new temporary password has been set on this account. Share it
              with{" "}
              <span className="font-semibold text-ink">
                {result.employeeName}
              </span>{" "}
              using any channel below. The employee will be forced to set a
              permanent password on their next sign-in.
            </p>
          </div>

          <div className="rounded-lg border-2 border-magenta-reg/30 bg-magenta-reg/5 p-3 space-y-2">
            <ResultRow
              icon={<Mail className="w-3.5 h-3.5" />}
              label="Login email"
              value={result.email}
              onCopy={() => copy("Email", result.email)}
            />
            <ResultRow
              icon={<KeyRound className="w-3.5 h-3.5" />}
              label="Temporary password"
              value={result.tempPassword}
              mono
              highlight
              onCopy={() => copy("Password", result.tempPassword)}
            />
            <ResultRow
              icon={<Clock className="w-3.5 h-3.5" />}
              label="Expires"
              value={new Date(result.expiresAt).toLocaleString()}
            />
            <ResultRow
              icon={<LinkIcon className="w-3.5 h-3.5" />}
              label="Login link"
              value={loginUrl}
              mono
              onCopy={() => copy("Link", loginUrl)}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="label">Ready-to-send message</span>
              <button
                onClick={() => copy("Message", message)}
                className="btn btn-outline h-7 text-[11px]"
              >
                <Copy className="w-3 h-3" /> Copy message
              </button>
            </div>
            <textarea
              readOnly
              value={message}
              className="input h-32 text-xs font-mono leading-relaxed"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <a
              href={`mailto:${encodeURIComponent(
                result.email
              )}?subject=${encodeURIComponent(
                `Your ${shopName} password reset`
              )}&body=${encodeURIComponent(message)}`}
              className="btn btn-primary h-10"
            >
              <Mail className="w-4 h-4" /> Email to employee
            </a>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(message)}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-outline h-10"
            >
              <MessageCircle className="w-4 h-4" /> Send via WhatsApp
            </a>
          </div>

          <p className="text-[10px] text-ink-mute text-center border-t pt-2">
            The temporary password is displayed only here and will be cleared
            from the database when you close this dialog. Never share it with
            anyone other than {result.employeeName}.
          </p>
        </div>

        <div className="p-4 border-t shrink-0 flex justify-end">
          <button onClick={onClose} className="btn btn-primary">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function ResultRow({
  icon,
  label,
  value,
  mono,
  onCopy,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
  onCopy?: () => void;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="text-ink-mute pt-0.5">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[9px] uppercase tracking-widest text-ink-mute">
          {label}
        </div>
        <div
          className={cn(
            "mt-0.5 text-sm break-all",
            mono && "font-mono",
            highlight && "font-bold text-magenta-reg text-base"
          )}
        >
          {value}
        </div>
      </div>
      {onCopy && (
        <button
          onClick={onCopy}
          className="btn btn-ghost h-7 w-7 p-0 shrink-0"
          title="Copy"
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
