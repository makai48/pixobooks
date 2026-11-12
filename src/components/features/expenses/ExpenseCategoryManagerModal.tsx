import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Edit3, Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useUpdateShopSettings } from "@/hooks/useShopSettings";
import { PROTECTED_EXPENSE_CATEGORIES } from "@/types";
import { cn } from "@/lib/utils";

/**
 * CRUD for the expense categories.
 *
 *  • Add      → the name joins the pool (saved with the list)
 *  • Rename   → every expense in that category is renamed first, then the
 *                entry is swapped in the pool
 *  • Delete   → every expense in that category is reassigned to "General"
 *                before removing the entry
 *  • Save     → persists the full pool onto `shop_settings.expense_categories`
 *
 * PROTECTED_EXPENSE_CATEGORIES (General / Drawings / Salary / Staff Allowance)
 * cannot be renamed or deleted because they have hard-wired app logic
 * (drawings feed, salary auto-fill, attendance-based allowance creation,
 * and the reassignment target itself).
 */
export default function ExpenseCategoryManagerModal({
  categories,
  onClose,
}: {
  categories: string[];
  onClose: () => void;
}) {
  const updateSettings = useUpdateShopSettings();
  const qc = useQueryClient();
  const [pool, setPool] = useState<string[]>(() => Array.from(new Set(categories)));
  const [draft, setDraft] = useState("");
  const [renameFrom, setRenameFrom] = useState<string | null>(null);
  const [renameTo, setRenameTo] = useState("");
  const [busy, setBusy] = useState(false);

  const isProtected = (c: string) => PROTECTED_EXPENSE_CATEGORIES.includes(c);

  const add = () => {
    const c = draft.trim();
    if (!c) return toast.error("Enter a category name");
    if (pool.some((p) => p.toLowerCase() === c.toLowerCase()))
      return toast.error("Category already exists");
    setPool([...pool, c]);
    setDraft("");
  };

  const rename = async () => {
    if (!renameFrom || !renameTo.trim()) return;
    if (isProtected(renameFrom))
      return toast.error(`"${renameFrom}" is a built-in category and cannot be renamed`);
    const to = renameTo.trim();
    if (to === renameFrom) {
      setRenameFrom(null);
      setRenameTo("");
      return;
    }
    if (pool.some((p) => p.toLowerCase() === to.toLowerCase() && p !== renameFrom))
      return toast.error("A category with that name already exists");
    setBusy(true);
    try {
      const { error } = await supabase
        .from("expenses")
        .update({ category: to })
        .eq("category", renameFrom);
      if (error) throw error;
      setPool(pool.map((p) => (p === renameFrom ? to : p)));
      setRenameFrom(null);
      setRenameTo("");
      qc.invalidateQueries({ queryKey: ["expenses"] });
      toast.success(`Renamed to "${to}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (name: string) => {
    if (isProtected(name))
      return toast.error(`"${name}" is a built-in category and cannot be deleted`);
    if (
      !confirm(
        `Delete "${name}"? All existing expenses in this category will be reassigned to "General".`
      )
    )
      return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("expenses")
        .update({ category: "General" })
        .eq("category", name);
      if (error) throw error;
      setPool(pool.filter((p) => p !== name));
      qc.invalidateQueries({ queryKey: ["expenses"] });
      toast.success(`Deleted "${name}" · existing expenses moved to General`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    // Guarantee protected categories are always present regardless of user action.
    const merged = Array.from(
      new Set([...PROTECTED_EXPENSE_CATEGORIES, ...pool])
    );
    updateSettings.mutate(
      { expenseCategories: merged },
      {
        onSuccess: () => {
          toast.success("Categories saved");
          onClose();
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
      }
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink/50 flex items-center justify-center p-2 sm:p-4 animate-fade-in">
      <div className="paper-card w-full max-w-md max-h-[95dvh] flex flex-col overflow-hidden">
        <div className="p-3 sm:p-4 border-b flex items-center justify-between shrink-0">
          <div>
            <div className="text-[10px] sm:text-[11px] uppercase tracking-widest text-ink-mute">
              Expense ledger
            </div>
            <h2 className="font-display text-base sm:text-lg font-bold">Manage categories</h2>
          </div>
          <button onClick={onClose} className="btn btn-ghost h-8 w-8 p-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-3 sm:p-4 space-y-2 sm:space-y-3 overflow-auto scroll-lined">
          <div className="flex gap-1.5 sm:gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="New category name"
              className="input flex-1"
              onKeyDown={(e) => e.key === "Enter" && add()}
            />
            <button onClick={add} className="btn btn-primary">
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>
          <div className="border rounded-md divide-y">
            {pool.length === 0 ? (
              <div className="p-4 text-sm text-ink-mute text-center">No categories yet.</div>
            ) : (
              pool.map((p) => {
                const locked = isProtected(p);
                return (
                  <div key={p} className="p-2 flex items-center gap-2">
                    {renameFrom === p ? (
                      <>
                        <input
                          autoFocus
                          value={renameTo}
                          onChange={(e) => setRenameTo(e.target.value)}
                          placeholder="New name"
                          className="input h-8 flex-1"
                          onKeyDown={(e) => e.key === "Enter" && rename()}
                        />
                        <button
                          onClick={rename}
                          disabled={busy}
                          className="btn btn-primary h-8 px-3 text-xs"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setRenameFrom(null);
                            setRenameTo("");
                          }}
                          className="btn btn-ghost h-8 px-2 text-xs"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-sm font-medium inline-flex items-center gap-2">
                          {p}
                          {locked && (
                            <span className="chip bg-cyan-reg/10 text-cyan-reg border border-cyan-reg/30 text-[9px] uppercase tracking-wider">
                              Built-in
                            </span>
                          )}
                        </span>
                        <button
                          onClick={() => {
                            if (locked)
                              return toast.error(
                                `"${p}" is a built-in category and cannot be renamed`
                              );
                            setRenameFrom(p);
                            setRenameTo(p);
                          }}
                          disabled={locked}
                          className={cn(
                            "btn btn-ghost h-8 w-8 p-0",
                            locked && "opacity-40 cursor-not-allowed"
                          )}
                          title={locked ? "Built-in — cannot be renamed" : "Rename"}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => remove(p)}
                          disabled={busy || locked}
                          className={cn(
                            "btn btn-ghost h-8 w-8 p-0",
                            locked ? "opacity-40 cursor-not-allowed" : "text-danger"
                          )}
                          title={locked ? "Built-in — cannot be deleted" : "Delete"}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
          <p className="text-[10px] sm:text-[11px] text-ink-mute">
            Renaming a category updates every existing expense using that name.
            Deleting reassigns them to &quot;General&quot;. Built-in categories
            (General, Drawings, Salary, Staff Allowance) have hard-wired app
            logic and are protected from removal.
          </p>
        </div>
        <div className="p-3 sm:p-4 border-t flex justify-end gap-1.5 sm:gap-2 shrink-0">
          <button onClick={onClose} className="btn btn-outline">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={updateSettings.isPending}
            className="btn btn-primary"
          >
            {updateSettings.isPending ? "Saving..." : "Save category list"}
          </button>
        </div>
      </div>
    </div>
  );
}
