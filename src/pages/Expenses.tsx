import { useMemo, useState } from "react";
import {
  Plus,
  Search,
  Trash2,
  Wallet,
  ArrowDownRight,
  Settings2,
  CalendarDays,
  SlidersHorizontal,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import {
  useExpenses,
  useDeleteExpense,
} from "@/hooks/useExpenses";
import { useShopSettings } from "@/hooks/useShopSettings";
import ExpenseCategoryManagerModal from "@/components/features/expenses/ExpenseCategoryManagerModal";
import { useAuth } from "@/hooks/useAuth";
import ExpenseModal from "@/components/features/expenses/ExpenseModal";
import GlassDatePicker from "@/components/ui/GlassDatePicker";
import GlassSelect from "@/components/ui/GlassSelect";
import MoneyText from "@/components/ui/MoneyText";
import type { Expense } from "@/types";
import {
  DRAWINGS_CATEGORY,
  EXPENSE_CATEGORIES,
} from "@/types";
import { cn, formatMoney, localISODate, todayISO } from "@/lib/utils";
import { DEFAULT_DATE_FORMAT, formatDateByPreference } from "@/lib/dateFormat";
import { DEFAULT_WEEK_START, resolveRange } from "@/lib/week";

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
  const [showFilters, setShowFilters] = useState(false);

  /** Effective expense categories: custom list from settings, or
   *  fall back to the built-in `EXPENSE_CATEGORIES` constant when the
   *  custom list is empty (i.e. the user has never opened the manager). */
  const effectiveCategories = useMemo(() => {
    const custom = settings?.expenseCategories;
    return custom && custom.length > 0 ? custom : EXPENSE_CATEGORIES;
  }, [settings?.expenseCategories]);

  const rangeExpenses = useMemo(
    () => expenses.filter((e) => e.expenseDate >= from && e.expenseDate <= to),
    [expenses, from, to]
  );

  const tabCounts = useMemo(() => {
    let expenseCount = 0;
    let drawingCount = 0;
    for (const e of rangeExpenses) {
      if (e.category === DRAWINGS_CATEGORY) drawingCount += 1;
      else expenseCount += 1;
    }
    return { expenses: expenseCount, drawings: drawingCount };
  }, [rangeExpenses]);

  const filtered = useMemo(
    () =>
      rangeExpenses.filter((e) => {
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
    [rangeExpenses, q, category, tab]
  );

  const applyRange = (preset: "today" | "week" | "month" | "year") => {
    const now = new Date();
    const today = todayISO();
    if (preset === "today") {
      setFrom(today);
      setTo(today);
      return;
    }
    if (preset === "week") {
      const range = resolveRange("thisWeek", settings?.weekStart ?? DEFAULT_WEEK_START, now);
      setFrom(localISODate(range.from));
      setTo(localISODate(range.to));
      return;
    }
    if (preset === "month") {
      setFrom(localISODate(new Date(now.getFullYear(), now.getMonth(), 1)));
      setTo(today);
      return;
    }
    setFrom(localISODate(new Date(now.getFullYear(), 0, 1)));
    setTo(today);
  };

  const today = todayISO();
  const monthStart = localISODate(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const yearStart = localISODate(new Date(new Date().getFullYear(), 0, 1));
  const weekStart = localISODate(
    resolveRange("thisWeek", settings?.weekStart ?? DEFAULT_WEEK_START).from
  );
  const activeRange =
    from === today && to === today
      ? "today"
      : from === weekStart && to === today
      ? "week"
      : from === monthStart && to === today
      ? "month"
      : from === yearStart && to === today
      ? "year"
      : "custom";
  const activeFilterCount =
    (q.trim() ? 1 : 0) +
    (tab === "expenses" && category !== "All" ? 1 : 0) +
    (activeRange === "custom" ? 1 : 0);

  const total = filtered.reduce((s, e) => s + e.amount, 0);
  const openNew = (asDrawing = false) => {
    setEdit(null);
    setPreselectDrawing(asDrawing);
    setModalOpen(true);
  };

  const currency = settings?.currency || "USD";
  const dateFormat = settings?.dateFormat ?? DEFAULT_DATE_FORMAT;

  const openEdit = (expense: Expense) => {
    setEdit(expense);
    setPreselectDrawing(expense.category === DRAWINGS_CATEGORY);
    setModalOpen(true);
  };

  const removeExpense = (expense: Expense) => {
    if (!confirm(`Delete "${expense.description}"?`)) return;
    del.mutate(expense.id, {
      onSuccess: () => toast.success("Deleted"),
    });
  };

  const rowActions = (expense: Expense) =>
    can("expenses.manage") ? (
      <span className="flex items-center gap-0.5 md:gap-1">
        <button
          onClick={() => removeExpense(expense)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-danger transition hover:bg-danger/10 md:h-8 md:w-8"
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5 md:h-4 md:w-4" strokeWidth={2} />
        </button>
      </span>
    ) : null;

  const paymentLabel = (method: string) => {
    const labels: Record<string, string> = {
      cash: "Cash",
      card: "Card",
      transfer: "Transfer",
      credit: "Credit",
      partial: "Partial",
    };
    return labels[method.toLowerCase()] || method;
  };

  return (
    <div className="expense-workspace p-3 md:p-6 space-y-3 md:space-y-5">
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-line/70 bg-paper/95 py-2 backdrop-blur">
            <div className="inline-flex gap-1.5 rounded-lg bg-ink/[0.055] p-1 max-md:w-full" role="tablist" aria-label="Expense ledger">
              <button
                type="button"
                role="tab"
                aria-selected={tab === "expenses"}
                onClick={() => setTab("expenses")}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[11px] font-semibold transition max-md:flex-1 max-md:justify-center",
                  tab === "expenses"
                    ? "border-brand bg-brand text-brand-fg shadow-sm"
                    : "border-line text-ink-mute hover:border-ink hover:bg-ink/5 hover:text-ink"
                )}
              >
                <Wallet className="h-[15px] w-[15px]" strokeWidth={tab === "expenses" ? 2.25 : 1.75} />
                Expenses
                <span
                  className={cn(
                    "num min-w-4 rounded-full px-1 text-center text-[9px] font-bold leading-[15px]",
                    tab === "expenses" ? "bg-black/10" : "bg-ink/[0.07]"
                  )}
                >
                  {tabCounts.expenses}
                </span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "drawings"}
                onClick={() => setTab("drawings")}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[11px] font-semibold transition max-md:flex-1 max-md:justify-center",
                  tab === "drawings"
                    ? "border-brand bg-brand text-brand-fg shadow-sm"
                    : "border-line text-ink-mute hover:border-ink hover:bg-ink/5 hover:text-ink"
                )}
              >
                <ArrowDownRight className="h-[15px] w-[15px]" strokeWidth={tab === "drawings" ? 2.25 : 1.75} />
                Drawings
                <span
                  className={cn(
                    "num min-w-4 rounded-full px-1 text-center text-[9px] font-bold leading-[15px]",
                    tab === "drawings" ? "bg-black/10" : "bg-ink/[0.07]"
                  )}
                >
                  {tabCounts.drawings}
                </span>
              </button>
            </div>

            <div className="ml-auto flex items-center gap-1.5 max-md:ml-0 max-md:w-full max-md:justify-between">
              <GlassSelect
                value={activeRange}
                onChange={(value) => {
                  applyRange(value as "today" | "week" | "month" | "year");
                }}
                ariaLabel="Expense range"
                options={[
                  { value: "today", label: "Today" },
                  { value: "week", label: "This week" },
                  { value: "month", label: "This month" },
                  { value: "year", label: String(new Date().getFullYear()) },
                ]}
                selectedLabel={activeRange === "custom" ? "Custom range" : undefined}
                noTruncate
                className="input input-sm select-glass w-[114px] max-md:text-[10px] md:w-[124px]"
              />
              <button
                type="button"
                aria-expanded={showFilters}
                onClick={() => setShowFilters((visible) => !visible)}
                className={cn(
                  "btn h-8 shrink-0 px-2.5 text-[10px]",
                  showFilters ? "btn-primary" : "btn-outline"
                )}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={2} />
                <span>Filters</span>
                {activeFilterCount > 0 && (
                  <span
                    className={cn(
                      "num grid h-4 min-w-4 place-items-center rounded-full px-1 text-[8px] font-bold",
                      showFilters ? "bg-paper/20" : "bg-brand text-brand-fg"
                    )}
                  >
                    {activeFilterCount}
                  </span>
                )}
                <ChevronDown
                  className={cn("h-3.5 w-3.5 transition", showFilters && "rotate-180")}
                  strokeWidth={2}
                />
              </button>
              <div className="flex shrink-0 items-center gap-1.5 max-md:ml-0">
                {can("expenses.manage") && tab === "expenses" && (
                  <button
                    onClick={() => setCategoryMgrOpen(true)}
                    className="btn btn-outline h-8 px-2.5 text-[10px]"
                    title="Manage categories"
                  >
                    <Settings2 className="h-3.5 w-3.5" strokeWidth={2} />
                    <span className="hidden sm:inline">Categories</span>
                  </button>
                )}
                {can("expenses.manage") && (
                  <button
                    onClick={() => openNew(tab === "drawings")}
                    className="btn btn-primary h-8 px-2.5 text-[10px]"
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={2.25} />
                    <span className="hidden sm:inline">{tab === "drawings" ? "New drawing" : "New expense"}</span>
                    <span className="sm:hidden">New</span>
                  </button>
                )}
              </div>
            </div>
          </div>

      <div className="min-w-0">
        <section className="paper-card min-w-0 overflow-hidden">
          {showFilters && (
          <div className="space-y-2 border-b border-line/70 bg-ink/[0.025] p-3 md:p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[160px] flex-1">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-mute md:left-3 md:h-4 md:w-4" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={tab === "drawings" ? "Search drawings…" : "Search description or vendor…"}
                  className="input input-sm pl-8 md:pl-9"
                />
              </div>
              {tab === "expenses" && (
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
                  noTruncate
                  className="input input-sm select-glass w-full md:w-[168px]"
                />
              )}
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:flex sm:flex-none">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <label htmlFor="ex-from" className="text-[8px] font-semibold uppercase tracking-[0.12em] text-ink-mute">
                    From
                  </label>
                  <GlassDatePicker
                    id="ex-from"
                    value={from}
                    onChange={setFrom}
                    ariaLabel="From date"
                    dateFormat={settings?.dateFormat ?? DEFAULT_DATE_FORMAT}
                    className="input input-sm select-glass w-full min-w-0 whitespace-nowrap sm:w-[132px]"
                    fullWidth
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <label htmlFor="ex-to" className="text-[8px] font-semibold uppercase tracking-[0.12em] text-ink-mute">
                    To
                  </label>
                  <GlassDatePicker
                    id="ex-to"
                    value={to}
                    onChange={setTo}
                    ariaLabel="To date"
                    dateFormat={settings?.dateFormat ?? DEFAULT_DATE_FORMAT}
                    className="input input-sm select-glass w-full min-w-0 whitespace-nowrap sm:w-[132px]"
                    fullWidth
                  />
                </div>
              </div>
              <div className="ml-auto flex items-center gap-1.5 text-[9px] text-ink-mute md:text-[10px]">
                <CalendarDays className="h-3.5 w-3.5" strokeWidth={2} />
                {filtered.length} {tab === "drawings" ? "drawing" : "expense"}
                {filtered.length === 1 ? "" : "s"}
              </div>
            </div>
          </div>
          )}

          <div className="hidden grid-cols-[82px_126px_minmax(0,1fr)_128px_82px_112px_64px] items-center gap-2.5 table-head-solid border-b border-line/60 px-4 py-2 text-[8px] font-semibold uppercase tracking-[0.12em] text-ink-mute lg:grid">
            <span>Date</span>
            <span>Category</span>
            <span>Description</span>
            <span>Vendor</span>
            <span>Method</span>
            <span className="text-right">Amount</span>
            <span />
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-sm text-ink-mute">Loading ledger…</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-ink/5 text-ink-mute">
                {tab === "drawings" ? (
                  <ArrowDownRight className="h-5 w-5" strokeWidth={1.8} />
                ) : (
                  <Wallet className="h-5 w-5" strokeWidth={1.8} />
                )}
              </span>
              <div className="mt-2 text-sm font-semibold">No {tab === "drawings" ? "drawings" : "expenses"} in this range</div>
              <div className="mt-0.5 text-[11px] text-ink-mute">Adjust the dates or filters, or add a new entry.</div>
            </div>
          ) : (
            <div className="expense-ledger-rows divide-y divide-line">
              {filtered.map((expense) => {
                const drawing = expense.category === DRAWINGS_CATEGORY;
                return (
                  <div
                    key={expense.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openEdit(expense)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openEdit(expense);
                      }
                    }}
                    className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    {/* Desktop ledger row */}
                    <div className="expense-row-desktop hidden min-h-[27px] grid-cols-[82px_126px_minmax(0,1fr)_128px_82px_112px_64px] items-center gap-2.5 px-4 py-[3px] text-[11px] transition hover:bg-paper/50 lg:grid">
                      <span className="num text-[9px] text-ink-mute">{formatDateByPreference(expense.expenseDate, dateFormat)}</span>
                      <span
                        className={cn(
                          "min-w-0 truncate text-[9px] font-semibold",
                          drawing
                            ? "text-danger/70"
                            : "text-ink-mute"
                        )}
                        title={expense.category}
                      >
                        {expense.category}
                      </span>
                      <span className="min-w-0 truncate text-[12px] font-medium" title={expense.description}>
                        {expense.description}
                      </span>
                      <span className="truncate text-[10px] text-ink-mute">{expense.vendor || "—"}</span>
                      <span className="truncate text-[10px] text-ink-mute">{paymentLabel(expense.paymentMethod)}</span>
                      <span className="num text-right text-[12px] font-bold">
                        <MoneyText value={formatMoney(expense.amount, currency)} />
                      </span>
                      <span className="flex justify-end">{rowActions(expense)}</span>
                    </div>

                    {/* Mobile ledger card */}
                    <div className="expense-row-mobile px-3 py-[3px] transition active:bg-paper/60 lg:hidden">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[11.5px] font-semibold leading-tight" title={expense.description}>
                            {expense.description}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1">
                            <span
                              className={cn(
                                 "text-[8.5px] font-semibold",
                                drawing
                                  ? "text-danger/70"
                                  : "text-ink-mute"
                              )}
                            >
                              {expense.category}
                            </span>
                            <span className="num text-[8.5px] text-ink-mute">{formatDateByPreference(expense.expenseDate, dateFormat, true)}</span>
                            {expense.vendor && (
                              <span className="truncate text-[8.5px] text-ink-mute">· {expense.vendor}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-start gap-1">
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="num text-[11px] font-bold">
                              <MoneyText value={formatMoney(expense.amount, currency)} />
                            </span>
                            <span
                              className="inline-flex whitespace-nowrap px-0 py-px text-[8px] font-medium leading-none text-ink-mute"
                              aria-label={`Payment method: ${paymentLabel(expense.paymentMethod)}`}
                            >
                              {paymentLabel(expense.paymentMethod)}
                            </span>
                          </div>
                          <span onClick={(event) => event.stopPropagation()}>
                            {rowActions(expense)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/60 px-4 py-2 text-[9px] text-ink-mute md:text-[10px]">
            <span>
              {formatDateByPreference(from, dateFormat)} →{" "}
              {formatDateByPreference(to, dateFormat)}
            </span>
            <span className="num">
              {filtered.length} record{filtered.length === 1 ? "" : "s"} ·{" "}
              {formatMoney(total, currency)}
            </span>
          </div>
        </section>

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
