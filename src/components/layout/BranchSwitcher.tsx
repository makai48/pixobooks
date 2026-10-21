import { useEffect, useRef, useState } from "react";
import { Building2, Check, ChevronDown, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useBranches,
  useCreateBranch,
  useDeleteBranch,
  useActiveBranch,
  setActiveBranch,
  type Branch,
} from "@/hooks/useBranches";
import { useShopSettings } from "@/hooks/useShopSettings";
import { canAddBranch, getPlanLimits } from "@/lib/billing";
import { upgradeToast } from "@/components/billing/UpgradePrompt";

/**
 * Shop / branch switcher (TopBar). Device-local context: new sales + held
 * tickets are tagged with the active branch; "All branches" tags nothing
 * (legacy-compatible). Staff assigned to a branch (profile.branchId) only see
 * that branch; owners/managers see and manage all. Branch assignment itself
 * is done by the owner (Table Editor for now).
 */
export default function BranchSwitcher() {
  const { profile, can } = useAuth();
  const { data: branches = [], isLoading } = useBranches();
  const { data: settings } = useShopSettings();
  const activeId = useActiveBranch();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const create = useCreateBranch();
  const del = useDeleteBranch();

  const privileged =
    profile?.role?.toLowerCase() === "owner" ||
    (profile?.role || "").toLowerCase().includes("manager") ||
    can("settings.manage");
  const assignedId: string | null = profile?.branchId || null;
  const visible: Branch[] =
    !privileged && assignedId ? branches.filter((b) => b.id === assignedId) : branches;

  useEffect(() => {
    if (!isLoading && activeId !== "all" && !branches.some((b) => b.id === activeId)) {
      setActiveBranch("all");
    }
  }, [isLoading, activeId, branches]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const current = branches.find((b) => b.id === activeId) || null;

  const pick = (id: string | "all") => {
    setActiveBranch(id);
    setOpen(false);
    const b = branches.find((x) => x.id === id);
    toast.success(id === "all" ? "All branches active" : `${b?.name || "Branch"} active`);
  };

  const addBranch = async () => {
    if (!draft.trim()) return toast.error("Enter a branch name first");
    if (!canAddBranch(branches.length, settings)) {
      upgradeToast(`More than ${getPlanLimits(settings).branches} branches`);
      return;
    }
    try {
      const b = await create.mutateAsync(draft);
      setDraft("");
      pick(b.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create branch");
    }
  };

  const removeBranch = async (b: Branch) => {
    if (branches.length <= 1) return toast.error("Keep at least one branch");
    if (!confirm(`Delete branch "${b.name}"? Existing sales keep working (branch link is cleared).`)) return;
    try {
      await del.mutateAsync(b.id);
      toast.success(`Branch "${b.name}" deleted`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete branch");
    }
  };

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn btn-ghost h-11 px-3 flex items-center gap-2 max-w-[220px]"
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Switch shop / branch"
      >
        <Building2 className="w-5 h-5 shrink-0" />
        <span className="truncate text-xs font-semibold hidden sm:inline">
          {isLoading ? "Branches…" : current ? current.name : "All branches"}
        </span>
        <ChevronDown className="w-4 h-4 shrink-0" />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-64 paper-card p-2 z-50" role="listbox" aria-label="Branches">
          <button
            type="button"
            role="option"
            aria-selected={activeId === "all"}
            onClick={() => pick("all")}
            className="w-full flex items-center gap-2 px-3 h-10 rounded-lg text-sm hover:bg-ink/5"
          >
            <span className="w-4">{activeId === "all" && <Check className="w-4 h-4" />}</span>
            <span className="font-semibold">All branches</span>
          </button>
          {visible.map((b) => (
            <div key={b.id} className="flex items-center gap-1">
              <button
                type="button"
                role="option"
                aria-selected={activeId === b.id}
                onClick={() => pick(b.id)}
                className="flex-1 flex items-center gap-2 px-3 h-10 rounded-lg text-sm hover:bg-ink/5 min-w-0"
              >
                <span className="w-4 shrink-0">{activeId === b.id && <Check className="w-4 h-4" />}</span>
                <span className="truncate">{b.name}</span>
                {b.isHeadOffice && (
                  <span className="text-[10px] uppercase tracking-widest text-ink-mute shrink-0">HQ</span>
                )}
              </button>
              {privileged && !b.isHeadOffice && (
                <button
                  type="button"
                  onClick={() => removeBranch(b)}
                  className="btn btn-ghost h-8 w-8 p-0 text-danger shrink-0"
                  title={`Delete ${b.name}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
          {privileged && (
            <div className="mt-2 pt-2 border-t border-line flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addBranch();
                }}
                placeholder="New branch name"
                className="input h-10 flex-1 min-w-0"
                aria-label="New branch name"
              />
              <button type="button" onClick={addBranch} className="btn btn-primary h-10 w-10 p-0 shrink-0" title="Add branch">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
