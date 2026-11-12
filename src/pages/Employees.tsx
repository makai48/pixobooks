import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  UserCog,
  Shield,
  Circle,
  CheckCircle2,
  Sparkles,
  Wallet,
  CalendarDays,
  User as UserIcon,
  Upload,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Save,
  UserPlus,
  X,
  Mail,
  Send,
  KeyRound,
  Copy,
  Clock,
  Link as LinkIcon,
  MessageCircle,
  MessageSquare,
  UserCheck,
  Clock3,
  Home,
  Contact2,
  History,
  RefreshCw,
  Eye,
  Images,
} from "lucide-react";
import {
  useEmployees,
  useUpdateEmployee,
  useSetPermissions,
  useInviteEmployee,
  useDeleteEmployee,
  type InviteEmployeeResult,
  type InviteDelivery,
} from "@/hooks/useEmployees";
import { useAuth } from "@/hooks/useAuth";
import { useShopSettings, useUpdateShopSettings } from "@/hooks/useShopSettings";
import { supabase } from "@/lib/supabase";
import { currentBusinessId } from "@/lib/tenant";
import {
  evaluateTxnAllowance,
  postTxnAllowanceExpense,
  txnPeriodInfo,
} from "@/hooks/useStaffAllowances";
import { TXN_ALLOWANCE_MARKER } from "@/types";
import {
  useAttendance,
  useUpsertAttendance,
  useEmployeeTransactionDays,
  useAutoValidateAttendance,
  attendanceStats,
  ATTENDANCE_AUTO_MIN_TRANSACTIONS,
} from "@/hooks/useAttendance";
import {
  ALL_PERMISSIONS,
  ALL_PERMISSION_KEYS,
  DEFAULT_STAFF_PERMISSIONS,
  ATTENDANCE_META,
  CURRENCIES,
  isShopAdmin,
  DEFAULT_TEMP_PASSWORD_HOURS,
  TEMP_PASSWORD_HOUR_PRESETS,
  type Employee,
  type Permission,
  type Allowance,
  type EmployeeSalary,
  type AttendanceStatus,
  type ApprovalStatus,
} from "@/types";
import { cn, formatCurrency, formatDate, formatDateTime, getMonthMatrix, localISODate } from "@/lib/utils";
import { deriveDisplayName, employeeInitials } from "@/lib/employeeName";
import { processImageFile } from "@/lib/imageUpload";
import PhoneInput from "@/components/common/PhoneInput";
import GlassSelect from "@/components/ui/GlassSelect";
import AmountInput from "@/components/ui/AmountInput";
import GlassDatePicker from "@/components/ui/GlassDatePicker";
import MoneyText from "@/components/ui/MoneyText";
import SubNav from "@/components/layout/SubNav";
import SharedField from "@/components/common/Field";
import { canAddUser, getPlanLimits } from "@/lib/billing";
import { upgradeToast } from "@/components/billing/UpgradePrompt";
import type { LucideIcon } from "lucide-react";
import "./employees.css";

type TabKey = "profile" | "payroll" | "attendance" | "permissions";

