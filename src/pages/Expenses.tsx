import { useMemo, useState } from "react";
import {
  Plus,
  Search,
  Edit3,
  Trash2,
  Wallet,
  Download,
  ArrowDownRight,
  Receipt,
  Settings2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  useExpenses,
  useDeleteExpense,
} from "@/hooks/useExpenses";
import { useShopSettings, useUpdateShopSettings } from "@/hooks/useShopSettings";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import ExpenseModal from "@/components/features/expenses/ExpenseModal";
import GlassDatePicker from "@/components/ui/GlassDatePicker";
import GlassSelect from "@/components/ui/GlassSelect";
import StatCard from "@/components/ui/StatCard";
import type { Expense } from "@/types";
import {
  DRAWINGS_CATEGORY,
  EXPENSE_CATEGORIES,
  PROTECTED_EXPENSE_CATEGORIES,
} from "@/types";
import { cn, download, formatCurrency, formatDate, formatMoney, todayISO } from "@/lib/utils";

type Tab = "expenses" | "drawings";

export default function Expenses() {
  const { can } = useAuth();
  const { data: expenses = [], isLoading } = useExpenses();
  const { data: settings } = useShopSettings();
  const del = useDeleteExpense();

  const [tab, setTab] = useState<Tab>("expenses");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string>("All");
  // Reports default to Today per new policy.
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const [modalOpen, setModalOpen] = useState(false);
  const [edit, setEdit] = useState<Expense | null>(null);
  const [preselectDrawing, setPreselectDrawing] = useState(false);
  const [categoryMgrOpen, setCategoryMgrOpen] = useState(false);

  /** Effective expense categories: custom list from settings, or
   *  fall back to the built-in `EXPENSE_CATEGORIES` constant when the
   *  custom list is empty (i.e. the user has never opened the manager). */
  const effectiveCategories = useMemo(() => {
    const custom = settings?.expenseCategories;
    return custom && custom.length > 0 ? custom : EXPENSE_CATEGORIES;
  }, [settings?.expenseCategories]);

  const filtered = useMemo(
    () =>
      expenses.filter((e) => {
        if (e.expenseDate < from || e.expenseDate > to) return false;
        // Drawings tab shows ONLY drawings; Expenses tab shows everything except drawings
        if (tab === "drawings" && e.category !== DRAWINGS_CATEGORY) return false;
        if (tab === "expenses" && e.category === DRAWINGS_CATEGORY) return false;
        if (tab === "expenses" && category !== "All" && e.category !== category) return false;
        if (q) {
          const query = q.toLowerCase();
          return (
            e.description.toLowerCase().includes(query) ||
            (e.vendor || "").toLowerCase().includes(query) ||
            e.category.toLowerCase().includes(query)
          );
        }
        return true;
      }),
    [expenses, q, category, from, to, tab]
  );

  const total = filtered.reduce((s, e) => s + e.amount, 0);
  const byCat = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach((e) => m.set(e.category, (m.get(e.category) || 0) + e.amount));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const exportCsv = () => {
    const rows = [
      ["Date", "Category", "Description", "Vendor", "Amount", "Method", "Recorded by"],
      ...filtered.map((e) => [
        e.expenseDate,
        e.category,
        e.description,
        e.vendor || "",
        e.amount.toFixed(2),
        e.paymentMethod,
        e.createdByName,
      ]),
    ];
    download(`${tab}-${from}-to-${to}.csv`, rows.map((r) => r.join(",")).join("\n"));
    toast.success("Exported");
  };

  const openNew = (asDrawing = false) => {
    setEdit(null);
    setPreselectDrawing(asDrawing);
    setModalOpen(true);
  };

  const currency = settings?.currency || "USD";

  return (
    <div className="p-2.5 md:p-6 space-y-2 md:space-y-4">
      <div className="paper-card p-1.5 max-md:p-1 flex items-center gap-1 max-md:gap-0.5 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setTab("expenses")}
          className={cn(
            "inline-flex items-center gap-1.5 h-9 max-md:h-7 px-3 max-md:px-2 rounded-md text-xs max-md:text-[10px] font-semibold uppercase tracking-widest max-md:tracking-wide transition",
            tab === "expenses" ? "bg-ink text-paper" : "text-ink-mute hover:text-ink hover:bg-paper"
          )}
        >
          <Receipt className="w-3.5 h-3.5 max-md:w-3 max-md:h-3" /> Expenses
        </button>
        <button
          onClick={() => setTab("drawings")}
          className={cn(
            "inline-flex items-center gap-1.5 h-9 max-md:h-7 px-3 max-md:px-2 rounded-md text-xs max-md:text-[10px] font-semibold uppercase tracking-widest max-md:tracking-wide transition",
            tab === "drawings" ? "bg-ink text-paper" : "text-ink-mute hover:text-ink hover:bg-paper"
          )}
        >
          <ArrowDownRight className="w-3.5 h-3.5 max-md:w-3 max-md:h-3" /> Drawings
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1.5 md:gap-3">
        <StatCard
          label={tab === "drawings" ? "Owner drawings" : "Total in range"}
          value={formatMoney(total, currency)}
          fullValue={formatCurrency(total, currency)}
          tone={tab === "drawings" ? "danger" : "warning"}
        />
        <StatCard label="Records" value={String(filtered.length)} />
        <StatCard label="Categories" value={String(byCat.length)} />
      </div>

      <div className="paper-card p-2.5 md:p-4">
        <div className="text-[7px] md:text-[11px] uppercase tracking-wide md:tracking-widest text-ink-mute">
          {tab === "drawings" ? "Recent drawings" : "Category breakdown"}
        </div>
        {byCat.length === 0 ? (
          <div className="text-[10px] md:text-sm text-ink-mute mt-1 md:mt-2">
            {tab === "drawings" ? "No owner drawings in range yet." : "No expenses in range."}
          </div>
        ) : (
          <div className="mt-1.5 md:mt-3 space-y-1 md:space-y-2">
            {byCat.slice(0, 6).map(([cat, amt]) => (
              <div key={cat} className="space-y-0.5 md:space-y-1">
                <div className="flex justify-between text-[10px] md:text-sm leading-tight">
                  <span className="truncate pr-2">{cat}</span>
                  <span className="num text-ink-mute shrink-0">
                    {formatMoney(amt, currency)}
                  </span>
                </div>
                <div className="h-1 md:h-1.5 rounded bg-ink/5 overflow-hidden">
                  <div
                    className={cn("h-full", tab === "drawings" ? "bg-danger" : "bg-yellow-reg")}
                    style={{ width: `${(amt / (byCat[0][1] || 1)) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="paper-card p-2.5 md:p-4 grid grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] md:grid-cols-5 items-center md:items-end gap-x-1.5 gap-y-1.5 md:gap-3">
        <div className="relative col-span-4 md:col-span-2">
          <Search className="w-3.5 h-3.5 md:w-4 md:h-4 absolute left-2 md:left-3 top-1/2 -translate-y-1/2 text-ink-mute pointer-events-none" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tab === "drawings" ? "Search notes or reference" : "Search description or vendor"}
            className="input input-sm pl-7 md:pl-9"
          />
        </div>
        <div className="max-md:contents">
          <label htmlFor="ex-from" className="label max-md:text-[9px] max-md:whitespace-nowrap">From</label>
          <GlassDatePicker
            id="ex-from"
            value={from}
            onChange={setFrom}
            ariaLabel="From date"
            className="input input-sm select-glass min-w-0 max-md:px-1.5 md:mt-1"
          />
        </div>
        <div className="max-md:contents">
          <label htmlFor="ex-to" className="label max-md:text-[9px] max-md:whitespace-nowrap">To</label>
          <GlassDatePicker
            id="ex-to"
            value={to}
            onChange={setTo}
            ariaLabel="To date"
            className="input input-sm select-glass min-w-0 max-md:px-1.5 md:mt-1"
          />
        </div>
        {tab === "expenses" && (
          <div className="max-md:contents">
            <label htmlFor="ex-category" className="label max-md:text-[9px] max-md:whitespace-nowrap">Category</label>
            <GlassSelect
              id="ex-category"
              value={category}
              onChange={setCategory}
              ariaLabel="Expense category"
              options={[
                { value: "All", label: "All categories" },
                ...effectiveCategories
                  .filter((c) => c !== DRAWINGS_CATEGORY)
                  .map((c) => ({ value: c, label: c })),
              ]}
              className="input input-sm select-glass min-w-0 max-md:px-1.5 md:mt-1"
            />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-1.5 md:gap-2">
        <div className="text-[10px] md:text-xs text-ink-mute">
          {filtered.length} {tab === "drawings" ? "drawing" : "expense"}
          {filtered.length === 1 ? "" : "s"} · {from} → {to}
        </div>
        <div className="flex items-center gap-1 md:gap-2 flex-wrap max-md:flex-1 max-md:justify-end">
          {can("expenses.manage") && tab === "expenses" && (
            <button
              onClick={() => setCategoryMgrOpen(true)}
              className="btn btn-outline btn-sm"
              title="Add, rename or delete expense categories"
            >
              <Settings2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
              <span className="hidden sm:inline">Categories</span>
            </button>
          )}
          <button onClick={exportCsv} className="btn btn-outline btn-sm">
            <Download className="w-3.5 h-3.5 md:w-4 md:h-4" />
            <span className="hidden sm:inline">Export</span>
          </button>
          {can("expenses.manage") && (
            <button
              onClick={() => openNew(tab === "drawings")}
              className="btn btn-primary btn-sm"
            >
              <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" />
              {tab === "drawings" ? "New drawing" : "New expense"}
            </button>
          )}
        </div>
      </div>

      <div className="paper-card overflow-hidden">
        {isLoading ? (
          <div className="p-6 md:p-10 text-center text-ink-mute text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 md:p-10 text-center">
            <Wallet className="w-7 h-7 md:w-8 md:h-8 text-ink-mute mx-auto" />
            <div className="mt-1.5 md:mt-2 text-ink-mute text-[11px] md:text-sm">
              No {tab === "drawings" ? "drawings" : "expenses"} in this range.
            </div>
          </div>
        ) : (
          <div className="divide-y">
            {filtered.map((e) => (
              <div
                key={e.id}
                className="flex items-center h-[27px] max-md:h-[21px] hover:bg-paper/50 transition text-[11px] leading-tight"
              >
                <span className="hidden md:inline w-20 shrink-0 text-[10px] text-ink-mute pl-4">
                  {formatDate(e.expenseDate)}
                </span>
                <span
                  className={cn(
                    "chip border shrink-0 max-md:text-[8px] max-md:px-1 max-md:py-px max-md:max-w-[56px] max-md:truncate md:ml-2 md:text-[10px]",
                    tab === "drawings"
                      ? "bg-danger/10 text-danger border-danger/30"
                      : "bg-yellow-reg/10 text-yellow-reg border-yellow-reg/30"
                  )}
                >
                  {e.category}
                </span>
                <span className="flex-1 min-w-0 truncate font-medium text-[11px] md:text-sm px-1.5 md:px-3" title={e.description}>
                  {e.description}
                </span>
                <span className="hidden lg:inline w-28 truncate text-[10px] text-ink-mute shrink-0">
                  {e.vendor || "—"}
                </span>
                <span className="hidden md:inline w-16 text-[10px] text-ink-mute shrink-0">
                  {e.paymentMethod}
                </span>
                <span className="hidden xl:inline w-24 truncate text-[10px] text-ink-mute shrink-0">
                  {e.createdByName}
                </span>
                <span className="num font-bold text-[10px] md:text-xs text-right w-16 md:w-24 shrink-0">
                  {formatMoney(e.amount, currency)}
                </span>
                {can("expenses.manage") && (
                  <span className="flex items-center gap-0.5 md:gap-1 pr-1 md:pr-3 shrink-0">
                    <button
                      onClick={() => {
                        setEdit(e);
                        setPreselectDrawing(e.category === DRAWINGS_CATEGORY);
                        setModalOpen(true);
                      }}
                      className="h-full w-5 md:h-8 md:w-8 p-0 inline-flex items-center justify-center rounded text-ink-mute hover:bg-paper"
                      title="Edit"
                    >
                      <Edit3 className="w-3 h-3 md:w-4 md:h-4" />
                    </button>
                    <button
                      onClick={() =>
                        confirm(`Delete "${e.description}"?`) &&
                        del.mutate(e.id, {
                          onSuccess: () => toast.success("Deleted"),
                        })
                      }
                      className="h-full w-5 md:h-8 md:w-8 p-0 inline-flex items-center justify-center rounded text-danger hover:bg-danger/10"
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3 md:w-4 md:h-4" />
                    </button>
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <ExpenseModal
          expense={edit}
          preselectCategory={preselectDrawing ? DRAWINGS_CATEGORY : undefined}
          onClose={() => {
            setModalOpen(false);
            setPreselectDrawing(false);
          }}
        />
      )}

      {categoryMgrOpen && (
        <ExpenseCategoryManagerModal
          categories={effectiveCategories}
          onClose={() => setCategoryMgrOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * Full CRUD for the expense-category dictionary.
 *  • Add → pushes onto the working pool
 *  • Rename → immediately updates every expense with that category so no
 *    orphan strings survive, then swaps the entry in the pool
 *  • Delete → reassigns every expense in that category to "General"
 *    before removing the entry
 *  • Save → persists the full pool onto `shop_settings.expense_categories`
 *
 * PROTECTED_EXPENSE_CATEGORIES (General / Drawings / Salary / Staff Allowance)
 * cannot be renamed or deleted because they have hard-wired app logic
 * (drawings feed, salary auto-fill, attendance-based allowance creation,
 * and the reassignment target itself).
 */
function ExpenseCategoryManagerModal({
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
            Deleting reassigns them to "General". Built-in categories
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
