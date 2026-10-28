import { useMemo, useState } from "react";
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
import { useShopSettings } from "@/hooks/useShopSettings";
import {
  useAttendance,
  useUpsertAttendance,
  attendanceStats,
} from "@/hooks/useAttendance";
import {
  ALL_PERMISSIONS,
  ALL_PERMISSION_KEYS,
  DEFAULT_STAFF_PERMISSIONS,
  ATTENDANCE_META,
  CURRENCIES,
  isShopOwner,
  DEFAULT_TEMP_PASSWORD_HOURS,
  TEMP_PASSWORD_HOUR_PRESETS,
  type Employee,
  type Permission,
  type Allowance,
  type EmployeeSalary,
  type AttendanceStatus,
  type ApprovalStatus,
} from "@/types";
import { cn, formatCurrency, formatDate, getMonthMatrix } from "@/lib/utils";
import { processImageFile } from "@/lib/imageUpload";
import PhoneInput from "@/components/common/PhoneInput";
import GlassSelect from "@/components/ui/GlassSelect";
import GlassDatePicker from "@/components/ui/GlassDatePicker";
import SubNav from "@/components/layout/SubNav";
import SharedField from "@/components/common/Field";
import { canAddUser, getPlanLimits } from "@/lib/billing";
import { upgradeToast } from "@/components/billing/UpgradePrompt";

type TabKey = "profile" | "payroll" | "attendance" | "permissions";