export default function Employees() {
  const { profile, can, isAppAdmin } = useAuth();
  const { data: employees = [], isLoading } = useEmployees();
  const { data: settings } = useShopSettings();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = employees.find((e) => e.id === selectedId) || employees[0];
  const [mobileRosterOpen, setMobileRosterOpen] = useState(true);
  const [tab, setTab] = useState<TabKey>("profile");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitesOpen, setInvitesOpen] = useState(false);
  const [avatarsOpen, setAvatarsOpen] = useState(false);
  const del = useDeleteEmployee();

  const canInvite = can("employees.manage") || can("users.invite");
  const canDelete =
    can("employees.delete") || can("users.delete") || isAppAdmin;
  /** Admins/managers may review every team photo; everyone else only ever
   *  sees the photos inside the roster they already have access to. */
  const canSeeAllAvatars = can("employees.manage");
  /** A team member may set their own photo with the `users.avatar` right;
   *  admins keep it through `can()`. */
  const canUploadOwnPhoto =
    !!selected && selected.id === profile?.id && can("users.avatar");
  /** The Profile tab owns the photo control for anyone who can open it. The
   *  header shortcut stays only for staff who have no Profile tab at all. */
  const canOpenProfileTab =
    can("employees.manage") || can("users.permissions");
  const showHeaderPhoto = canUploadOwnPhoto && !canOpenProfileTab;

  // Imported staff cleanup (Report cashier duplicates): profiles that arrived
  // via file import carry no invite trail (`invitedAt`/`invitedBy` are only
  // set by the invite flow). The admin account, the current user and invited
  // employees are never candidates.
  const importedStaff = useMemo(
    () =>
      employees.filter(
        (e) =>
          !e.invitedAt &&
          !e.invitedBy &&
          e.id !== profile?.id &&
          e.role.trim().toLowerCase() !== "admin" &&
          !isShopAdmin(e.email, e.role)
      ),
    [employees, profile?.id]
  );
  const [cleaning, setCleaning] = useState(false);

  const cleanImported = async () => {
    if (importedStaff.length === 0 || cleaning) return;
    const names = importedStaff.map((e) => `• ${e.name} (${e.role})`).join("\n");
    if (
      !confirm(
        `Permanently remove ${importedStaff.length} imported profile(s)?\n\n${names}\n\nThe shop admin and all invited employees are kept. Historical sales keep their recorded cashier names.`
      )
    )
      return;
    setCleaning(true);
    let ok = 0;
    const failed: string[] = [];
    for (const e of importedStaff) {
      try {
        await del.mutateAsync({
          id: e.id,
          name: e.name,
          actor: profile
            ? { id: profile.id, name: profile.name, role: profile.role }
            : undefined,
        });
        ok++;
      } catch {
        failed.push(e.name);
      }
    }
    setCleaning(false);
    if (ok > 0) toast.success(`Removed ${ok} imported profile(s) — admin and invited staff kept`);
    if (failed.length > 0) toast.error(`Could not remove: ${failed.join(", ")}`);
  };

  // Transaction-allowance policy queue (Item 7): awards auto-considered
  // when an employee hits the period transaction target wait here when the
  // policy requires approval.
  const txnPolicy = settings?.transactionAllowancePolicy;
  const txnPending = useMemo(
    () => settings?.pendingTxnAllowances || [],
    [settings?.pendingTxnAllowances]
  );
  const canApproveTxn =
    txnPolicy?.approverRole === "accountant"
      ? can("finance.manage") || can("employees.manage")
      : can("employees.manage");
  const canViewTxn =
    can("employees.payroll") || can("employees.manage");
  const [evaluatingTxn, setEvaluatingTxn] = useState(false);
  const updateSettings = useUpdateShopSettings();

  const approveTxnAward = async (award: {
    key: string;
    employeeId: string;
    employeeName: string;
    periodLabel: string;
    periodKey: string;
    count: number;
    amount: number;
    allowanceName: string;
  }) => {
    try {
      await postTxnAllowanceExpense({
        employeeId: award.employeeId,
        employeeName: award.employeeName,
        periodLabel: award.periodLabel,
        count: award.count,
        amount: award.amount,
        allowanceName: award.allowanceName,
        marker: `${TXN_ALLOWANCE_MARKER}:${award.employeeId}:${award.periodKey}:${award.allowanceName}`,
        actor: profile ? { id: profile.id, name: profile.name } : undefined,
      });
      await updateSettings.mutateAsync({
        pendingTxnAllowances: txnPending.filter((p) => p.key !== award.key),
      });
      toast.success(`Allowance posted for ${award.employeeName}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Approve failed");
    }
  };

  const dismissTxnAward = async (award: { key: string }) => {
    if (!txnPolicy) return;
    try {
      await updateSettings.mutateAsync({
        pendingTxnAllowances: txnPending.filter((p) => p.key !== award.key),
        transactionAllowancePolicy: {
          ...txnPolicy,
          dismissed: [...txnPolicy.dismissed, award.key],
        },
      });
      toast.success("Dismissed — will not be suggested again for this period");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Dismiss failed");
    }
  };

  const evaluateTxnNow = async () => {
    if (!txnPolicy?.enabled) return toast.error("Policy is disabled in Settings");
    if (evaluatingTxn) return;
    setEvaluatingTxn(true);
    try {
      const info = txnPeriodInfo(txnPolicy.period);
      const bid = currentBusinessId();
      let q = supabase
        .from("sales")
        .select("cashier_id")
        .gte("created_at", `${info.startISO}T00:00:00`)
        .lt("created_at", `${info.endISO}T00:00:00`);
      if (bid) q = q.eq("business_id", bid);
      const { data, error } = await q;
      if (error) throw error;
      const counts = new Map<string, number>();
      for (const r of (data || []) as { cashier_id: string | null }[]) {
        if (r.cashier_id) counts.set(r.cashier_id, (counts.get(r.cashier_id) || 0) + 1);
      }
      let fresh = txnPending;
      let created = 0;
      let queued = 0;
      for (const e of employees.filter((x) => x.active !== false)) {
        const count = counts.get(e.id) || 0;
        if (count < txnPolicy.threshold) continue;
        const outcome = await evaluateTxnAllowance({
          employee: e,
          policy: txnPolicy,
          count,
          period: txnPolicy.period,
          periodKey: info.key,
          periodLabel: info.label,
          actor: profile ? { id: profile.id, name: profile.name } : undefined,
          currentPending: fresh,
          persistPending: async (next) => {
            fresh = next;
          },
        });
        if (outcome.status === "created") created++;
        if (outcome.status === "pending") queued++;
      }
      if (fresh !== txnPending) {
        await updateSettings.mutateAsync({ pendingTxnAllowances: fresh });
      }
      toast.success(
        `Evaluated ${info.label}: ${created} posted, ${queued} awaiting approval`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Evaluation failed");
    } finally {
      setEvaluatingTxn(false);
    }
  };

  const handleDelete = (e: Employee) => {
    if (isShopAdmin(e.email, e.role)) {
      return toast.error("The shop admin account cannot be deleted");
    }
    if (e.id === profile?.id) {
      return toast.error("You can't delete your own account");
    }
    if (
      !confirm(
        `Permanently delete "${e.name}"?\n\nThey will lose access immediately and be removed from the app entirely.`
      )
    )
      return;
    del.mutate(
      {
        id: e.id,
        name: e.name,
        actor: profile
          ? { id: profile.id, name: profile.name, role: profile.role }
          : undefined,
      },
      {
        onSuccess: () => {
          toast.success(`${e.name} deleted`);
          setSelectedId(null);
          setMobileRosterOpen(true);
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Delete failed"),
      }
    );
  };

  return (
    <div className="team-page p-2.5 md:p-6 flex min-h-full flex-col gap-2 md:gap-4">
      <SubNav
        items={[
          { to: "/employees", label: "Team", icon: UserCog },
          { to: "/payroll-history", label: "Payroll", icon: Wallet },
          { to: "/account-approvals", label: "Approvals", icon: UserCheck },
          { to: "/password-resets", label: "Password Resets", icon: KeyRound },
          { to: "/audit-log", label: "Audit Log", icon: Shield },
        ]}
      />
      {txnPolicy?.enabled && canViewTxn && (
        <div className="paper-card p-2.5 md:p-3">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 md:gap-3">
            <div className="flex-1 min-w-[160px] text-[9px] md:text-[11px] text-ink-mute leading-snug">
              <span className="font-semibold text-ink">Transaction allowance</span>
              <span className="hidden lg:inline">
                {" · "}
                {txnPolicy.threshold} txns /{" "}
                {txnPolicy.period === "daily"
                  ? "day"
                  : txnPolicy.period === "weekly"
                  ? "week"
                  : "month"}{" "}
                → {txnPolicy.allowanceName} (
                {txnPolicy.amountType === "percentage"
                  ? `${txnPolicy.amount}% of base`
                  : formatCurrency(txnPolicy.amount, settings?.currency)}
                ){txnPolicy.requireApproval ? ` · awaiting ${txnPolicy.approverRole === "accountant" ? "accounting" : "manager"}` : " · auto-post"}
              </span>
            </div>
              <button
                onClick={evaluateTxnNow}
                disabled={evaluatingTxn}
                className="btn btn-outline btn-sm shrink-0 max-md:w-7 max-md:px-0"
              title="Count this period's transactions for every active employee now"
            >
              <RefreshCw className="w-3.5 h-3.5 md:w-4 md:h-4" />
              <span className="hidden sm:inline">{evaluatingTxn ? "Checking..." : "Evaluate now"}</span>
            </button>
          </div>
          {txnPending.length > 0 && (
            <div className="mt-1.5 md:mt-2 divide-y border-t">
              {txnPending.map((p) => (
                <div key={p.key} className="flex min-h-[34px] items-center gap-1.5 py-1 md:gap-3 md:py-1.5 text-[10px] md:text-xs">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">
                      {p.employeeName}
                      <span className="font-normal text-ink-mute"> · {p.periodLabel} · {p.count} txns</span>
                    </div>
                    <div className="text-[8px] md:text-[9px] text-ink-mute uppercase tracking-wide">
                      {p.allowanceName}
                    </div>
                  </div>
                  <span className="num font-bold shrink-0">
                    <MoneyText value={formatCurrency(p.amount, settings?.currency)} />
                  </span>
                  {canApproveTxn ? (
                    <>
                      <button
                        onClick={() => approveTxnAward(p)}
                        className="btn btn-primary btn-sm shrink-0"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                        <span className="hidden sm:inline">Approve</span>
                      </button>
                      <button
                        onClick={() => dismissTxnAward(p)}
                        className="btn btn-ghost btn-sm shrink-0 text-danger"
                        title="Dismiss — will not be suggested again for this period"
                      >
                        <X className="w-3.5 h-3.5 md:w-4 md:h-4" />
                      </button>
                    </>
                  ) : (
                    <span className="chip bg-yellow-reg/10 text-yellow-reg border border-yellow-reg/30 text-[9px] md:text-[10px] shrink-0">
                      Awaiting {txnPolicy.approverRole === "accountant" ? "accounting" : "manager"}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-2 md:gap-4 flex-1 min-h-0">
       <div
         className={cn(
           "paper-card overflow-hidden flex flex-col",
           mobileRosterOpen ? "flex" : "hidden lg:flex"
         )}
       >
        <div className="p-2.5 md:p-3 border-b flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[7px] md:text-[11px] uppercase tracking-wide md:tracking-widest text-ink-mute">Team members</div>
            <h2 className="font-display text-sm md:text-lg font-bold">All employees</h2>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {canSeeAllAvatars && (
              <button
                onClick={() => setAvatarsOpen(true)}
                className="btn btn-outline btn-sm max-md:w-7 max-md:px-0"
                title="See every team photo"
              >
                <Images className="w-3.5 h-3.5 md:w-4 md:h-4" />
                <span className="hidden sm:inline">Photos</span>
              </button>
            )}
            <button
              onClick={() => setInvitesOpen(true)}
                className="btn btn-outline btn-sm max-md:w-7 max-md:px-0"
              title="Sent invites — status, resend and revoke"
            >
              <Eye className="w-3.5 h-3.5 md:w-4 md:h-4" />
                <span className="hidden sm:inline">Invites</span>
            </button>
            {canDelete && importedStaff.length > 0 && (
              <button
                onClick={cleanImported}
                disabled={cleaning}
                className="btn btn-outline btn-sm max-md:w-7 max-md:px-0 text-danger border-danger/40"
                title="Remove profiles that arrived via file import (no invite trail). Admin and invited employees are kept."
              >
                <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                  <span className="hidden sm:inline">
                  {cleaning ? "Cleaning..." : `Clean imported (${importedStaff.length})`}
                </span>
              </button>
            )}
            {canInvite && (
              <button
                onClick={() => {
                  if (!canAddUser(employees.length, settings)) {
                    upgradeToast(`More than ${getPlanLimits(settings).users} team members`);
                    return;
                  }
                  setInviteOpen(true);
                }}
                className="btn btn-primary btn-sm max-md:w-7 max-md:px-0"
              >
                <UserPlus className="w-3.5 h-3.5 md:w-4 md:h-4" />
                 <span className="hidden sm:inline">Add</span>
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-auto max-h-[44vh] lg:max-h-none scroll-lined">
          {isLoading ? (
            <div className="p-4 md:p-6 text-ink-mute text-xs md:text-sm">Loading...</div>
          ) : employees.length === 0 ? (
            <div className="p-4 md:p-6 text-ink-mute text-xs md:text-sm text-center">No employees yet.</div>
          ) : (
            employees.map((e) => (
              <div
                key={e.id}
                className={cn(
                  "w-full h-[46px] md:h-[62px] px-2 md:px-3 border-b flex items-center gap-1.5 md:gap-2 transition",
                  selected?.id === e.id ? "bg-paper" : "hover:bg-paper/50"
                )}
              >
             <button
                   onClick={() => {
                     setSelectedId(e.id);
                     setMobileRosterOpen(false);
                   }}
                  className="flex items-center gap-2 md:gap-3 flex-1 min-w-0 text-left"
                >
                    <div className="w-7 h-7 md:w-9 md:h-9 rounded-full bg-magenta-reg/10 text-magenta-reg font-bold text-[10px] md:text-sm flex items-center justify-center shrink-0 overflow-hidden">
                    {e.avatarUrl ? (
                      <img src={e.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      employeeInitials(e.fullName || e.name)
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate flex items-center gap-1.5 text-[11px] md:text-sm leading-tight">
                      <span className="truncate">{e.name}</span>
                      {e.id === profile?.id && (
                        <span className="text-[8px] md:text-[10px] uppercase tracking-widest text-magenta-reg">you</span>
                      )}
                    </div>
                    <div className="text-[9px] md:text-[11px] text-ink-mute truncate flex items-center gap-1 leading-tight">
                      <span>{e.role} · {e.permissions.length} perms</span>
                    </div>
                    <div className="hidden md:block">
                      <ApprovalPill status={e.approvalStatus} mustChange={e.mustChangePassword} />
                    </div>
                  </div>
                  <ApprovalDot
                    status={e.approvalStatus}
                    mustChange={e.mustChangePassword}
                  />
                  {e.active ? (
                    <CheckCircle2 className="w-3.5 h-3.5 md:w-4 md:h-4 text-success shrink-0" />
                  ) : (
                    <Circle className="w-3.5 h-3.5 md:w-4 md:h-4 text-ink-mute shrink-0" />
                  )}
                </button>
                {canDelete && !isShopAdmin(e.email, e.role) && e.id !== profile?.id && (
                  <button
                    onClick={() => handleDelete(e)}
                    className="btn btn-ghost h-6 w-6 md:h-8 md:w-8 p-0 text-danger shrink-0"
                    title="Delete employee (permanent)"
                  >
                    <Trash2 className="w-3 h-3 md:w-3.5 md:h-3.5" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {selected ? (
        <div
          className={cn(
            "paper-card overflow-hidden flex flex-col min-h-0",
            mobileRosterOpen ? "hidden lg:flex" : "flex"
          )}
        >
          <div className="flex items-center gap-1.5 border-b px-2.5 py-1.5 lg:hidden">
            <button
              type="button"
              onClick={() => setMobileRosterOpen(true)}
              className="btn btn-ghost btn-sm h-7 w-7 p-0 shrink-0"
              aria-label="Back to team members"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="text-[10px] font-semibold truncate">{selected.name}</span>
          </div>
          <div className="border-b flex items-center gap-1.5 px-2.5 md:px-4">
            <div className="flex overflow-x-auto scrollbar-none">
            {(
              [
                { k: "profile", label: "Profile", icon: UserIcon, perms: ["employees.manage", "users.permissions"] },
                { k: "payroll", label: "Payroll", icon: Wallet, perms: ["employees.payroll", "payroll.view"] },
                { k: "attendance", label: "Attendance", icon: CalendarDays, perms: ["employees.attendance", "attendance.view"] },
                { k: "permissions", label: "Permissions", icon: Shield, perms: ["employees.manage", "users.permissions"] },
              ] as { k: TabKey; label: string; icon: import("lucide-react").LucideIcon; perms: Permission[] }[]
            )
              .filter((t) => t.perms.some((p) => can(p)))
              .map(({ k, label, icon: Icon }) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={cn(
                    "px-2.5 md:px-4 h-8 md:h-10 flex items-center gap-1 md:gap-2 text-[10px] md:text-sm font-semibold border-b-2 transition whitespace-nowrap",
                    tab === k
                      ? "border-magenta-reg text-magenta-reg"
                      : "border-transparent text-ink-mute hover:text-ink"
                  )}
                >
                  <Icon className="w-3 h-3 md:w-4 md:h-4" />
                  {label}
                </button>
              ))}
            </div>
            {showHeaderPhoto && (
              <SelfPhotoButton employee={selected} className="ml-auto shrink-0" />
            )}
          </div>

          <div className="team-details-scroll flex-1 overflow-auto p-2.5 md:p-4 scroll-lined">
            {tab === "profile" && (
              <ProfileTab
                key={selected.id}
                employee={selected}
                onDelete={() => handleDelete(selected)}
                canDelete={canDelete && !isShopAdmin(selected.email, selected.role) && selected.id !== profile?.id}
              />
            )}
            {tab === "payroll" && <PayrollTab key={selected.id} employee={selected} />}
            {tab === "attendance" && <AttendanceTab key={selected.id} employee={selected} />}
            {tab === "permissions" && <PermissionsTab key={selected.id} employee={selected} />}
          </div>
        </div>
      ) : (
        <div className="paper-card p-6 md:p-10 text-center text-ink-mute">
          Select an employee or add a new one.
        </div>
      )}

      {inviteOpen && <InviteEmployeeModal onClose={() => setInviteOpen(false)} />}
      {invitesOpen && (
        <SentInvitesModal
          employees={employees}
          canDelete={canDelete}
          canResend={canInvite}
          onClose={() => setInvitesOpen(false)}
        />
      )}
      {avatarsOpen && (
        <AvatarsModal
          employees={employees}
          onClose={() => setAvatarsOpen(false)}
        />
      )}
      </div>
    </div>
  );
}

function ApprovalPill({
  status,
  mustChange,
}: {
  status?: ApprovalStatus;
  mustChange?: boolean;
}) {
  if (!status || status === "approved") {
    if (mustChange)
      return (
        <span className="mt-0.5 inline-flex items-center gap-1 text-[9px] uppercase tracking-widest text-yellow-reg">
          <KeyRound className="w-2.5 h-2.5" /> Must change pwd
        </span>
      );
    return null;
  }
  const meta =
    status === "pending_first_login"
      ? { label: "Pending first login", color: "text-yellow-reg", icon: Clock3 }
      : status === "pending_approval"
      ? { label: "Awaiting admin approval", color: "text-yellow-reg", icon: Clock3 }
      : { label: "Rejected", color: "text-danger", icon: X };
  const Icon = meta.icon;
  return (
    <span className={cn("mt-0.5 inline-flex items-center gap-1 text-[9px] uppercase tracking-widest", meta.color)}>
      <Icon className="w-2.5 h-2.5" /> {meta.label}
    </span>
  );
}

/** Mobile roster status dot — carries the approval state without adding a
 *  third line to the pinned-height row (the full pill stays on `md`+). */
function ApprovalDot({
  status,
  mustChange,
}: {
  status?: ApprovalStatus;
  mustChange?: boolean;
}) {
  const meta =
    status === "rejected"
      ? { label: "Rejected", color: "bg-danger" }
      : status === "pending_first_login"
      ? { label: "Pending first login", color: "bg-yellow-reg" }
      : status === "pending_approval"
      ? { label: "Awaiting admin approval", color: "bg-yellow-reg" }
      : mustChange
      ? { label: "Must change password", color: "bg-yellow-reg" }
      : null;
  if (!meta) return null;
  return (
    <span
      className={cn("md:hidden h-2 w-2 shrink-0 rounded-full", meta.color)}
      title={meta.label}
      aria-label={meta.label}
    />
  );
}

/* ---------- Invite Modal — full-profile creation ---------- */
function InviteEmployeeModal({ onClose }: { onClose: () => void }) {
  const { profile } = useAuth();
  const { data: modalSettings } = useShopSettings();
  const invite = useInviteEmployee();
  const [form, setForm] = useState({
    email: "",
    fullName: "",
    name: "",
    role: "Staff",
    phone: "",
    address: "",
    hireDate: "",
    emergencyContact: "",
    emergencyContactPhone: "",
    hours: DEFAULT_TEMP_PASSWORD_HOURS,
  });
  const [result, setResult] = useState<InviteEmployeeResult | null>(null);

  const changeFullName = (fullName: string) => {
    setForm((current) => {
      const previousSuggestion = deriveDisplayName(current.fullName);
      const keepManual =
        current.name.trim() !== "" &&
        current.name.trim() !== previousSuggestion;
      return {
        ...current,
        fullName,
        name: keepManual ? current.name : deriveDisplayName(fullName),
      };
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email.trim()) return toast.error("Email is required");
    if (!form.fullName.trim()) return toast.error("Full name is required");
    if (!form.name.trim()) return toast.error("Display name is required");
    try {
      const r = await invite.mutateAsync({
        email: form.email.trim(),
        name: form.name.trim(),
        fullName: form.fullName.trim(),
        role: form.role.trim() || "Staff",
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        hireDate: form.hireDate || null,
        emergencyContact: form.emergencyContact.trim() || null,
        emergencyContactPhone: form.emergencyContactPhone.trim() || null,
        expirationHours: form.hours,
        shopName: modalSettings?.shopName || undefined,
        actor: profile ? { id: profile.id, name: profile.name, role: profile.role } : undefined,
      });
      setResult(r);
      if (r.delivery?.email.status === "sent") {
        toast.success(`Invite emailed to ${r.email}`);
      } else {
        toast.success(`Account created — share the temp password with ${r.email}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invite failed");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink/50 flex items-end md:items-center justify-center p-0 md:p-4 animate-fade-in">
      <div className="team-modal paper-card w-full max-w-2xl overflow-hidden max-h-[95dvh] flex flex-col rounded-t-2xl md:rounded-xl">
        <div className="px-2.5 py-2 md:p-4 border-b flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <div className="text-[8px] md:text-[10px] uppercase tracking-wide md:tracking-widest text-ink-mute">
              Add employee
            </div>
            <h2 className="font-display text-base md:text-xl font-bold truncate">
              {result ? "Share these credentials" : "Invite new team member"}
            </h2>
          </div>
          <button onClick={onClose} className="btn btn-outline btn-sm h-7 w-7 p-0 shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-y-auto scroll-lined flex-1">
          {result ? (
            <InviteResultView
              result={result}
              phone={form.phone}
              shopName={modalSettings?.shopName || "the shop"}
              onClose={onClose}
              onInviteAnother={() => {
                setResult(null);
                setForm((f) => ({ ...f, email: "", fullName: "", name: "", phone: "", address: "" }));
              }}
            />
          ) : (
            <form onSubmit={submit} className="p-2.5 md:p-5 space-y-2.5 md:space-y-4">
              <p className="hidden lg:block text-[10px] md:text-xs text-ink-mute">
                A secure temporary password will be generated and displayed
                here for you to share. The account is ready immediately — the
                employee signs in with that password and is asked to choose a
                permanent one before using the app. There is no approval step.
              </p>

              <SectionLabel>Identity</SectionLabel>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Full name *">
                  <input
                    autoFocus
                    value={form.fullName}
                    onChange={(e) => changeFullName(e.target.value)}
                    className="input mt-1"
                    placeholder="e.g. Amara Nabatanzi"
                    autoComplete="name"
                    required
                  />
                </Field>
                <Field label="Display name *">
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="input min-w-0 flex-1"
                      placeholder="e.g. Amara N"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, name: deriveDisplayName(form.fullName) })}
                      className="btn btn-outline btn-sm shrink-0"
                      title="Use first name + surname initial"
                    >
                      Suggest
                    </button>
                  </div>
                  <p className="hidden lg:block mt-1 text-[10px] text-ink-mute">
                    The convenient working name shown on POS and receipts.
                  </p>
                </Field>
                <Field label="Role / Job title">
                  <input
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="input mt-1"
                    placeholder="Cashier / Designer / Manager"
                  />
                </Field>
                <Field label="Email address *">
                  <div className="mt-1 relative">
                    <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
                    <input
                      type="email"
                      required
                      autoComplete="off"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className="input pl-9"
                       placeholder="employee@business.co"
                    />
                  </div>
                </Field>
                <PhoneInput
                  label="Phone"
                  value={form.phone}
                  onChange={(v) => setForm({ ...form, phone: v })}
                  placeholder="+1 555 000 0000"
                />
              </div>

              <SectionLabel>Employment</SectionLabel>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Address">
                  <div className="mt-1 relative">
                    <Home className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
                    <input
                      value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                      className="input pl-9"
                      placeholder="Street, city, postcode"
                    />
                  </div>
                </Field>
                <Field label="Hire date">
                  <GlassDatePicker
                    value={form.hireDate}
                    onChange={(v) => setForm({ ...form, hireDate: v })}
                    ariaLabel="Hire date"
                    className="input select-glass mt-1"
                  />
                </Field>
              </div>

              <SectionLabel>Emergency contact</SectionLabel>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Contact name">
                  <div className="mt-1 relative">
                    <Contact2 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
                    <input
                      value={form.emergencyContact}
                      onChange={(e) =>
                        setForm({ ...form, emergencyContact: e.target.value })
                      }
                      className="input pl-9"
                      placeholder="Full name"
                    />
                  </div>
                </Field>
                <PhoneInput
                  label="Contact phone"
                  value={form.emergencyContactPhone}
                  onChange={(v) => setForm({ ...form, emergencyContactPhone: v })}
                  placeholder="+1 555 000 0000"
                />
              </div>

              <SectionLabel>Temporary password expiry</SectionLabel>
              <Field label="Expires in">
                <GlassSelect
                  value={String(form.hours)}
                  onChange={(v) => setForm({ ...form, hours: Number(v) })}
                  ariaLabel="Temporary password expiry"
                  options={TEMP_PASSWORD_HOUR_PRESETS.map((h) => ({
                    value: String(h),
                    label: formatHours(h),
                  }))}
                  className="input select-glass mt-1"
                />
                <div className="hidden lg:block text-[10px] text-ink-mute mt-1">
                  After this window the temp password stops working and a fresh
                  invite is required.
                </div>
              </Field>

              <div className="flex flex-col-reverse md:flex-row md:justify-end gap-2 pt-3 border-t sticky bottom-0 bg-card">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-outline"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={invite.isPending}
                  className="btn btn-primary"
                >
                  <Send className="w-4 h-4" />
                  {invite.isPending ? "Creating..." : "Create & get temp password"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[8px] md:text-[10px] uppercase tracking-wide md:tracking-widest text-ink-mute border-t pt-2 md:pt-3">
      {children}
    </div>
  );
}

function InviteResultView({
  result,
  phone,
  shopName,
  onClose,
  onInviteAnother,
}: {
  result: InviteEmployeeResult;
  phone?: string;
  shopName: string;
  onClose: () => void;
  onInviteAnother: () => void;
}) {
  const loginUrl =
    typeof window !== "undefined" ? window.location.origin + "/login" : "";

  const message = buildInviteMessage({
    shopName,
    name: result.name,
    email: result.email,
    tempPassword: result.tempPassword,
    loginUrl,
    expiresAt: result.expiresAt,
  });

  const copy = (label: string, value: string) =>
    navigator.clipboard.writeText(value).then(() => toast.success(`${label} copied`));

  const emailDelivery = result.delivery?.email;
  const smsDelivery = result.delivery?.sms;
  const anySent =
    emailDelivery?.status === "sent" || smsDelivery?.status === "sent";
  const smsHref = `sms:${encodeURIComponent(phone || "")}?&body=${encodeURIComponent(
    message
  )}`;

  return (
    <div className="p-5 space-y-4">
      <div className="w-14 h-14 rounded-full bg-success/10 mx-auto flex items-center justify-center">
        <UserCheck className="w-6 h-6 text-success" />
      </div>
      <div className="text-center">
        <h3 className="font-display text-lg font-bold">Account created</h3>
        <p className="hidden lg:block text-xs text-ink-mute mt-1">
          The account is already email-verified and can sign in immediately
          with the temporary password below.{" "}
          {anySent
            ? "The invite was sent from the server to the channels marked below."
            : "Automatic delivery is not configured, so share these credentials with "}
          {!anySent && (
            <span className="font-semibold text-ink">{result.name}</span>
          )}
          {!anySent && " using the buttons below."} On their first sign-in they
          will be asked to choose their own permanent password — there is no
          approval step.
        </p>
      </div>

      {(emailDelivery || smsDelivery) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <DeliveryBadge label="Email" channel={emailDelivery} target={result.email} />
          <DeliveryBadge
            label="SMS"
            channel={smsDelivery}
            target={phone || "no phone number"}
          />
        </div>
      )}

      <div className="rounded-lg border-2 border-magenta-reg/30 bg-magenta-reg/5 p-3 space-y-2">
        <FieldRow icon={<Mail className="w-3.5 h-3.5" />} label="Login email" value={result.email} onCopy={() => copy("Email", result.email)} />
        <FieldRow icon={<KeyRound className="w-3.5 h-3.5" />} label="Temporary password" value={result.tempPassword} mono onCopy={() => copy("Password", result.tempPassword)} highlight />
        <FieldRow icon={<Clock className="w-3.5 h-3.5" />} label="Expires" value={formatDateTime(result.expiresAt)} />
        <FieldRow icon={<LinkIcon className="w-3.5 h-3.5" />} label="Login link" value={loginUrl} mono onCopy={() => copy("Link", loginUrl)} />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label htmlFor="emp-ready-message" className="label">Ready-to-send message</label>
          <button onClick={() => copy("Message", message)} className="btn btn-outline h-7 text-[11px]">
            <Copy className="w-3 h-3" /> Copy message
          </button>
        </div>
        <textarea id="emp-ready-message" readOnly value={message} className="input h-32 text-xs font-mono leading-relaxed" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <a
          href={`mailto:${encodeURIComponent(result.email)}?subject=${encodeURIComponent(`Your ${shopName} login (temporary password)`)}&body=${encodeURIComponent(message)}`}
          className="btn btn-primary h-10"
        >
          <Mail className="w-4 h-4" /> Email
        </a>
        <a href={smsHref} className="btn btn-outline h-10">
          <MessageSquare className="w-4 h-4" /> SMS
        </a>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noreferrer"
          className="btn btn-outline h-10"
        >
          <MessageCircle className="w-4 h-4" /> WhatsApp
        </a>
      </div>
      <p className="hidden lg:block text-[10px] text-ink-mute text-center">
        {anySent
          ? "Email/SMS delivery happens on the server. The buttons above are a manual backup — they open your device's mail or messaging app with everything pre-filled."
          : "These buttons open your device's mail or messaging app with the recipient, subject and body pre-filled. Add RESEND_API_KEY + INVITE_EMAIL_FROM (email) or TWILIO_* secrets (SMS) to send automatically."}
      </p>

      <div className="flex flex-col-reverse md:flex-row md:justify-between gap-2 pt-2 border-t">
        <button onClick={onInviteAnother} className="btn btn-outline">
          Invite another
        </button>
        <button onClick={onClose} className="btn btn-primary">
          Done
        </button>
      </div>
    </div>
  );
}

