import { useState } from "react";
import { Briefcase, Shield, Store, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  getActiveBusinessId,
  useActiveBusiness,
  useCreateBusiness,
  type LegacyOwnerAccess,
  type MasterScope,
} from "@/hooks/useBusinesses";
import { setActiveBranch, useBranches, useCreateBranch } from "@/hooks/useBranches";
import { useShopSettings } from "@/hooks/useShopSettings";
import { canAddBranch, getPlanLimits } from "@/lib/billing";
import GlassSelect from "@/components/ui/GlassSelect";
import { upgradeToast } from "@/components/billing/UpgradePrompt";
import { cn } from "@/lib/utils";

const ACCESS_LABELS: Record<LegacyOwnerAccess, string> = {
  none: "No cross-business access",
  platform_admin: "Platform admin (metadata only)",
  supreme: "Supreme admin (full access)",
  delegate: "Delegate by email",
};

type Mode = "business" | "branch";

export default function CreateWorkspaceDialog({
  initialMode = "business",
  onClose,
}: {
  initialMode?: Mode;
  onClose: () => void;
}) {
  const { profile, can } = useAuth();
  const { data: branches = [] } = useBranches();
  const { data: settings } = useShopSettings();
  const createBusiness = useCreateBusiness();
  const createBranch = useCreateBranch();
  const activeBusiness = useActiveBusiness();

  const canManageBranches =
    activeBusiness !== "none" &&
    (profile?.role?.toLowerCase() === "admin" ||
      (profile?.role || "").toLowerCase().includes("manager") ||
      can("settings.manage"));

  const [mode, setMode] = useState<Mode>(canManageBranches ? initialMode : "business");

  const [bizName, setBizName] = useState("");
  const [scope, setScope] = useState<MasterScope>("shared");
  const [access, setAccess] = useState<LegacyOwnerAccess>("none");
  const [emails, setEmails] = useState("");
  const [branchName, setBranchName] = useState("");

  const pending = createBusiness.isPending || createBranch.isPending;

  const submitBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bizName.trim()) return toast.error("Business name is required");

    const delegates =
      access === "delegate"
        ? emails
            .split(/[\s,;]+/)
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
    if (access === "delegate" && delegates.length === 0) {
      return toast.error("Add at least one delegate email");
    }
    if (delegates.some((addr) => !addr.includes("@"))) {
      return toast.error("Check the delegate email addresses");
    }

    try {
      await createBusiness.mutateAsync({
        name: bizName.trim(),
        masterScope: scope,
        legacyOwnerAccess: access,
        legacyOwnerEmails: delegates,
      });
      toast.success("Business created");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create business");
    }
  };

  const submitBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchName.trim()) return toast.error("Branch name is required");
    if (!getActiveBusinessId()) return toast.error("Choose a business first");
    if (!canAddBranch(branches.length, settings)) {
      upgradeToast(`More than ${getPlanLimits(settings).branches} branches`);
      return;
    }
    try {
      const branch = await createBranch.mutateAsync(branchName.trim());
      setActiveBranch(branch.id);
      toast.success(`Branch "${branch.name}" created`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create branch");
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-ink/40 flex items-center justify-center p-4 animate-fade-in">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={mode === "business" ? "Create business" : "Create branch"}
        className="paper-card w-full max-w-lg overflow-hidden"
      >
        <div className="p-5 border-b flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-ink-mute">
              Workspace
            </div>
            <h2 className="font-display text-xl font-bold">
              {mode === "business" ? "Create business" : "Create branch"}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 p-4 border-b bg-ink/[0.03]">
          <ModeTab
            active={mode === "business"}
            onClick={() => setMode("business")}
            icon={<Briefcase className="w-4 h-4" />}
            label="Business"
            hint="Independent shop"
          />
          {canManageBranches && (
            <ModeTab
              active={mode === "branch"}
              onClick={() => setMode("branch")}
              icon={<Store className="w-4 h-4" />}
              label="Branch"
              hint="Location in this business"
            />
          )}
        </div>

        {mode === "business" ? (
          <form onSubmit={submitBusiness} className="p-5 space-y-5">
            <div>
              <label htmlFor="ws-biz-name" className="label">Business name</label>
              <input
                id="ws-biz-name"
                autoFocus
                required
                value={bizName}
                onChange={(e) => setBizName(e.target.value)}
                className="input mt-1"
                placeholder="e.g. Northwind Traders"
              />
            </div>

            <fieldset>
              <legend className="label">Items, customers &amp; suppliers</legend>
              <div className="grid sm:grid-cols-2 gap-2 mt-1">
                <ScopeCard
                  checked={scope === "shared"}
                  onSelect={() => setScope("shared")}
                  title="Shared"
                  description="One catalogue visible to every branch."
                />
                <ScopeCard
                  checked={scope === "per_branch"}
                  onSelect={() => setScope("per_branch")}
                  title="Per branch"
                  description="Each branch keeps its own masters."
                />
              </div>
            </fieldset>

            <div>
              <label htmlFor="ws-legacy" className="label">Legacy admin access</label>
              <GlassSelect
                id="ws-legacy"
                value={access}
                onChange={(v) => setAccess(v as LegacyOwnerAccess)}
                ariaLabel="Legacy admin access"
                options={(Object.keys(ACCESS_LABELS) as LegacyOwnerAccess[]).map((key) => ({
                  value: key,
                  label: ACCESS_LABELS[key],
                }))}
                className="input select-glass mt-1"
              />
              <p className="mt-1 text-xs text-ink-mute flex items-start gap-1">
                <Shield className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                Controls whether the existing shop admin can reach this business.
              </p>
              {access === "delegate" && (
                <input
                  value={emails}
                  onChange={(e) => setEmails(e.target.value)}
                  className="input mt-2"
                  placeholder="admin@example.com, partner@example.com"
                  aria-label="Delegate emails"
                />
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button type="button" onClick={onClose} className="btn btn-outline">
                Cancel
              </button>
              <button type="submit" disabled={pending} className="btn btn-primary">
                {createBusiness.isPending ? "Creating..." : "Create business"}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={submitBranch} className="p-5 space-y-5">
            <div>
              <label htmlFor="ws-branch-name" className="label">Branch name</label>
              <input
                id="ws-branch-name"
                autoFocus
                required
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                className="input mt-1"
                placeholder="e.g. Downtown, Main Store, Warehouse"
              />
              <p className="mt-2 text-xs text-ink-mute">
                {branches.length} of {getPlanLimits(settings).branches} branches used on
                the current plan.
              </p>
            </div>

            <div className="rounded-lg border border-line bg-paper p-3 text-xs text-ink-mute">
              New sales, held tickets, expenses and purchase orders created while this
              branch is active will be tagged to it.
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button type="button" onClick={onClose} className="btn btn-outline">
                Cancel
              </button>
              <button type="submit" disabled={pending} className="btn btn-primary">
                {createBranch.isPending ? "Creating..." : "Create branch"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  icon,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-3 rounded-lg border-2 px-3 py-2 text-left transition",
        active
          ? "border-ink bg-card shadow-sm"
          : "border-transparent bg-transparent hover:bg-ink/5"
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-md",
          active ? "bg-ink text-paper" : "bg-ink/5 text-ink-mute"
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block truncate text-[11px] text-ink-mute">{hint}</span>
      </span>
    </button>
  );
}

function ScopeCard({
  checked,
  onSelect,
  title,
  description,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  description: string;
}) {
  return (
    <label
      className={cn(
        "cursor-pointer rounded-lg border-2 p-3",
        checked ? "border-ink bg-ink/5" : "border-line hover:border-ink/30"
      )}
    >
      <input type="radio" className="sr-only" checked={checked} onChange={onSelect} />
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span
          className={cn(
            "w-4 h-4 rounded-full border-2 flex items-center justify-center",
            checked ? "border-ink" : "border-ink/30"
          )}
        >
          {checked && <span className="w-2 h-2 rounded-full bg-ink" />}
        </span>
        {title}
      </div>
      <p className="mt-1 text-xs text-ink-mute">{description}</p>
    </label>
  );
}