export default function Employees() {
  const { profile, can, isAppOwner } = useAuth();
  const { data: employees = [], isLoading } = useEmployees();
  const { data: settings } = useShopSettings();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = employees.find((e) => e.id === selectedId) || employees[0];
  const [tab, setTab] = useState<TabKey>("profile");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitesOpen, setInvitesOpen] = useState(false);
  const del = useDeleteEmployee();

  const canInvite = can("employees.manage") || can("users.invite");
  const canDelete =
    can("employees.delete") || can("users.delete") || isAppOwner;

  const handleDelete = (e: Employee) => {
    if (isShopOwner(e.email, e.role)) {
      return toast.error("The shop owner account cannot be deleted");
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
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Delete failed"),
      }
    );
  };

  return (
    <div className="p-2.5 md:p-6 flex flex-col gap-2 md:gap-4 h-full">
      <SubNav
        items={[
          { to: "/employees", label: "Team", icon: UserCog },
          { to: "/payroll-history", label: "Payroll", icon: Wallet },
          { to: "/account-approvals", label: "Approvals", icon: UserCheck },
          { to: "/password-resets", label: "Password Resets", icon: KeyRound },
          { to: "/audit-log", label: "Audit Log", icon: Shield },
        ]}
      />
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-2 md:gap-4 flex-1 min-h-0">
      <div className="paper-card overflow-hidden flex flex-col">
        <div className="p-2.5 md:p-4 border-b flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[7px] md:text-[11px] uppercase tracking-wide md:tracking-widest text-ink-mute">Team members</div>
            <h2 className="font-display text-sm md:text-lg font-bold">All employees</h2>
            <p className="text-[10px] md:text-xs text-ink-mute mt-0.5 md:mt-1">Add, edit or remove any account below.</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setInvitesOpen(true)}
              className="btn btn-outline btn-sm"
              title="Sent invites — status, resend and revoke"
            >
              <Eye className="w-3.5 h-3.5 md:w-4 md:h-4" />
              <span className="hidden sm:inline">Invites</span>
            </button>
            {canInvite && (
              <button
                onClick={() => {
                  if (!canAddUser(employees.length, settings)) {
                    upgradeToast(`More than ${getPlanLimits(settings).users} team members`);
                    return;
                  }
                  setInviteOpen(true);
                }}
                className="btn btn-primary btn-sm"
              >
                <UserPlus className="w-3.5 h-3.5 md:w-4 md:h-4" />
                <span className="hidden sm:inline">Add</span>
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-auto max-h-[40vh] lg:max-h-none scroll-lined">
          {isLoading ? (
            <div className="p-4 md:p-6 text-ink-mute text-xs md:text-sm">Loading...</div>
          ) : employees.length === 0 ? (
            <div className="p-4 md:p-6 text-ink-mute text-xs md:text-sm text-center">No employees yet.</div>
          ) : (
            employees.map((e) => (
              <div
                key={e.id}
                className={cn(
                  "w-full p-1.5 md:p-3 border-b flex items-center gap-1.5 md:gap-2 transition",
                  selected?.id === e.id ? "bg-paper" : "hover:bg-paper/50"
                )}
              >
                <button
                  onClick={() => setSelectedId(e.id)}
                  className="flex items-center gap-2 md:gap-3 flex-1 min-w-0 text-left"
                >
                  <div className="w-7 h-7 md:w-10 md:h-10 rounded-full bg-magenta-reg/10 text-magenta-reg font-bold text-[10px] md:text-base flex items-center justify-center shrink-0 overflow-hidden">
                    {e.avatarUrl ? (
                      <img src={e.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      e.name.charAt(0).toUpperCase()
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
                    <ApprovalPill status={e.approvalStatus} mustChange={e.mustChangePassword} />
                  </div>
                  {e.active ? (
                    <CheckCircle2 className="w-3.5 h-3.5 md:w-4 md:h-4 text-success shrink-0" />
                  ) : (
                    <Circle className="w-3.5 h-3.5 md:w-4 md:h-4 text-ink-mute shrink-0" />
                  )}
                </button>
                {canDelete && !isShopOwner(e.email, e.role) && e.id !== profile?.id && (
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
        <div className="paper-card overflow-hidden flex flex-col">
          <div className="border-b flex overflow-x-auto scrollbar-none">
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
                    "px-2.5 md:px-4 h-9 md:h-12 flex items-center gap-1 md:gap-2 text-[10px] md:text-sm font-semibold border-b-2 transition whitespace-nowrap",
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

          <div className="flex-1 overflow-auto p-2.5 md:p-6 scroll-lined">
            {tab === "profile" && (
              <ProfileTab
                key={selected.id}
                employee={selected}
                onDelete={() => handleDelete(selected)}
                canDelete={canDelete && !isShopOwner(selected.email, selected.role) && selected.id !== profile?.id}
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
      ? { label: "Awaiting owner approval", color: "text-yellow-reg", icon: Clock3 }
      : { label: "Rejected", color: "text-danger", icon: X };
  const Icon = meta.icon;
  return (
    <span className={cn("mt-0.5 inline-flex items-center gap-1 text-[9px] uppercase tracking-widest", meta.color)}>
      <Icon className="w-2.5 h-2.5" /> {meta.label}
    </span>
  );
}

/* ---------- Invite Modal — full-profile creation ---------- */
function InviteEmployeeModal({ onClose }: { onClose: () => void }) {
  const { profile } = useAuth();
  const { data: modalSettings } = useShopSettings();
  const invite = useInviteEmployee();
  const [form, setForm] = useState({
    email: "",
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email.trim()) return toast.error("Email is required");
    if (!form.name.trim()) return toast.error("Display name is required");
    try {
      const r = await invite.mutateAsync({
        email: form.email.trim(),
        name: form.name.trim(),
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
      <div className="paper-card w-full max-w-2xl overflow-hidden max-h-[95dvh] flex flex-col rounded-t-2xl md:rounded-xl">
        <div className="p-4 md:p-5 border-b flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-widest text-ink-mute">
              Add employee
            </div>
            <h2 className="font-display text-lg md:text-xl font-bold truncate">
              {result ? "Share these credentials" : "Invite new team member"}
            </h2>
          </div>
          <button onClick={onClose} className="btn btn-ghost h-9 w-9 p-0 shrink-0">
            <X className="w-4 h-4" />
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
                setForm((f) => ({ ...f, email: "", name: "", phone: "", address: "" }));
              }}
            />
          ) : (
            <form onSubmit={submit} className="p-4 md:p-5 space-y-4">
              <p className="text-xs text-ink-mute">
                A secure temporary password will be generated and displayed
                here for you to share. The account is ready immediately — the
                employee signs in with that password and is asked to choose a
                permanent one before using the app. There is no approval step.
              </p>

              <SectionLabel>Identity</SectionLabel>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Display name *">
                  <input
                    autoFocus
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="input mt-1"
                    placeholder="e.g. Amara Nabatanzi"
                    required
                  />
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
                      placeholder="employee@printshop.co"
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
                <div className="text-[10px] text-ink-mute mt-1">
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
    <div className="text-[10px] uppercase tracking-widest text-ink-mute border-t pt-3">
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
        <p className="text-xs text-ink-mute mt-1">
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
        <FieldRow icon={<Clock className="w-3.5 h-3.5" />} label="Expires" value={new Date(result.expiresAt).toLocaleString()} />
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
      <p className="text-[10px] text-ink-mute text-center">
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
Expires:            ${new Date(opts.expiresAt).toLocaleString()}
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
 * This is the "+ view" next to the invite button: the owner can see who was
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
      <div className="paper-card w-full max-w-3xl overflow-hidden max-h-[95dvh] flex flex-col rounded-t-2xl md:rounded-xl">
        <div className="p-4 md:p-5 border-b flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-widest text-ink-mute">
              Users &amp; permissions
            </div>
            <h2 className="font-display text-lg md:text-xl font-bold truncate">
              Sent invites
            </h2>
            <p className="text-xs text-ink-mute mt-0.5">
              {invited.length} invite{invited.length === 1 ? "" : "s"} · status,
              resend and revoke
            </p>
          </div>
          <button onClick={onClose} className="btn btn-ghost h-9 w-9 p-0 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto scroll-lined flex-1 p-3 md:p-4 space-y-3">
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
                Expires {new Date(resent.expiresAt).toLocaleString()}
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
    <div className="space-y-4">
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
              ? new Date(employee.invitedAt).toLocaleString()
              : "—"
          }
        />
        <DetailRow
          label="Temp password expires"
          value={expires ? expires.toLocaleString() : "—"}
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

      <p className="text-[10px] text-ink-mute">
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
  const update = useUpdateEmployee();
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
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

  const save = () => {
    update.mutate(
      {
        id: employee.id,
        name: form.name,
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
      { onSuccess: () => toast.success("Profile saved") }
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
        <div className="w-20 h-20 rounded-full bg-magenta-reg/10 text-magenta-reg font-bold text-2xl flex items-center justify-center shrink-0 overflow-hidden">
          {form.avatarUrl ? <img src={form.avatarUrl} alt="" className="w-full h-full object-cover" /> : employee.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] uppercase tracking-widest text-ink-mute truncate">{employee.email}</div>
          <h2 className="font-display text-2xl font-bold break-words">{employee.name}</h2>
          <div className="text-xs text-ink-mute">Joined {formatDate(employee.createdAt)}</div>
          <ApprovalPill status={employee.approvalStatus} mustChange={employee.mustChangePassword} />
          {employee.tempPasswordExpiresAt && employee.mustChangePassword && (
            <div className="text-[10px] text-ink-mute mt-0.5">
              Temp password expires {new Date(employee.tempPasswordExpiresAt).toLocaleString()}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <label className="btn btn-outline h-9 cursor-pointer">
            <Upload className="w-4 h-4" />
            {uploading ? "Uploading..." : "Photo"}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); }} />
          </label>
          <div className="flex items-center gap-2 justify-end">
            <span className="text-xs text-ink-mute">Active</span>
            <button onClick={() => setForm({ ...form, active: !form.active })} className={cn("w-11 h-6 rounded-full transition relative", form.active ? "bg-success" : "bg-ink/20")}>
              <span className={cn("absolute top-0.5 w-5 h-5 rounded-full bg-white transition", form.active ? "left-[22px]" : "left-0.5")} />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Display name">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input mt-1" />
        </Field>
        <Field label="Role / Job title">
          <input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="input mt-1" placeholder="Cashier / Designer / Owner" />
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
        <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input mt-1 h-20" placeholder="Skills, certifications, availability..." />
      </Field>

      <div className="flex flex-col-reverse md:flex-row md:justify-between sticky bottom-0 bg-card pt-3 gap-2">
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
    update.mutate({ id: employee.id, salary }, { onSuccess: () => toast.success("Payroll saved") });
  };

  return (
    <fieldset
      disabled={!canEdit}
      className="space-y-6 border-0 p-0 m-0 min-w-0"
    >
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Base salary">
          <input type="number" step="0.01" min={0} value={salary.base} onChange={(e) => setSalary({ ...salary, base: Number(e.target.value) })} className="input mt-1 num text-right" />
        </Field>
        <Field label="Currency">
          <GlassSelect
            value={salary.currency}
            onChange={(v) => setSalary({ ...salary, currency: v })}
            ariaLabel="Salary currency"
            options={CURRENCIES.map((c) => ({ value: c.code, label: `${c.symbol} ${c.code}` }))}
            className="input select-glass mt-1"
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
            className="input select-glass mt-1"
          />
        </Field>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="font-display font-bold">Allowances</div>
            <div className="text-xs text-ink-mute">Housing, transport, meals, medical, bonuses — each with its own pay cycle.</div>
          </div>
          <button onClick={addAllowance} className="btn btn-outline h-9">
            <Plus className="w-4 h-4" /> Add allowance
          </button>
        </div>
        {salary.allowances.length === 0 ? (
          <div className="p-4 border border-dashed rounded-md text-sm text-ink-mute text-center">
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
                  <input id={`emp-allow-amount-${i}`} type="number" step="0.01" min={0} value={a.amount} onChange={(e) => updateAllowance(i, { amount: Number(e.target.value) })} className="input mt-1 num text-right" />
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

      <div className="flex justify-end items-center gap-2 sticky bottom-0 bg-card pt-3">
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
function AttendanceTab({ employee }: { employee: Employee }) {
  const { can } = useAuth();
  const canEdit = can("employees.attendance");
  const [month, setMonth] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; });
  const upsert = useUpsertAttendance();

  const from = new Date(month.year, month.month, 1).toISOString().slice(0, 10);
  const to = new Date(month.year, month.month + 1, 0).toISOString().slice(0, 10);
  const { data: records = [] } = useAttendance(employee.id, from, to);

  const stats = attendanceStats(records);
  const days = getMonthMatrix(month.year, month.month);

  const changeMonth = (dir: -1 | 1) => setMonth((m) => { const d = new Date(m.year, m.month + dir, 1); return { year: d.getFullYear(), month: d.getMonth() }; });

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

  const monthName = new Date(month.year, month.month, 1).toLocaleString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 md:grid-cols-5 gap-1.5 md:gap-2">
        <Stat label="Present" value={String(stats.present)} tone="success" />
        <Stat label="Half-day" value={String(stats.halfday)} />
        <Stat label="Leave" value={String(stats.leave)} />
        <Stat label="Absent" value={String(stats.absent)} tone="danger" />
        <Stat label="Hours" value={`${stats.totalHours}h`} />
      </div>

      <div className="flex items-center justify-between">
        <button onClick={() => changeMonth(-1)} className="btn btn-ghost"><ChevronLeft className="w-4 h-4" /></button>
        <div className="font-display text-lg font-bold">{monthName}</div>
        <button onClick={() => changeMonth(1)} className="btn btn-ghost"><ChevronRight className="w-4 h-4" /></button>
      </div>
      {!canEdit && (
        <div className="text-xs text-ink-mute">
          View only — the employees.attendance permission is required to mark days.
        </div>
      )}

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-widest text-ink-mute">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (<div key={d} className="pb-1">{d}</div>))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d, i) => {
          const inMonth = d.getMonth() === month.month;
          const iso = d.toISOString().slice(0, 10);
          const record = records.find((r) => r.date === iso);
          const meta = record ? ATTENDANCE_META[record.status] : null;
          const isToday = iso === new Date().toISOString().slice(0, 10);
          return (
            <button key={i} onClick={() => canEdit && cycleStatus(d, record?.status)} disabled={!inMonth || !canEdit} className={cn("aspect-square border rounded-md text-xs flex flex-col items-center justify-center transition", !inMonth && "opacity-30 cursor-default", meta?.color, isToday && "ring-2 ring-magenta-reg")} title={canEdit ? (meta?.label || "Click to mark") : "View only"}>
              <div className="text-[11px] font-semibold">{d.getDate()}</div>
              {meta && <div className="text-[10px] font-bold mt-0.5">{meta.symbol}</div>}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2 text-[11px]">
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

  const applyPreset = (preset: "cashier" | "manager" | "designer" | "owner" | "none") => {
    if (preset === "owner") { setPermsState([...ALL_PERMISSION_KEYS]); setRole("Owner"); }
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
    setPerms.mutate({ id: employee.id, permissions: perms }, { onSuccess: () => toast.success("Permissions saved") });
    if (role !== employee.role) update.mutate({ id: employee.id, role });
  };

  return (
    <div className="space-y-4">
      {!canEdit && (
        <div className="text-xs text-ink-mute">
          View only — the employees.manage or users.permissions permission is required to change
          permissions.
        </div>
      )}

      <fieldset disabled={!canEdit} className="space-y-4 border-0 p-0 m-0 min-w-0">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-ink-mute" />
            <div>
              <div className="font-display font-bold">Permissions ({perms.length}/{ALL_PERMISSION_KEYS.length})</div>
              <div className="text-xs text-ink-mute">Same per-user permissions apply on desktop and mobile.</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="label inline-flex items-center gap-1"><Sparkles className="w-3 h-3" /> Presets:</span>
            <button onClick={() => applyPreset("cashier")} className="chip border hover:bg-ink/5">Cashier</button>
            <button onClick={() => applyPreset("designer")} className="chip border hover:bg-ink/5">Designer</button>
            <button onClick={() => applyPreset("manager")} className="chip border hover:bg-ink/5">Manager</button>
            <button onClick={() => applyPreset("owner")} className="chip bg-magenta-reg/10 text-magenta-reg border border-magenta-reg/30">Owner (all)</button>
            <button onClick={() => applyPreset("none")} className="chip border hover:bg-ink/5">Clear</button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {[...grouped.entries()].map(([group, list]) => (
            <div key={group} className="paper-card p-2.5 md:p-4">
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
              <div className="mt-2 space-y-1.5">
                {list.map((p) => (
                  <label key={p.key} className="flex items-center gap-2 text-[11px] md:text-sm cursor-pointer">
                    <input type="checkbox" checked={perms.includes(p.key)} onChange={() => toggle(p.key)} />
                    {p.label}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end sticky bottom-0 bg-card pt-3">
          {canEdit ? (
            <button onClick={save} disabled={setPerms.isPending} className="btn btn-primary">
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
        {value}
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
      )}>{value}</div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <SharedField label={label}>{children}</SharedField>;
}