/** Small status pill for one delivery channel. */
function DeliveryBadge({
  label,
  channel,
  target,
}: {
  label: string;
  channel?: InviteDelivery;
  target: string;
}) {
  if (!channel) return null;
  const meta =
    channel.status === "sent"
      ? { text: `Sent to ${target}`, cls: "text-success bg-success/10 border-success/30", icon: CheckCircle2 }
      : channel.status === "failed"
      ? { text: `Send failed — ${channel.detail || "unknown error"}`, cls: "text-danger bg-danger/10 border-danger/30", icon: X }
      : channel.status === "no_recipient"
      ? { text: "No phone number on this invite", cls: "text-ink-mute bg-ink/5 border-ink/15", icon: Clock3 }
      : { text: "Not configured — send manually", cls: "text-yellow-reg bg-yellow-reg/10 border-yellow-reg/30", icon: Clock3 };
  const Icon = meta.icon;
  return (
    <div className={cn("rounded-md border px-2.5 py-1.5 text-[11px] flex items-start gap-1.5", meta.cls)}>
      <Icon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <span className="min-w-0 break-words">
        <span className="font-semibold">{label}: </span>
        {meta.text}
        {channel.status === "not_configured" && channel.detail && (
          <span className="block text-[10px] opacity-80">{channel.detail}</span>
        )}
      </span>
    </div>
  );
}

