import { useState } from "react";
import { toast } from "sonner";
import { GitBranch, Plus } from "lucide-react";
import {
  useBranches,
  useCreateBranch,
  useDeleteBranch,
} from "@/hooks/useBranches";
import { useShopSettings } from "@/hooks/useShopSettings";
import { canAddBranch, getPlanLimits } from "@/lib/billing";
import { upgradeToast } from "@/components/billing/UpgradePrompt";
import { SField } from "./fields";

function BranchManager({ onNotice }: { onNotice?: (msg: string) => void }) {
  const { data: branches = [], isLoading } = useBranches();
  const { data: settings } = useShopSettings();
  const create = useCreateBranch();
  const del = useDeleteBranch();
  const [name, setName] = useState("");

  const add = async () => {
    if (!name.trim()) return toast.error("Enter a branch name first");
    if (!canAddBranch(branches.length, settings)) {
      upgradeToast(`More than ${getPlanLimits(settings).branches} branches`);
      return;
    }
    try {
      await create.mutateAsync(name.trim());
      setName("");
      onNotice?.("Branch created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create branch");
    }
  };

  const remove = async (id: string, branchName: string, isHead: boolean, total: number) => {
    if (isHead) return toast.error("Head Office cannot be deleted");
    if (total <= 1) return toast.error("Keep at least one branch");
    if (!confirm(`Delete branch "${branchName}"? Existing records keep working.`)) return;
    try {
      await del.mutateAsync(id);
      onNotice?.("Branch deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete branch");
    }
  };

  if (isLoading) return <div className="field-hint">Loading branches…</div>;

  return (
    <div>
      <p className="field-hint" style={{ marginTop: 0, marginBottom: 12 }}>
        Branches appear in the TopBar switcher; new sales, held tickets, expenses and purchase
        orders are tagged with the active branch. Assign staff to a branch from the admin dashboard.
      </p>
      <SField label="Registered Locations">
        <div className="data-table-card">
          {branches.length === 0 && (
            <div className="data-row">
              <span className="field-hint" style={{ marginTop: 0 }}>No branches yet.</span>
            </div>
          )}
          {branches.map((b) => (
            <div key={b.id} className="data-row">
              <div className="branch-row-main">
                <GitBranch className="icon" />
                <span className="branch-name">{b.name}</span>
              </div>
              {b.isHeadOffice ? (
                <span className="badge-hq">Headquarters (HQ)</span>
              ) : branches.length > 1 ? (
                <button
                  type="button"
                  className="btn btn-ghost-danger btn-sm"
                  onClick={() => remove(b.id, b.name, b.isHeadOffice, branches.length)}
                >
                  Remove
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </SField>
      <div className="add-row">
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Add new branch location..."
        />
        <button type="button" className="btn btn-outline" onClick={add}>
          <Plus className="icon" />
          Add Branch
        </button>
      </div>
    </div>
  );
}

export default BranchManager;
