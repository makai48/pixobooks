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
  UserCheck,
  Clock3,
  Home,
  Calendar as CalIcon,
  Contact2,
} from "lucide-react";
import {
  useEmployees,
  useUpdateEmployee,
  useSetPermissions,
  useInviteEmployee,
  useDeleteEmployee,
  type InviteEmployeeResult,
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
  const del = useDeleteEmployee();

  const canManage = can("employees.manage");
  const canDelete = can("employees.delete") || isAppOwner;

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
    <div className="p-4 md:p-6 flex flex-col gap-4 h-full">
      <SubNav
        items={[
          { to: "/employees", label: "Team", icon: UserCog },
          { to: "/payroll-history", label: "Payroll", icon: Wallet },
          { to: "/account-approvals", label: "Approvals", icon: UserCheck },
          { to: "/password-resets", label: "Password Resets", icon: KeyRound },
          { to: "/audit-log", label: "Audit Log", icon: Shield },
        ]}
      />
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 flex-1 min-h-0">
      <div className="paper-card overflow-hidden flex flex-col">
        <div className="p-4 border-b flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-widest text-ink-mute">Team members</div>
            <h2 className="font-display text-lg font-bold">All employees</h2>
            <p className="text-xs text-ink-mute mt-1">Add, edit or remove any account below.</p>
          </div>
          {canManage && (
            <button
              onClick={() => {
                if (!canAddUser(employees.length, settings)) {
                  upgradeToast(`More than ${getPlanLimits(settings).users} team members`);
                  return;
                }
                setInviteOpen(true);
              }}
              className="btn btn-primary h-9 px-3 shrink-0"
            >
              <UserPlus className="w-4 h-4" />
              <span className="hidden sm:inline">Add</span>
            </button>
          )}
        </div>
        <div className="flex-1 overflow-auto max-h-[40vh] lg:max-h-none scroll-lined">
          {isLoading ? (
            <div className="p-6 text-ink-mute text-sm">Loading...</div>
          ) : employees.length === 0 ? (
            <div className="p-6 text-ink-mute text-sm text-center">No employees yet.</div>
          ) : (
            employees.map((e) => (
              <div
                key={e.id}
                className={cn(
                  "w-full p-3 border-b flex items-center gap-2 transition",
                  selected?.id === e.id ? "bg-paper" : "hover:bg-paper/50"
                )}
              >
                <button
                  onClick={() => setSelectedId(e.id)}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-magenta-reg/10 text-magenta-reg font-bold flex items-center justify-center shrink-0 overflow-hidden">
                    {e.avatarUrl ? (
                      <img src={e.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      e.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate flex items-center gap-1.5">
                      <span className="truncate">{e.name}</span>
                      {e.id === profile?.id && (
                        <span className="text-[10px] uppercase tracking-widest text-magenta-reg">you</span>
                      )}
                    </div>
                    <div className="text-[11px] text-ink-mute truncate flex items-center gap-1">
                      <span>{e.role} · {e.permissions.length} perms</span>
                    </div>
                    <ApprovalPill status={e.approvalStatus} mustChange={e.mustChangePassword} />
                  </div>
                  {e.active ? (
                    <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 text-ink-mute shrink-0" />
                  )}
                </button>
                {canDelete && !isShopOwner(e.email, e.role) && e.id !== profile?.id && (
                  <button
                    onClick={() => handleDelete(e)}
                    className="btn btn-ghost h-8 w-8 p-0 text-danger shrink-0"
                    title="Delete employee (permanent)"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
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
                { k: "profile", label: "Profile", icon: UserIcon, perm: "employees.manage" },
                { k: "payroll", label: "Payroll", icon: Wallet, perm: "employees.payroll" },
                { k: "attendance", label: "Attendance", icon: CalendarDays, perm: "employees.attendance" },
                { k: "permissions", label: "Permissions", icon: Shield, perm: "employees.manage" },
              ] as { k: TabKey; label: string; icon: import("lucide-react").LucideIcon; perm: Permission }[]
            )
              .filter((t) => can(t.perm))
              .map(({ k, label, icon: Icon }) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={cn(
                    "px-4 h-12 flex items-center gap-2 text-sm font-semibold border-b-2 transition whitespace-nowrap",
                    tab === k
                      ? "border-magenta-reg text-magenta-reg"
                      : "border-transparent text-ink-mute hover:text-ink"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
          </div>

          <div className="flex-1 overflow-auto p-4 md:p-6 scroll-lined">
            {tab === "profile" && (
              <ProfileTab
                employee={selected}
                onDelete={() => handleDelete(selected)}
                canDelete={canDelete && !isShopOwner(selected.email, selected.role) && selected.id !== profile?.id}
              />
            )}
            {tab === "payroll" && <PayrollTab employee={selected} />}
            {tab === "attendance" && <AttendanceTab employee={selected} />}
            {tab === "permissions" && <PermissionsTab employee={selected} />}
          </div>
        </div>
      ) : (
        <div className="paper-card p-10 text-center text-ink-mute">
          Select an employee or add a new one.
        </div>
      )}

      {inviteOpen && <InviteEmployeeModal onClose={() => setInviteOpen(false)} />}
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
        actor: profile ? { id: profile.id, name: profile.name, role: profile.role } : undefined,
      });
      setResult(r);
      toast.success(`Account created — share temp password with ${r.email}`);
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
                here for you to share. The account starts as{" "}
                <span className="font-semibold text-ink">Inactive / Pending</span>
                . On first login the employee triggers an approval request. Only
                after you approve does the account activate — and the first
                sign-in after approval forces a permanent password.
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
                  <div className="mt-1 relative">
                    <CalIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
                    <input
                      type="date"
                      value={form.hireDate}
                      onChange={(e) => setForm({ ...form, hireDate: e.target.value })}
                      className="input pl-9"
                    />
                  </div>
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
                <select
                  value={form.hours}
                  onChange={(e) => setForm({ ...form, hours: Number(e.target.value) })}
                  className="input mt-1"
                >
                  {TEMP_PASSWORD_HOUR_PRESETS.map((h) => (
                    <option key={h} value={h}>
                      {formatHours(h)}
                    </option>
                  ))}
                </select>
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
  shopName,
  onClose,
  onInviteAnother,
}: {
  result: InviteEmployeeResult;
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

  return (
    <div className="p-5 space-y-4">
      <div className="w-14 h-14 rounded-full bg-success/10 mx-auto flex items-center justify-center">
        <UserCheck className="w-6 h-6 text-success" />
      </div>
      <div className="text-center">
        <h3 className="font-display text-lg font-bold">Account created — pending approval</h3>
        <p className="text-xs text-ink-mute mt-1">
          The account is already email-verified and can sign in immediately
          with the temporary password below. Share these credentials with{" "}
          <span className="font-semibold text-ink">{result.name}</span> via
          the buttons below (email, SMS or WhatsApp). Once they sign in an
          approval request will appear in your Account Approvals list.
        </p>
      </div>

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <a
          href={`mailto:${encodeURIComponent(result.email)}?subject=${encodeURIComponent(`Your ${shopName} login (temporary password)`)}&body=${encodeURIComponent(message)}`}
          className="btn btn-primary h-10"
        >
          <Mail className="w-4 h-4" /> Email to invitee
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
      <p className="text-[10px] text-ink-mute text-center">
        "Email to invitee" opens your default mail client with these credentials
        pre-filled — recipient, subject and body are ready to send. This is the
        recommended delivery method; the app itself does not send emails.
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

Please sign in with the temporary password above. Your first sign-in will
send an approval request to the shop owner. Once approved, sign in again —
you'll be asked to set a permanent password of your own.

— ${opts.shopName}`;
}

function formatHours(h: number): string {
  if (h < 48) return `${h} hours`;
  if (h < 168) return `${Math.round(h / 24)} days`;
  if (h < 720) return `${Math.round(h / 168)} weeks`;
  return `${Math.round(h / 720)} months`;
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
          <input type="date" value={form.hireDate} onChange={(e) => setForm({ ...form, hireDate: e.target.value })} className="input mt-1" />
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
    <div className="space-y-6">
      {/*
        Overflow-safe salary stat grid. Uses `min-w-0`, `break-words` and a
        responsive font size so very large currency values (e.g. "10,000,000
        UGX") remain fully visible inside every card at every viewport.
      */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
          <select value={salary.currency} onChange={(e) => setSalary({ ...salary, currency: e.target.value })} className="input mt-1">
            {CURRENCIES.map((c) => (<option key={c.code} value={c.code}>{c.symbol} {c.code}</option>))}
          </select>
        </Field>
        <Field label="Base pay cycle">
          <select value={salary.payCycle} onChange={(e) => setSalary({ ...salary, payCycle: e.target.value as EmployeeSalary["payCycle"] })} className="input mt-1">
            <option value="monthly">Monthly</option>
            <option value="biweekly">Bi-weekly</option>
            <option value="weekly">Weekly</option>
          </select>
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
                  <select id={`emp-allow-type-${i}`} value={a.type} onChange={(e) => updateAllowance(i, { type: e.target.value as "fixed" | "percentage" })} className="input mt-1">
                    <option value="fixed">Fixed</option>
                    <option value="percentage">% of base</option>
                  </select>
                </div>
                <div className="col-span-6 md:col-span-2">
                  <label htmlFor={`emp-allow-amount-${i}`} className="label">Amount {a.type === "percentage" ? "(%)" : `(${salary.currency})`}</label>
                  <input id={`emp-allow-amount-${i}`} type="number" step="0.01" min={0} value={a.amount} onChange={(e) => updateAllowance(i, { amount: Number(e.target.value) })} className="input mt-1 num text-right" />
                </div>
                <div className="col-span-10 md:col-span-3">
                  <label htmlFor={`emp-allow-cycle-${i}`} className="label">Pay cycle</label>
                  <select
                    id={`emp-allow-cycle-${i}`}
                    value={a.payCycle || salary.payCycle}
                    onChange={(e) => updateAllowance(i, { payCycle: e.target.value as Allowance["payCycle"] })}
                    className="input mt-1"
                  >
                    <option value="daily">Daily (per day present)</option>
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Bi-weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="annually">Annually</option>
                  </select>
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

      <div className="flex justify-end sticky bottom-0 bg-card pt-3">
        <button onClick={save} disabled={update.isPending} className="btn btn-primary">
          <Save className="w-4 h-4" /> Save payroll
        </button>
      </div>
    </div>
  );
}

/* Attendance tab */
function AttendanceTab({ employee }: { employee: Employee }) {
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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
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
            <button key={i} onClick={() => cycleStatus(d, record?.status)} disabled={!inMonth} className={cn("aspect-square border rounded-md text-xs flex flex-col items-center justify-center transition", !inMonth && "opacity-30 cursor-default", meta?.color, isToday && "ring-2 ring-magenta-reg")} title={meta?.label || "Click to mark"}>
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
          <div key={group} className="paper-card p-4">
            <div className="flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-widest text-ink-mute">{group}</div>
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
                <label key={p.key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={perms.includes(p.key)} onChange={() => toggle(p.key)} />
                  {p.label}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end sticky bottom-0 bg-card pt-3">
        <button onClick={save} disabled={setPerms.isPending} className="btn btn-primary">
          <UserCog className="w-4 h-4" /> Save permissions
        </button>
      </div>
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
    <div className="paper-card p-3 min-w-0 overflow-hidden">
      <div className="text-[10px] uppercase tracking-widest text-ink-mute truncate">
        {label}
      </div>
      <div
        className={cn(
          "font-display font-bold mt-1 leading-tight break-words",
          !textual && "num",
          textual && "capitalize",
          "text-base sm:text-lg md:text-xl",
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
    <div className="paper-card p-3 min-w-0 overflow-hidden">
      <div className="text-[10px] uppercase tracking-widest text-ink-mute truncate">{label}</div>
      <div className={cn(
        "font-display text-lg font-bold num mt-0.5 leading-tight break-words",
        tone === "success" && "text-success",
        tone === "danger" && "text-danger"
      )}>{value}</div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <SharedField label={label}>{children}</SharedField>;
}