function FieldRow({
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
        <div className="text-[9px] uppercase tracking-widest text-ink-mute">{label}</div>
        <div className={cn("mt-0.5 text-sm break-all", mono && "font-mono", highlight && "font-bold text-magenta-reg text-base")}>
          {value}
        </div>
      </div>
      {onCopy && (
        <button onClick={onCopy} className="btn btn-ghost h-7 w-7 p-0 shrink-0" title="Copy">
          <Copy className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

function buildInviteMessage(opts: {
  shopName: string;
  name: string;
  email: string;
  tempPassword: string;
  loginUrl: string;
  expiresAt: string;
}): string {
  return `Hello ${opts.name},

You've been invited to join ${opts.shopName} on PixoBooks.

Login email:        ${opts.email}
Temporary password: ${opts.tempPassword}
Expires:            ${formatDateTime(opts.expiresAt)}
Login link:         ${opts.loginUrl}

Please sign in with the temporary password above. You'll be asked to choose
a permanent password of your own before you can use the app — there is no
approval step, so you can start as soon as you've set it.

— ${opts.shopName}`;
}

function formatHours(h: number): string {
  if (h < 48) return `${h} hours`;
  if (h < 168) return `${Math.round(h / 24)} days`;
  if (h < 720) return `${Math.round(h / 168)} weeks`;
  return `${Math.round(h / 720)} months`;
}

/* ---------- Sent invites ---------- */
type InviteState = { label: string; cls: string };

function inviteState(e: Employee): InviteState {
  if (!e.mustChangePassword) {
    return { label: "Password set", cls: "text-success bg-success/10 border-success/30" };
  }
  const expires = e.tempPasswordExpiresAt
    ? new Date(e.tempPasswordExpiresAt).getTime()
    : 0;
  if (expires && expires < Date.now()) {
    return { label: "Invite expired", cls: "text-danger bg-danger/10 border-danger/30" };
  }
  return {
    label: "Awaiting first sign-in",
    cls: "text-yellow-reg bg-yellow-reg/10 border-yellow-reg/30",
  };
}

/**
 * Every account that has an invite record (`invited_at`), newest first.
 *
 * This is the "+ view" next to the invite button: the admin can see who was
 * invited, whether they have signed in and set a password, when the temporary
 * password expires, resend a fresh one, or revoke the account.
 */
function SentInvitesModal({
  employees,
  canDelete,
  canResend,
  onClose,
}: {
  employees: Employee[];
  canDelete: boolean;
  canResend: boolean;
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const { data: settings } = useShopSettings();
  const invite = useInviteEmployee();
  const del = useDeleteEmployee();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [resent, setResent] = useState<InviteEmployeeResult | null>(null);

  const invited = useMemo(
    () =>
      employees
        .filter((e) => !!e.invitedAt || !!e.mustChangePassword)
        .sort(
          (a, b) =>
            new Date(b.invitedAt || b.createdAt).getTime() -
            new Date(a.invitedAt || a.createdAt).getTime()
        ),
    [employees]
  );

  const detail = invited.find((e) => e.id === detailId) || null;

  const resend = (e: Employee) => {
    if (!e.email) {
      toast.error("This employee has no email address on file");
      return;
    }
    invite.mutate(
      {
        email: e.email,
        name: e.name,
        role: e.role,
        permissions: e.permissions,
        phone: e.phone ?? null,
        shopName: settings?.shopName || undefined,
        actor: profile
          ? { id: profile.id, name: profile.name, role: profile.role }
          : undefined,
      },
      {
        onSuccess: (r) => {
          setResent(r);
          toast.success(
            r.delivery?.email.status === "sent"
              ? `Invite re-sent to ${r.email}`
              : `New temporary password generated for ${r.email}`
          );
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Resend failed"),
      }
    );
  };

  const revoke = (e: Employee) => {
    if (
      !confirm(
        `Revoke ${e.name}'s invite and delete the account?\n\nThey lose access immediately. This cannot be undone.`
      )
    )
      return;
    del.mutate(
      {
        id: e.id,
        name: e.name,
        actor: profile
          ? { id: profile.id, name: profile.name, role: profile.role }
          : undefined,
      },
      {
        onSuccess: () => {
          toast.success(`${e.name}'s invite revoked`);
          setDetailId(null);
          if (resent?.userId === e.id) setResent(null);
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Revoke failed"),
      }
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink/50 flex items-end md:items-center justify-center p-0 md:p-4 animate-fade-in">
      <div className="team-modal paper-card w-full max-w-3xl overflow-hidden max-h-[95dvh] flex flex-col rounded-t-2xl md:rounded-xl">
        <div className="px-2.5 py-2 md:p-4 border-b flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <div className="text-[8px] md:text-[10px] uppercase tracking-wide md:tracking-widest text-ink-mute">
              Users &amp; permissions
            </div>
            <h2 className="font-display text-base md:text-xl font-bold truncate">
              Sent invites
            </h2>
            <p className="text-[10px] md:text-xs text-ink-mute mt-0.5">
              {invited.length} invite{invited.length === 1 ? "" : "s"}
            </p>
          </div>
          <button onClick={onClose} className="btn btn-outline btn-sm h-7 w-7 p-0 shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-y-auto scroll-lined flex-1 p-2.5 md:p-4 space-y-2 md:space-y-3">
          {resent && (
            <div className="rounded-lg border border-success/40 bg-success/5 p-3 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-success">
                <CheckCircle2 className="w-3.5 h-3.5" /> New temporary password for{" "}
                {resent.email}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <code className="font-mono text-[13px] px-2 py-1 rounded bg-ink/5">
                  {resent.tempPassword}
                </code>
                <button
                  onClick={() =>
                    navigator.clipboard
                      .writeText(resent.tempPassword)
                      .then(() => toast.success("Password copied"))
                  }
                  className="btn btn-outline h-7 text-[11px]"
                >
                  <Copy className="w-3 h-3" /> Copy
                </button>
                <a
                  href={`mailto:${encodeURIComponent(resent.email)}?subject=${encodeURIComponent(
                    `Your ${settings?.shopName || "shop"} login (temporary password)`
                  )}&body=${encodeURIComponent(
                    buildInviteMessage({
                      shopName: settings?.shopName || "the shop",
                      name: resent.name,
                      email: resent.email,
                      tempPassword: resent.tempPassword,
                      loginUrl:
                        typeof window !== "undefined"
                          ? window.location.origin + "/login"
                          : "",
                      expiresAt: resent.expiresAt,
                    })
                  )}`}
                  className="btn btn-outline h-7 text-[11px]"
                >
                  <Mail className="w-3 h-3" /> Email
                </a>
                {resent.delivery?.email.status === "sent" && (
                  <span className="text-[10px] text-ink-mute">
                    Also emailed automatically
                  </span>
                )}
              </div>
              <div className="text-[10px] text-ink-mute">
                Expires {formatDateTime(resent.expiresAt)}
              </div>
            </div>
          )}

          {invited.length === 0 ? (
            <div className="p-8 text-center text-ink-mute text-sm">
              <History className="w-8 h-8 mx-auto mb-2 opacity-40" />
              No invites sent yet. Use “Add” to invite the first team member.
            </div>
          ) : detail ? (
            <InviteDetail
              employee={detail}
              canDelete={canDelete}
              canResend={canResend}
              busy={del.isPending || invite.isPending}
              onBack={() => setDetailId(null)}
              onResend={() => resend(detail)}
              onRevoke={() => revoke(detail)}
            />
          ) : (
            <div className="divide-y">
              {invited.map((e) => {
                const state = inviteState(e);
                return (
                  <div
                    key={e.id}
                    className="py-2.5 flex flex-col sm:flex-row sm:items-center gap-2"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-full bg-magenta-reg/10 text-magenta-reg font-bold flex items-center justify-center shrink-0">
                        {e.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate">{e.name}</div>
                        <div className="text-[11px] text-ink-mute truncate">
                          {e.email || "no email"}
                          {e.phone ? ` · ${e.phone}` : ""}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                      <span
                        className={cn(
                          "chip border text-[10px] whitespace-nowrap",
                          state.cls
                        )}
                      >
                        {state.label}
                      </span>
                      <span className="text-[10px] text-ink-mute whitespace-nowrap">
                        {e.invitedAt ? formatDate(e.invitedAt) : formatDate(e.createdAt)}
                      </span>
                      <button
                        onClick={() => setDetailId(e.id)}
                        className="btn btn-ghost h-7 px-2 text-[11px]"
                        title="View invite details"
                      >
                        <Eye className="w-3 h-3" /> View
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="picker-foot border-t p-3 flex items-center justify-end gap-2 shrink-0">
          {detail && (
            <button onClick={() => setDetailId(null)} className="btn btn-outline h-9">
              Back to list
            </button>
          )}
          <button onClick={onClose} className="btn btn-primary h-9">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function InviteDetail({
  employee,
  canDelete,
  canResend,
  busy,
  onBack,
  onResend,
  onRevoke,
}: {
  employee: Employee;
  canDelete: boolean;
  canResend: boolean;
  busy: boolean;
  onBack: () => void;
  onResend: () => void;
  onRevoke: () => void;
}) {
  const state = inviteState(employee);
  const expires = employee.tempPasswordExpiresAt
    ? new Date(employee.tempPasswordExpiresAt)
    : null;

  return (
    <div className="space-y-2 md:space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-display text-lg font-bold truncate">
            {employee.name}
          </div>
          <div className="text-xs text-ink-mute truncate">
            {employee.email || "no email"}
          </div>
        </div>
        <span className={cn("chip border text-[10px]", state.cls)}>
          {state.label}
        </span>
      </div>

      <div className="rounded-lg border p-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        <DetailRow label="Role" value={employee.role} />
        <DetailRow label="Phone" value={employee.phone || "—"} />
        <DetailRow
          label="Invited by"
          value={employee.invitedByName || "—"}
        />
        <DetailRow
          label="Invited at"
          value={
            employee.invitedAt
              ? formatDateTime(employee.invitedAt)
              : "—"
          }
        />
        <DetailRow
          label="Temp password expires"
          value={expires ? formatDateTime(expires) : "—"}
        />
        <DetailRow
          label="First sign-in"
          value={
            employee.mustChangePassword
              ? "Not completed — temporary password still required"
              : "Completed — password set by the employee"
          }
        />
        <DetailRow
          label="Permissions"
          value={`${employee.permissions.length} granted`}
        />
        <DetailRow label="Account" value={employee.active ? "Active" : "Inactive"} />
      </div>

      <div className="flex flex-wrap gap-2">
        {canResend && (
          <button
            onClick={onResend}
            disabled={busy || !employee.email}
            className="btn btn-primary h-9"
            title="Issue a new temporary password and send the invite again"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Resend invite
          </button>
        )}
        {canDelete && (
          <button
            onClick={onRevoke}
            disabled={busy}
            className="btn btn-outline h-9 text-danger"
            title="Delete the account and cancel the invite"
          >
            <Trash2 className="w-3.5 h-3.5" /> Revoke &amp; delete
          </button>
        )}
        <button onClick={onBack} className="btn btn-ghost h-9 ml-auto">
          Back
        </button>
      </div>

      <p className="hidden lg:block text-[10px] text-ink-mute">
        Resending replaces the temporary password — the previous one stops
        working. Revoking deletes the Supabase auth account, so the invite link
        and any session are dead immediately.
      </p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-widest text-ink-mute">
        {label}
      </div>
      <div className="break-words">{value}</div>
    </div>
  );
}

/* ---------- Profile tab (split emergency contact into name + phone) ---------- */
function ProfileTab({ employee, onDelete, canDelete }: { employee: Employee; onDelete: () => void; canDelete: boolean; }) {
  const { can, profile } = useAuth();
  const update = useUpdateEmployee();
  /** Admins may set any photo; a team member may only set their own, and only
   *  with the `users.avatar` permission. */
  const canEditPhoto = can("employees.manage") || (employee.id === profile?.id && can("users.avatar"));
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    fullName: employee.fullName || employee.name,
    name: employee.name,
    role: employee.role,
    pin: employee.pin,
    active: employee.active,
    avatarUrl: employee.avatarUrl || "",
    phone: employee.phone || "",
    address: employee.address || "",
    hireDate: employee.hireDate || "",
    emergencyContact: employee.emergencyContact || "",
    emergencyContactPhone: employee.emergencyContactPhone || "",
    notes: employee.notes || "",
  });

  const uploadAvatar = async (file: File) => {
    setUploading(true);
    try {
      const url = await processImageFile(file, "avatars");
      setForm((f) => ({ ...f, avatarUrl: url }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally { setUploading(false); }
  };

  const changeFullName = (fullName: string) => {
    setForm((current) => {
      const previousSuggestion = deriveDisplayName(current.fullName);
      const keepManual =
        current.name.trim() !== "" &&
        current.name.trim() !== previousSuggestion;
      return {
        ...current,
        fullName,
        name: keepManual ? current.name : deriveDisplayName(fullName),
      };
    });
  };

  const save = () => {
    if (!form.fullName.trim()) return toast.error("Full name is required");
    if (!form.name.trim()) return toast.error("Display name is required");
    update.mutate(
      {
        id: employee.id,
        name: form.name,
        fullName: form.fullName,
        role: form.role,
        pin: form.pin,
        active: form.active,
        avatarUrl: form.avatarUrl,
        phone: form.phone,
        address: form.address,
        hireDate: form.hireDate || null,
        emergencyContact: form.emergencyContact,
        emergencyContactPhone: form.emergencyContactPhone,
        notes: form.notes,
      },
      {
        onSuccess: (res) => {
          if (res?.roleSyncWarning) {
            toast.warning(
              `Profile saved, but tenant role sync needs an admin: ${res.roleSyncWarning}`
            );
          } else {
            toast.success("Profile saved");
          }
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Save failed"),
      }
    );
  };

  return (
    <div className="space-y-3 md:space-y-4">
      <div className="flex flex-col gap-2 border-b border-line/70 pb-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-magenta-reg/10 text-magenta-reg font-bold text-lg md:text-xl flex items-center justify-center shrink-0 overflow-hidden">
            {form.avatarUrl ? <img src={form.avatarUrl} alt="" className="w-full h-full object-cover" /> : employeeInitials(form.fullName || form.name)}
          </div>
          <div className="min-w-0">
            <div className="text-[7px] uppercase tracking-[0.14em] text-ink-mute md:text-[9px]">Profile</div>
            <h2 className="font-display text-base md:text-xl font-bold break-words">{form.name || form.fullName}</h2>
            <div className="text-[9px] text-ink-mute break-all md:text-[10px]">{employee.email}</div>
            <div className="text-[9px] text-ink-mute md:text-[10px]">Joined {formatDate(employee.createdAt)}</div>
            <ApprovalPill status={employee.approvalStatus} mustChange={employee.mustChangePassword} />
          </div>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {canEditPhoto && (
            <label className="btn btn-outline btn-sm cursor-pointer max-md:w-7 max-md:px-0">
              <Upload className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{uploading ? "Uploading..." : "Photo"}</span>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); }} />
            </label>
          )}
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-ink-mute md:text-xs">Active</span>
            <button onClick={() => setForm({ ...form, active: !form.active })} className={cn("w-10 h-5 rounded-full transition relative", form.active ? "bg-success" : "bg-ink/20")}>
              <span className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition", form.active ? "left-[21px]" : "left-0.5")} />
            </button>
          </div>
        </div>
      </div>

      <div className="team-fields team-compact grid grid-cols-2 md:grid-cols-2 gap-1.5 md:gap-3">
        <Field label="Full name">
          <input
            value={form.fullName}
            onChange={(e) => changeFullName(e.target.value)}
            className="input mt-1"
            placeholder="e.g. Sheillah Nakato"
            autoComplete="name"
          />
        </Field>
        <Field label="Display name">
          <div className="mt-1 flex items-center gap-2">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input min-w-0 flex-1"
              placeholder="e.g. Sheillah K"
            />
            <button
              type="button"
              onClick={() => setForm({ ...form, name: deriveDisplayName(form.fullName) })}
              className="btn btn-outline btn-sm shrink-0 max-md:w-7 max-md:px-0"
              title="Use first name + surname initial"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Suggest</span>
            </button>
          </div>
          <p className="mt-1 hidden text-[9px] text-ink-mute lg:block">
            The name colleagues and receipts use. Defaults to first name + surname
            initial, e.g. Sheillah K.
          </p>
        </Field>
        <Field label="Role / Job title">
          <input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="input mt-1" placeholder="Cashier / Designer / Admin" />
        </Field>
        <PhoneInput
          label="Phone"
          value={form.phone}
          onChange={(v) => setForm({ ...form, phone: v })}
        />
        <Field label="Email">
          <input value={employee.email || ""} disabled className="input mt-1 opacity-60" />
        </Field>
        <Field label="Address">
          <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="input mt-1" />
        </Field>
        <Field label="Hire date">
          <GlassDatePicker
            value={form.hireDate}
            onChange={(v) => setForm({ ...form, hireDate: v })}
            ariaLabel="Hire date"
            className="input select-glass mt-1"
          />
        </Field>
        <Field label="Emergency contact name">
          <input value={form.emergencyContact} onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })} className="input mt-1" placeholder="Full name" />
        </Field>
        <PhoneInput
          label="Emergency contact phone"
          value={form.emergencyContactPhone}
          onChange={(v) => setForm({ ...form, emergencyContactPhone: v })}
          placeholder="+1 555 000 0000"
        />
        <Field label="Quick-switch PIN (optional)">
          <input value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "").slice(0, 6) })} className="input mt-1 num tracking-widest" placeholder="e.g. 1234" />
        </Field>
      </div>

      <Field label="Notes">
        <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input mt-1 min-h-12 md:min-h-16" placeholder="Skills, certifications, availability..." />
      </Field>

      <div className="flex flex-col-reverse md:flex-row md:justify-between sticky bottom-0 bg-card pt-2 md:pt-3 gap-1.5 md:gap-2">
        {canDelete && (
          <button onClick={onDelete} className="btn btn-outline text-danger border-danger/40">
            <Trash2 className="w-4 h-4" /> Delete employee
          </button>
        )}
        <button onClick={save} disabled={update.isPending} className="btn btn-primary md:ml-auto">
          <Save className="w-4 h-4" /> Save profile
        </button>
      </div>
    </div>
  );
}

/* Payroll tab — overflow-safe salary cards */
function PayrollTab({ employee }: { employee: Employee }) {
  const { can } = useAuth();
  const canEdit = can("employees.payroll") || can("payroll.run");
  const update = useUpdateEmployee();
  const { data: settings } = useShopSettings();
  const defaultCurrency = employee.salary?.currency || settings?.currency || "USD";
  const [salary, setSalary] = useState<EmployeeSalary>({
    base: employee.salary?.base || 0,
    currency: defaultCurrency,
    payCycle: employee.salary?.payCycle || "monthly",
    allowances: employee.salary?.allowances || [],
  });

  const addAllowance = () =>
    setSalary({
      ...salary,
      allowances: [
        ...salary.allowances,
        { name: "", amount: 0, type: "fixed", payCycle: salary.payCycle },
      ],
    });
  const updateAllowance = (i: number, patch: Partial<Allowance>) =>
    setSalary({
      ...salary,
      allowances: salary.allowances.map((a, idx) => (idx === i ? { ...a, ...patch } : a)),
    });
  const removeAllowance = (i: number) =>
    setSalary({ ...salary, allowances: salary.allowances.filter((_, idx) => idx !== i) });

  const cycleToMonths: Record<string, number> = { daily: 30, weekly: 4.33, biweekly: 2.17, monthly: 1, annually: 1 / 12 };
  const totalAllowancesMonthly = salary.allowances.reduce((s, a) => {
    const raw = a.type === "fixed" ? a.amount : (salary.base * a.amount) / 100;
    const factor = cycleToMonths[a.payCycle || salary.payCycle] || 1;
    return s + raw * factor;
  }, 0);
  const grossMonthly = salary.base + totalAllowancesMonthly;

  const save = () => {
    update.mutate(
      { id: employee.id, salary },
      {
        onSuccess: (res) => {
          if (res?.roleSyncWarning) {
            toast.warning(
              `Payroll saved, but tenant role sync needs an admin: ${res.roleSyncWarning}`
            );
          } else {
            toast.success("Payroll saved");
          }
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Save failed"),
      }
    );
  };

  return (
    <fieldset
      disabled={!canEdit}
      className="space-y-3 md:space-y-4 border-0 p-0 m-0 min-w-0"
    >
      <TabHeader
        icon={Wallet}
        kicker="Payroll"
        title={employee.name}
        meta={`${salary.payCycle} base cycle`}
        actions={
          canEdit ? (
            <span className="chip border border-success/30 bg-success/5 text-[9px] text-success">Editable</span>
          ) : (
            <span className="chip border border-line text-[9px] text-ink-mute">View only</span>
          )
        }
      />
      {/*
        Overflow-safe salary stat grid. Uses `min-w-0`, `break-words` and a
        responsive font size so very large currency values (e.g. "10,000,000
        UGX") remain fully visible inside every card at every viewport.
      */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 md:gap-3">
        <SalaryStat label="Base salary" value={formatCurrency(salary.base, salary.currency)} />
        <SalaryStat label="Allowances (mo. eq.)" value={formatCurrency(totalAllowancesMonthly, salary.currency)} />
        <SalaryStat label="Gross (monthly)" value={formatCurrency(grossMonthly, salary.currency)} tone="success" />
        <SalaryStat label="Base pay cycle" value={salary.payCycle} textual />
      </div>

      <div className="team-compact grid grid-cols-3 gap-1.5 md:gap-3">
        <Field label="Base salary">
          <AmountInput step="0.01" min={0} value={salary.base} onChange={(v) => setSalary({ ...salary, base: v })} className="input mt-1 num text-right" ariaLabel="Base salary" />
        </Field>
        <Field label="Currency">
          <GlassSelect
            value={salary.currency}
            onChange={(v) => setSalary({ ...salary, currency: v })}
            ariaLabel="Salary currency"
            options={CURRENCIES.map((c) => ({ value: c.code, label: `${c.symbol} ${c.code}` }))}
            className="input select-glass mt-1 max-md:px-1.5"
          />
        </Field>
        <Field label="Base pay cycle">
          <GlassSelect
            value={salary.payCycle}
            onChange={(v) => setSalary({ ...salary, payCycle: v as EmployeeSalary["payCycle"] })}
            ariaLabel="Base pay cycle"
            options={[
              { value: "monthly", label: "Monthly" },
              { value: "biweekly", label: "Bi-weekly" },
              { value: "weekly", label: "Weekly" },
            ]}
            className="input select-glass mt-1 max-md:px-1.5"
          />
        </Field>
      </div>

      <div>
        <div className="flex items-center justify-between gap-2 mb-1.5 md:mb-2">
          <div>
            <div className="font-display text-sm md:text-base font-bold">Allowances</div>
            <div className="hidden lg:block text-[10px] text-ink-mute">Housing, transport, meals, medical, bonuses — each with its own pay cycle.</div>
          </div>
          <button onClick={addAllowance} className="btn btn-outline btn-sm shrink-0">
            <Plus className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Add allowance</span>
          </button>
        </div>
        {salary.allowances.length === 0 ? (
          <div className="p-3 border border-dashed rounded-md text-[10px] md:text-sm text-ink-mute text-center">
            No allowances defined.
          </div>
        ) : (
          <div className="space-y-2">
            {salary.allowances.map((a, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-12 md:col-span-4">
                  <label htmlFor={`emp-allow-name-${i}`} className="label">Name</label>
                  <input id={`emp-allow-name-${i}`} value={a.name} onChange={(e) => updateAllowance(i, { name: e.target.value })} className="input mt-1" placeholder="Housing, Transport, Meal..." />
                </div>
                <div className="col-span-6 md:col-span-2">
                  <label htmlFor={`emp-allow-type-${i}`} className="label">Type</label>
                  <GlassSelect
                    id={`emp-allow-type-${i}`}
                    value={a.type}
                    onChange={(v) => updateAllowance(i, { type: v as "fixed" | "percentage" })}
                    ariaLabel={`Allowance ${i + 1} type`}
                    options={[
                      { value: "fixed", label: "Fixed" },
                      { value: "percentage", label: "% of base" },
                    ]}
                    className="input select-glass mt-1"
                  />
                </div>
                <div className="col-span-6 md:col-span-2">
                  <label htmlFor={`emp-allow-amount-${i}`} className="label">Amount {a.type === "percentage" ? "(%)" : `(${salary.currency})`}</label>
                  <AmountInput id={`emp-allow-amount-${i}`} step="0.01" min={0} value={a.amount} onChange={(v) => updateAllowance(i, { amount: v })} className="input mt-1 num text-right" ariaLabel={`Allowance amount ${i + 1}`} />
                </div>
                <div className="col-span-10 md:col-span-3">
                  <label htmlFor={`emp-allow-cycle-${i}`} className="label">Pay cycle</label>
                  <GlassSelect
                    id={`emp-allow-cycle-${i}`}
                    value={a.payCycle || salary.payCycle}
                    onChange={(v) => updateAllowance(i, { payCycle: v as Allowance["payCycle"] })}
                    ariaLabel={`Allowance ${i + 1} pay cycle`}
                    options={[
                      { value: "daily", label: "Daily (per day present)" },
                      { value: "weekly", label: "Weekly" },
                      { value: "biweekly", label: "Bi-weekly" },
                      { value: "monthly", label: "Monthly" },
                      { value: "annually", label: "Annually" },
                    ]}
                    className="input select-glass mt-1"
                  />
                </div>
                <div className="col-span-2 md:col-span-1 flex justify-end">
                  <button onClick={() => removeAllowance(i)} className="btn btn-ghost h-9 w-9 p-0 text-danger">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end items-center gap-1.5 md:gap-2 sticky bottom-0 bg-card pt-2 md:pt-3">
        {canEdit ? (
          <button onClick={save} disabled={update.isPending} className="btn btn-primary">
            <Save className="w-4 h-4" /> Save payroll
          </button>
        ) : (
          <span className="text-xs text-ink-mute">
            View only — the payroll.run permission is required to edit salaries.
          </span>
        )}
      </div>
    </fieldset>
  );
}

/* Attendance tab */
/** Short month labels for the attendance header. */
const MONTH_NAMES = Array.from({ length: 12 }, (_, i) =>
  new Date(2000, i, 1).toLocaleDateString(undefined, { month: "short" })
);

function AttendanceTab({ employee }: { employee: Employee }) {
  const { can } = useAuth();
  const canEdit = can("employees.attendance");
  const [month, setMonth] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; });
  const upsert = useUpsertAttendance();
  const autoValidate = useAutoValidateAttendance();

  const from = localISODate(new Date(month.year, month.month, 1));
  const to = localISODate(new Date(month.year, month.month + 1, 0));
  const { data: records = [] } = useAttendance(employee.id, from, to);
  const { data: transactionDays = {} } = useEmployeeTransactionDays(
    employee.id,
    employee.name,
    from,
    to
  );

  const autoEligibleCount = Object.entries(transactionDays).filter(
    ([date, count]) =>
      date <= localISODate(new Date()) &&
      count >= ATTENDANCE_AUTO_MIN_TRANSACTIONS &&
      !records.some((record) => record.date === date)
  ).length;

  const stats = attendanceStats(records);
  const days = getMonthMatrix(month.year, month.month);

  const changeMonth = (dir: -1 | 1) => setMonth((m) => { const d = new Date(m.year, m.month + dir, 1); return { year: d.getFullYear(), month: d.getMonth() }; });

  /** Free-typed year so a bookkeeper can jump to any past month directly
   *  instead of clicking the arrows a dozen times per year. */
  const [yearText, setYearText] = useState(() => String(month.year));
  useEffect(() => {
    setYearText(String(month.year));
  }, [month.year]);
  const commitYear = (raw: string) => {
    const n = Math.trunc(Number(raw));
    if (Number.isFinite(n) && n >= 1900 && n <= 2200) {
      setMonth((m) => (m.year === n ? m : { ...m, year: n }));
    } else {
      setYearText(String(month.year));
    }
  };

  const cycleStatus = (currentDate: Date, currentStatus?: AttendanceStatus) => {
    const order: AttendanceStatus[] = ["present", "halfday", "leave", "holiday", "absent"];
    let next: AttendanceStatus;
    if (!currentStatus) next = "present";
    else { const idx = order.indexOf(currentStatus); next = order[(idx + 1) % order.length]; }
    const iso = currentDate.toISOString().slice(0, 10);
    upsert.mutate(
      { employeeId: employee.id, employeeName: employee.name, date: iso, status: next },
      { onError: (e) => toast.error(e instanceof Error ? e.message : "Failed") }
    );
  };

  return (
    <div className="space-y-2 md:space-y-4">
      <TabHeader
        icon={CalendarDays}
        kicker="Attendance"
        actions={<span className="chip border border-line text-[9px] text-ink-mute">{stats.totalHours}h tracked</span>}
      />
      <div className="grid grid-cols-3 md:grid-cols-5 gap-1.5 md:gap-2">
        <Stat label="Present" value={String(stats.present)} tone="success" />
        <Stat label="Half-day" value={String(stats.halfday)} />
        <Stat label="Leave" value={String(stats.leave)} />
        <Stat label="Absent" value={String(stats.absent)} tone="danger" />
        <Stat label="Hours" value={`${stats.totalHours}h`} />
      </div>

      <div className="paper-card p-1.5 md:p-2 flex items-center justify-between gap-1">
        <button onClick={() => changeMonth(-1)} aria-label="Previous month" className="btn btn-ghost btn-sm w-7 px-0 shrink-0"><ChevronLeft className="w-3.5 h-3.5" /></button>
        <div className="flex items-center gap-1 min-w-0">
          <GlassSelect
            value={String(month.month)}
            onChange={(v) => setMonth((m) => ({ ...m, month: Number(v) }))}
            ariaLabel="Attendance month"
            options={MONTH_NAMES.map((m, i) => ({ value: String(i), label: m }))}
            className="input input-sm select-glass"
          />
          <input
            aria-label="Attendance year"
            type="number"
            inputMode="numeric"
            min={1900}
            max={2200}
            step={1}
            value={yearText}
            onChange={(e) => setYearText(e.target.value)}
            onBlur={() => commitYear(yearText)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitYear(yearText);
              }
            }}
            className="input input-sm num w-16 text-center font-semibold"
          />
        </div>
        <button onClick={() => changeMonth(1)} aria-label="Next month" className="btn btn-ghost btn-sm w-7 px-0 shrink-0"><ChevronRight className="w-3.5 h-3.5" /></button>
      </div>
      {!canEdit && (
        <div className="text-[10px] md:text-xs text-ink-mute">
          <span className="lg:hidden">View only</span>
          <span className="hidden lg:inline">View only — the employees.attendance permission is required to mark days.</span>
        </div>
      )}

      <div className="rounded-lg border border-line bg-paper/60 px-2.5 py-1.5 flex flex-col gap-1.5 md:flex-row md:items-center md:justify-between">
        <div className="hidden lg:block text-[10px] md:text-[11px] text-ink-mute">
          Automatic validation needs at least{" "}
          <strong className="text-ink">{ATTENDANCE_AUTO_MIN_TRANSACTIONS} transactions</strong>{" "}
          on that day. Days below the threshold must be marked manually.
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => {
              if (autoEligibleCount === 0) {
                toast.info("No unmarked days meet the 3-transaction threshold.");
                return;
              }
              autoValidate.mutate(
                {
                  employeeId: employee.id,
                  employeeName: employee.name,
                  days: transactionDays,
                },
                {
                  onSuccess: (count) =>
                    toast.success(
                      count === 0
                        ? "No eligible unmarked days found"
                        : `${count} day${count === 1 ? "" : "s"} auto-validated from sales`
                    ),
                  onError: (err) =>
                    toast.error(err instanceof Error ? err.message : "Validation failed"),
                }
              );
            }}
            disabled={autoValidate.isPending}
            className="btn btn-outline btn-sm shrink-0"
          >
            <UserCheck className="w-3.5 h-3.5" />
            {autoValidate.isPending
              ? "Validating…"
              : `Auto-validate${autoEligibleCount > 0 ? ` (${autoEligibleCount})` : ""}`}
          </button>
        )}
      </div>

      <div className="grid grid-cols-7 gap-0.5 md:gap-1 text-center text-[8px] md:text-[10px] uppercase tracking-wide md:tracking-widest text-ink-mute">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (<div key={d} className="pb-1">{d}</div>))}
      </div>
      <div className="grid grid-cols-7 gap-0.5 md:gap-1">
        {days.map((d, i) => {
          const inMonth = d.getMonth() === month.month;
          const iso = localISODate(d);
          const record = records.find((r) => r.date === iso);
          const meta = record ? ATTENDANCE_META[record.status] : null;
          const isToday = iso === localISODate(new Date());
          const txnCount = transactionDays[iso] || 0;
          const autoReady = txnCount >= ATTENDANCE_AUTO_MIN_TRANSACTIONS;
          const whenTitle = autoReady
            ? `${txnCount} transactions — eligible for automatic validation`
            : txnCount > 0
            ? `${txnCount} transaction${txnCount === 1 ? "" : "s"} — ${ATTENDANCE_AUTO_MIN_TRANSACTIONS - txnCount} more needed for automatic validation; mark manually`
            : "No transactions — mark attendance manually";
            return (
            <button key={i} onClick={() => canEdit && cycleStatus(d, record?.status)} disabled={!inMonth || !canEdit} className={cn("aspect-square border rounded-md text-xs flex flex-col items-center justify-center transition relative", !inMonth && "opacity-30 cursor-default", meta?.color, isToday && "ring-2 ring-magenta-reg")} title={canEdit ? `${whenTitle}${meta ? ` · ${meta.label}` : ""}` : "View only"}>
              <div className="text-[10px] md:text-[11px] font-semibold">{d.getDate()}</div>
              {meta && <div className="text-[9px] md:text-[10px] font-bold mt-0.5">{meta.symbol}</div>}
              {!meta && autoReady && (
                <div className="mt-0.5 h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
              )}
              {!meta && txnCount > 0 && (
                <div className="text-[8px] leading-none text-ink-mute mt-0.5">{txnCount}t</div>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-1.5 text-[10px]">
        {Object.entries(ATTENDANCE_META).map(([k, v]) => (<span key={k} className={cn("chip", v.color)}>{v.symbol} · {v.label}</span>))}
      </div>
    </div>
  );
}

/* Permissions tab */
function PermissionsTab({ employee }: { employee: Employee }) {
  const { can } = useAuth();
  const canEdit = can("employees.manage") || can("users.permissions");
  const setPerms = useSetPermissions();
  const update = useUpdateEmployee();
  const [perms, setPermsState] = useState<Permission[]>(employee.permissions);
  const [role, setRole] = useState(employee.role);

  const grouped = useMemo(() => {
    const m = new Map<string, typeof ALL_PERMISSIONS>();
    for (const p of ALL_PERMISSIONS) {
      const list = m.get(p.group);
      if (list) list.push(p);
      else m.set(p.group, [p]);
    }
    return m;
  }, []);

  const toggle = (p: Permission) => setPermsState((cur) => cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]);

  const applyPreset = (preset: "cashier" | "manager" | "designer" | "admin" | "none") => {
    if (preset === "admin") { setPermsState([...ALL_PERMISSION_KEYS]); setRole("Admin"); }
    else if (preset === "cashier") { setPermsState(DEFAULT_STAFF_PERMISSIONS); setRole("Cashier"); }
    else if (preset === "manager") {
      setPermsState([
        ...DEFAULT_STAFF_PERMISSIONS, "pos.discount", "inventory.edit", "inventory.adjust",
        "po.view", "po.manage", "po.receive", "suppliers.view", "suppliers.manage",
        "customers.manage", "loyalty.manage", "quotes.manage", "expenses.view", "expenses.manage",
        "sales.view", "stats.view", "finance.view", "settings.receipt", "settings.discount",
      ]);
      setRole("Manager");
    } else if (preset === "designer") {
      setPermsState(["quotes.view", "quotes.manage", "customers.manage", "inventory.view"]);
      setRole("Designer");
    } else setPermsState([]);
  };

  const save = () => {
    setPerms.mutate(
      { id: employee.id, permissions: perms },
      {
        onSuccess: () => {
          if (role === employee.role) {
            toast.success("Permissions saved");
            return;
          }
          update.mutate(
            { id: employee.id, role },
            {
              onSuccess: (res) => {
                if (res?.roleSyncWarning) {
                  toast.warning(
                    `Permissions saved, but tenant role sync needs an admin: ${res.roleSyncWarning}`
                  );
                } else {
                  toast.success("Permissions saved");
                }
              },
              onError: (err) =>
                toast.error(err instanceof Error ? err.message : "Role save failed"),
            }
          );
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Save failed"),
      }
    );
  };

  return (
    <div className="space-y-2 md:space-y-4">
      {!canEdit && (
        <div className="text-[10px] md:text-xs text-ink-mute">
          <span className="lg:hidden">View only</span>
          <span className="hidden lg:inline">View only — the employees.manage or users.permissions permission is required to change permissions.</span>
        </div>
      )}

      <TabHeader
        icon={Shield}
        kicker="Permissions"
        title={employee.name}
        meta={`${perms.length}/${ALL_PERMISSION_KEYS.length} granted`}
      />

      <fieldset disabled={!canEdit} className="space-y-2 md:space-y-4 border-0 p-0 m-0 min-w-0">
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto scrollbar-none pb-px">
            <span className="label inline-flex shrink-0 items-center gap-1"><Sparkles className="w-3 h-3" /> Presets:</span>
            <button type="button" onClick={() => applyPreset("cashier")} className="chip shrink-0 border hover:bg-ink/5">Cashier</button>
            <button type="button" onClick={() => applyPreset("designer")} className="chip shrink-0 border hover:bg-ink/5">Designer</button>
            <button type="button" onClick={() => applyPreset("manager")} className="chip shrink-0 border hover:bg-ink/5">Manager</button>
            <button type="button" onClick={() => applyPreset("admin")} className="chip shrink-0 bg-magenta-reg/10 text-magenta-reg border border-magenta-reg/30">Admin (all)</button>
            <button type="button" onClick={() => applyPreset("none")} className="chip shrink-0 border hover:bg-ink/5">Clear</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-1.5 md:gap-3">
          {[...grouped.entries()].map(([group, list]) => (
            <div key={group} className="paper-card p-2.5 md:p-3">
              <div className="flex items-center justify-between">
                <div className="text-[7px] md:text-[11px] uppercase tracking-wide md:tracking-widest text-ink-mute">{group}</div>
                <button
                  onClick={() => {
                    const groupKeys = list.map((p) => p.key);
                    const allOn = groupKeys.every((k) => perms.includes(k));
                    if (allOn) setPermsState(perms.filter((p) => !groupKeys.includes(p)));
                    else setPermsState([...new Set([...perms, ...groupKeys])]);
                  }}
                  className="text-[10px] text-ink-mute hover:text-ink underline"
                >
                  Toggle all
                </button>
              </div>
              <div className="mt-1.5 space-y-1">
                {list.map((p) => (
                  <label key={p.key} className="flex items-start gap-2 text-[10px] md:text-xs cursor-pointer leading-snug">
                    <input type="checkbox" checked={perms.includes(p.key)} onChange={() => toggle(p.key)} />
                    {p.label}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end sticky bottom-0 bg-card pt-2 md:pt-3">
          {canEdit ? (
            <button onClick={save} disabled={setPerms.isPending || update.isPending} className="btn btn-primary">
              <UserCog className="w-4 h-4" /> Save permissions
            </button>
          ) : (
            <span className="text-xs text-ink-mute">View only</span>
          )}
        </div>
      </fieldset>
    </div>
  );
}

/**
 * Overflow-safe salary card. Uses:
 *   • `min-w-0` on the card so grid children can shrink,
 *   • `break-words` so extremely long formatted currencies wrap
 *     rather than blowing out the card width,
 *   • a responsive font clamp so numbers scale down before they
 *     would clip on narrow viewports.
 */
function SalaryStat({
  label,
  value,
  tone,
  textual,
}: {
  label: string;
  value: string;
  tone?: "success" | "danger";
  textual?: boolean;
}) {
  return (
    <div className="paper-card p-2 md:p-3 min-w-0 overflow-hidden">
      <div className="text-[7px] md:text-[10px] uppercase tracking-wide md:tracking-widest text-ink-mute truncate">
        {label}
      </div>
      <div
        className={cn(
          "font-display font-bold mt-0.5 md:mt-1 leading-tight break-words",
          !textual && "num",
          textual && "capitalize",
          "text-[12px] sm:text-sm md:text-lg",
          tone === "success" && "text-success",
          tone === "danger" && "text-danger"
        )}
        title={value}
      >
        <MoneyText value={value} />
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "success" | "danger" }) {
  return (
    <div className="paper-card p-2 md:p-3 min-w-0 overflow-hidden">
      <div className="text-[7px] md:text-[10px] uppercase tracking-wide md:tracking-widest text-ink-mute truncate">{label}</div>
      <div className={cn(
        "font-display text-[12px] md:text-lg font-bold num mt-0.5 leading-tight break-words",
        tone === "success" && "text-success",
        tone === "danger" && "text-danger"
      )}><MoneyText value={value} /></div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <SharedField label={label}>{children}</SharedField>;
}

/**
 * Self-service photo. Gated by the `users.avatar` permission and limited to
 * the signed-in employee's own account, so nobody can set somebody else's
 * picture. Admins keep it through `can()`.
 */
function SelfPhotoButton({
  employee,
  className,
}: {
  employee: Employee;
  className?: string;
}) {
  const update = useUpdateEmployee();
  const [busy, setBusy] = useState(false);

  const pick = async (file: File) => {
    setBusy(true);
    try {
      const avatarUrl = await processImageFile(file, "avatars");
      update.mutate(
        { id: employee.id, avatarUrl },
        {
          onSuccess: () => toast.success("Photo updated"),
          onError: (err) =>
            toast.error(err instanceof Error ? err.message : "Upload failed"),
        }
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <label
      className={cn(
        "btn btn-outline btn-sm cursor-pointer max-md:w-7 max-md:px-0",
        className
      )}
      title="Upload your own photo"
    >
      <Upload className="w-3.5 h-3.5" />
      <span className="hidden sm:inline">{busy ? "Uploading..." : "My photo"}</span>
      <input
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void pick(f);
        }}
      />
    </label>
  );
}

/**
 * Admin view of every team photo in one grid, with the people who still need
 * to add one. Admin-only (gated by `employees.manage` at the call site).
 */
function AvatarsModal({
  employees,
  onClose,
}: {
  employees: Employee[];
  onClose: () => void;
}) {
  const withPhoto = employees.filter((e) => !!e.avatarUrl);
  const withoutPhoto = employees.filter((e) => !e.avatarUrl);

  return (
    <div className="fixed inset-0 z-50 bg-ink/50 flex items-end md:items-center justify-center p-0 md:p-4 animate-fade-in">
      <div className="team-modal paper-card w-full max-w-3xl overflow-hidden max-h-[95dvh] flex flex-col rounded-t-2xl md:rounded-xl">
        <div className="px-2.5 py-2 md:p-4 border-b flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <div className="text-[8px] md:text-[10px] uppercase tracking-wide md:tracking-widest text-ink-mute">
              Team photos
            </div>
            <h2 className="font-display text-base md:text-xl font-bold truncate">
              Everyone
            </h2>
            <p className="text-[10px] text-ink-mute md:text-xs md:mt-0.5">
              {withPhoto.length} of {employees.length} with a photo
            </p>
          </div>
          <button onClick={onClose} className="btn btn-outline btn-sm h-7 w-7 p-0 shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-y-auto scroll-lined flex-1 p-2.5 md:p-4">
          {employees.length === 0 ? (
            <div className="p-8 text-center text-ink-mute text-sm">
              No team members yet.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-1.5 md:gap-2">
                {employees.map((e) => (
                  <div
                    key={e.id}
                    className="paper-card p-1.5 md:p-2 flex flex-col items-center gap-1 text-center min-w-0"
                  >
                    <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-magenta-reg/10 text-magenta-reg font-bold text-sm md:text-base flex items-center justify-center shrink-0 overflow-hidden">
                      {e.avatarUrl ? (
                        <img src={e.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        employeeInitials(e.fullName || e.name)
                      )}
                    </div>
                    <div className="min-w-0 w-full">
                      <div className="text-[10px] md:text-[11px] font-semibold truncate">
                        {e.name}
                      </div>
                      <div className="text-[9px] md:text-[10px] text-ink-mute truncate">
                        {e.role}
                      </div>
                    </div>
                    {!e.avatarUrl && (
                      <span className="chip border border-yellow-reg/30 bg-yellow-reg/10 text-yellow-reg text-[8px] md:text-[9px]">
                        No photo
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {withoutPhoto.length > 0 && (
                <p className="mt-2 text-[10px] text-ink-mute">
                  {withoutPhoto.length} team member
                  {withoutPhoto.length === 1 ? "" : "s"} without a photo — grant
                  them the &ldquo;Upload own photo&rdquo; permission.
                </p>
              )}
            </>
          )}
        </div>

        <div className="border-t p-2.5 md:p-3 flex items-center justify-end shrink-0">
          <button onClick={onClose} className="btn btn-primary btn-sm">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function TabHeader({
  icon: Icon,
  kicker,
  title,
  meta,
  actions,
}: {
  icon: LucideIcon;
  kicker: string;
  title?: string;
  meta?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-line/70 pb-2 md:flex-row md:items-center md:justify-between md:gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-brand/40 bg-brand/10 text-ink md:h-8 md:w-8">
          <Icon className="h-3.5 w-3.5 md:h-4 md:w-4" strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <div className="text-[7px] uppercase tracking-[0.14em] text-ink-mute md:text-[9px]">
            {kicker}
          </div>
          {title && (
            <h2 className="font-display text-sm font-bold leading-tight md:text-lg">{title}</h2>
          )}
          {meta && <div className="text-[9px] text-ink-mute md:text-[10px]">{meta}</div>}
        </div>
      </div>
      {actions && (
        <div className="flex min-w-0 items-center gap-1.5 self-start md:self-auto">
          {actions}
        </div>
      )}
    </div>
  );
}
