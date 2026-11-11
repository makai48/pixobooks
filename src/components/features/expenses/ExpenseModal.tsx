import { useEffect, useMemo, useState } from "react";
import {
  X,
  Banknote,
  ArrowDownRight,
  Wallet,
  Check,
  StickyNote,
} from "lucide-react";
import { toast } from "sonner";
import { useUpsertExpense } from "@/hooks/useExpenses";
import { useEmployees } from "@/hooks/useEmployees";
import { useAuth } from "@/hooks/useAuth";
import { useShopSettings } from "@/hooks/useShopSettings";
import {
  EXPENSE_CATEGORIES,
  type Expense,
  type PaymentMethod,
  computeEmployeeSalary,
} from "@/types";
import { todayISO, formatCurrency } from "@/lib/utils";
import { formatDateByPreference } from "@/lib/dateFormat";
import MoneyText from "@/components/ui/MoneyText";
import GlassDatePicker from "@/components/ui/GlassDatePicker";
import GlassMonthPicker from "@/components/ui/GlassMonthPicker";
import GlassSelect from "@/components/ui/GlassSelect";
import VendorSelect from "@/components/features/suppliers/VendorSelect";

const FIELD_LABEL =
  "mb-0.5 block text-[8.5px] font-semibold uppercase tracking-[0.14em] text-ink-mute md:text-[10px]";

function currentMonthISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(monthISO: string) {
  const [y, m] = monthISO.split("-").map(Number);
  if (!y || !m) return monthISO;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function monthISOToLastDay(monthISO: string) {
  const [y, m] = monthISO.split("-").map(Number);
  if (!y || !m) return todayISO();
  const d = new Date(y, m, 0);
  return d.toISOString().slice(0, 10);
}

export default function ExpenseModal({
  expense,
  onClose,
  preselectCategory,
}: {
  expense: Expense | null;
  onClose: () => void;
  preselectCategory?: string;
}) {
  const { profile } = useAuth();
  const upsert = useUpsertExpense();
  const { data: employees = [] } = useEmployees();
  const { data: settings } = useShopSettings();

  const [form, setForm] = useState({
    category: preselectCategory || "General",
    description: "",
    amount: 0,
    expenseDate: todayISO(),
    paymentMethod: "cash" as PaymentMethod,
    vendor: "",
    notes: "",
  });

  const [employeeId, setEmployeeId] = useState<string>("");
  const [salaryMonth, setSalaryMonth] = useState(currentMonthISO());
  const [salaryAutoSynced, setSalaryAutoSynced] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const isSalary = form.category === "Salary";
  const isDrawing = form.category === "Drawings";

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Let an open dropdown/calendar consume Escape first.
      if (document.querySelector(".glass-pop")) return;
      if (!upsert.isPending) onClose();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose, upsert.isPending]);

  useEffect(() => {
    if (expense) {
      setForm({
        category: expense.category,
        description: expense.description,
        amount: expense.amount,
        expenseDate: expense.expenseDate,
        paymentMethod: expense.paymentMethod,
        vendor: expense.vendor || "",
        notes: expense.notes || "",
      });
      setShowNotes(Boolean(expense.notes));
      // Try to reverse-engineer employee/month for salary edits
      if (expense.category === "Salary") {
        const monthMatch = /(\d{4})-(\d{2})/.exec(expense.description || "");
        if (monthMatch) setSalaryMonth(`${monthMatch[1]}-${monthMatch[2]}`);
      }
    }
  }, [expense]);

  // Auto-fill amount + description + date whenever employee/month changes for salary
  useEffect(() => {
    if (!isSalary) {
      setSalaryAutoSynced(false);
      return;
    }
    if (!employeeId) return;
    const emp = employees.find((e) => e.id === employeeId);
    if (!emp) return;
    const amount = Math.round(computeEmployeeSalary(emp.salary) * 100) / 100;
    const monthLabel = formatMonthLabel(salaryMonth);
    setForm((f) => ({
      ...f,
      amount,
      description: `Salary — ${emp.name} — ${monthLabel}`,
      expenseDate: monthISOToLastDay(salaryMonth),
      vendor: "",
    }));
    setSalaryAutoSynced(true);
  }, [employeeId, salaryMonth, isSalary, employees]);

  const salaryEmployee = useMemo(
    () => employees.find((e) => e.id === employeeId),
    [employees, employeeId]
  );

  /** Effective expense-category list.
   *  Custom list wins when non-empty, otherwise the built-in constant.
   *  The current `form.category` is always included so editing an
   *  expense whose category was later renamed / deleted still shows a
   *  valid selected option in the dropdown. */
  const displayCategories = useMemo(() => {
    const custom = settings?.expenseCategories;
    const base =
      custom && custom.length > 0 ? custom : EXPENSE_CATEGORIES;
    if (form.category && !base.includes(form.category)) {
      return [form.category, ...base];
    }
    return base;
  }, [settings?.expenseCategories, form.category]);

  const dateFormat = settings?.dateFormat ?? "DD/MM/YYYY";
  const methodLabels: Record<string, string> = {
    cash: "Cash",
    card: "Card",
    transfer: "Transfer",
    credit: "Credit",
    partial: "Partial",
  };
  const methodLabel = methodLabels[form.paymentMethod] ?? form.paymentMethod;
  // Expenses reuses the nav bar's Wallet glyph so the page, the tab and the
  // sheet all carry the same mark. Payroll/drawings keep their own icons.
  const HeaderIcon = isSalary ? Banknote : isDrawing ? ArrowDownRight : Wallet;
  const headerTone = isDrawing
    ? "border-danger/40 bg-danger/10 text-danger"
    : isSalary
    ? "border-magenta-reg/40 bg-magenta-reg/10 text-magenta-reg"
    : "border-brand/70 bg-brand text-brand-fg";
  const kicker = `${
    isDrawing ? "Drawings" : isSalary ? "Payroll" : "Expenses"
  } · ${expense ? "Editing" : "New entry"}`;
  const title = isSalary
    ? expense
      ? "Edit payroll payment"
      : "Payroll payment"
    : isDrawing
    ? expense
      ? "Edit drawing"
      : "New drawing"
    : expense
    ? "Edit expense"
    : "Record expense";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSalary && !employeeId)
      return toast.error("Select an employee for the salary payment");
    if (!form.description.trim()) return toast.error("Description required");
    if (form.amount <= 0) return toast.error("Amount must be > 0");
    try {
      await upsert.mutateAsync({
        id: expense?.id,
        category: form.category,
        description: form.description.trim(),
        amount: Number(form.amount),
        expenseDate: form.expenseDate,
        // Drawings use the same selectable payment method as expenses.
        // Only cash drawings leave the physical till (see cashLedger);
        // transfer/card drawings are recorded without touching the till.
        paymentMethod: form.paymentMethod,
        // Salary payments do not have a vendor
        vendor: isSalary ? null : form.vendor.trim() || null,
        notes: form.notes.trim() || null,
        createdBy: profile?.id,
        createdByName: profile?.name,
      });
      toast.success(
        expense
          ? isDrawing ? "Drawing updated" : "Expense updated"
          : isDrawing ? "Drawing recorded" : "Expense recorded"
      );
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 p-1.5 backdrop-blur-[2px] animate-fade-in md:items-center md:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !upsert.isPending) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="expense-modal-title"
        className="expense-modal paper-card flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden md:max-h-[92vh] md:max-w-lg"
      >
        <div className="flex shrink-0 items-start gap-2.5 border-b border-line/70 px-3 py-2.5 md:px-5 md:py-4">
          <span
            className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border md:h-9 md:w-9 ${headerTone}`}
          >
            <HeaderIcon
              className="h-4 w-4 md:h-[18px] md:w-[18px]"
              strokeWidth={1.9}
              aria-hidden="true"
            />
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="truncate text-[8px] font-semibold uppercase tracking-[0.16em] text-ink-mute md:text-[10px]">
              {kicker}
            </div>
            <h2
              id="expense-modal-title"
              className="font-display text-[15px] font-bold leading-tight md:text-xl"
            >
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="expense-icon-btn inline-flex shrink-0 items-center justify-center rounded-md border border-line bg-card text-ink-mute transition hover:border-ink hover:bg-ink/5 hover:text-ink"
            aria-label="Close expense"
            title="Close"
          >
            <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
        <form
          id="expense-form"
          onSubmit={submit}
          className="flex-1 space-y-2 overflow-auto p-2.5 md:space-y-3 md:p-5"
        >
          <div>
            <label htmlFor="exp-category" className={FIELD_LABEL}>Category</label>
            <GlassSelect
              id="exp-category"
              value={form.category}
              onChange={(category) => {
                setForm((f) => ({ ...f, category }));
                // Reset salary-specific fields when switching away
                if (category !== "Salary") {
                  setEmployeeId("");
                }
              }}
              ariaLabel="Category"
              options={displayCategories.map((c) => ({ value: c, label: c }))}
              className="input select-glass"
              fullWidth
            />
          </div>

          {isDrawing && (
            <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/[0.06] px-2.5 py-2">
              <ArrowDownRight
                className="mt-px h-3.5 w-3.5 shrink-0 text-danger"
                strokeWidth={2}
                aria-hidden="true"
              />
              <p className="text-[9.5px] leading-snug text-ink-soft md:text-[10.5px]">
                <span className="font-semibold text-danger">Drawing:</span> cash
                reduces today&apos;s till; card or transfer only changes the
                ledger.
              </p>
            </div>
          )}

          {isSalary && (
            <div className="space-y-2 rounded-xl border border-magenta-reg/30 bg-magenta-reg/[0.05] p-2.5 md:p-3">
              <div className="flex items-center gap-1.5">
                <Banknote
                  className="h-3.5 w-3.5 text-magenta-reg"
                  strokeWidth={1.9}
                  aria-hidden="true"
                />
                <span className="text-[8.5px] font-semibold uppercase tracking-[0.14em] text-magenta-reg md:text-[10px]">
                  Salary payment
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:gap-3">
                <div>
                  <label htmlFor="exp-salary-employee" className={FIELD_LABEL}>
                    Employee
                  </label>
                  <GlassSelect
                    id="exp-salary-employee"
                    value={employeeId}
                    onChange={setEmployeeId}
                    ariaLabel="Employee"
                    options={[
                      { value: "", label: "Choose employee..." },
                      ...employees
                        .filter((e) => e.active !== false)
                        .map((e) => ({ value: e.id, label: `${e.name} · ${e.role}` })),
                    ]}
                    className="input select-glass"
                    fullWidth
                  />
                </div>
                <div>
                  <label htmlFor="exp-salary-month" className={FIELD_LABEL}>
                    Month
                  </label>
                  <GlassMonthPicker
                    id="exp-salary-month"
                    value={salaryMonth}
                    onChange={setSalaryMonth}
                    ariaLabel="Salary month"
                  />
                </div>
              </div>
              {salaryEmployee?.salary && salaryAutoSynced ? (
                <div className="space-y-0.5 rounded-md border border-magenta-reg/20 bg-card/70 px-2 py-1.5 text-[9.5px] md:text-[10.5px]">
                  <div className="flex justify-between gap-3">
                    <span className="text-ink-soft">
                      Base{" "}
                      <span className="text-ink-mute">
                        ({salaryEmployee.salary.payCycle})
                      </span>
                    </span>
                    <span className="num">
                      {formatCurrency(
                        salaryEmployee.salary.base,
                        settings?.currency
                      )}
                    </span>
                  </div>
                  {salaryEmployee.salary.allowances?.map((a, i) => (
                    <div key={i} className="flex justify-between gap-3 text-ink-mute">
                      <span className="min-w-0 truncate">
                        + {a.name || "Allowance"} (
                        {a.type === "percentage" ? `${a.amount}%` : "fixed"})
                      </span>
                      <span className="num shrink-0">
                        {formatCurrency(
                          a.type === "percentage"
                            ? (salaryEmployee.salary?.base ?? 0) * (a.amount / 100)
                            : a.amount,
                          settings?.currency
                        )}
                      </span>
                    </div>
                  ))}
                  <div className="mt-1 flex justify-between gap-3 border-t border-magenta-reg/20 pt-1 font-semibold">
                    <span>Total payable</span>
                    <span className="num text-magenta-reg">
                      <MoneyText
                        value={formatCurrency(form.amount, settings?.currency)}
                      />
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-[9px] text-ink-mute md:text-[10px]">
                  Choose an employee and month to load the payroll amount.
                </p>
              )}
            </div>
          )}

          <div>
            <label htmlFor="exp-description" className={FIELD_LABEL}>Description</label>
            <input
              id="exp-description"
              required
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="input"
              placeholder={
                isSalary
                  ? "Auto-filled from employee & month"
                  : "e.g. Toner cartridge refill"
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-2 md:gap-3">
            <div>
              <label htmlFor="exp-amount" className={FIELD_LABEL}>Amount</label>
              <div className="relative">
                <input
                  id="exp-amount"
                  type="number"
                  step="0.01"
                  min={0}
                  required
                  inputMode="decimal"
                  value={form.amount}
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
                  className="input expense-amount num w-full pr-12 text-right"
                />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[8.5px] font-semibold uppercase tracking-wide text-ink-mute">
                  {settings?.currency || "USD"}
                </span>
              </div>
              {isSalary && salaryEmployee && (
                <div className="mt-0.5 text-[8.5px] text-ink-mute md:text-[9px]">
                  From payroll
                </div>
              )}
            </div>
            <div>
              <label htmlFor="exp-date" className={FIELD_LABEL}>Payment date</label>
              <GlassDatePicker
                id="exp-date"
                value={form.expenseDate}
                onChange={(v) => setForm({ ...form, expenseDate: v })}
                ariaLabel="Payment date"
                className="input"
                fullWidth
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 md:gap-3">
            <div className={isSalary ? "col-span-2" : ""}>
              <label htmlFor="exp-method" className={FIELD_LABEL}>Payment method</label>
              <GlassSelect
                id="exp-method"
                value={form.paymentMethod}
                onChange={(v) =>
                  setForm({ ...form, paymentMethod: v as PaymentMethod })
                }
                ariaLabel="Payment method"
                options={[
                  { value: "cash", label: "Cash" },
                  { value: "card", label: "Card" },
                  { value: "transfer", label: "Transfer" },
                ]}
                className="input select-glass"
                fullWidth
              />
            </div>

            {!isSalary && !isDrawing && (
              <div>
                <label htmlFor="exp-vendor" className={FIELD_LABEL}>Vendor</label>
                <VendorSelect
                  id="exp-vendor"
                  value={form.vendor}
                  onChange={(vendor) => setForm({ ...form, vendor })}
                  placeholder="Select supplier..."
                  allowEmpty
                  className="input select-glass w-full"
                />
              </div>
            )}

            {isDrawing && (
              <div>
                <label htmlFor="exp-payee" className={FIELD_LABEL}>Payee (optional)</label>
                <input
                  id="exp-payee"
                  value={form.vendor}
                  onChange={(e) => setForm({ ...form, vendor: e.target.value })}
                  className="input"
                  placeholder="Admin name or purpose"
                />
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="exp-notes" className={FIELD_LABEL}>Notes</label>
              <button
                type="button"
                onClick={() => setShowNotes((visible) => !visible)}
                aria-expanded={showNotes}
                aria-controls={showNotes ? "exp-notes" : undefined}
                className="mb-0.5 inline-flex items-center gap-1 text-[8.5px] font-semibold uppercase tracking-[0.12em] text-ink-mute transition hover:text-ink"
              >
                <StickyNote className="h-3 w-3" strokeWidth={1.8} aria-hidden="true" />
                {showNotes ? "Hide note" : "Add note"}
              </button>
            </div>
            {showNotes && (
              <textarea
                id="exp-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="input mt-0.5 md:h-20"
                placeholder={
                  isDrawing
                    ? "Purpose, approver or reference…"
                    : "Invoice number, approver or anything worth remembering…"
                }
              />
            )}
          </div>
        </form>
        {/* Pinned footer — actions stay reachable while the form scrolls */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-line/70 px-2.5 py-2 md:px-5 md:py-3.5 md:bg-card">
          <span className="hidden min-w-0 truncate text-[9px] text-ink-mute sm:block md:text-[10px]">
            <span className="font-semibold text-ink-soft">{methodLabel}</span>
            <span className="mx-1 opacity-60">·</span>
            {formatDateByPreference(form.expenseDate, dateFormat)}
          </span>
          <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-outline flex-1 sm:flex-none max-md:text-[12px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="expense-form"
              disabled={upsert.isPending}
              className="btn btn-primary flex-1 sm:flex-none max-md:text-[12px]"
            >
              {upsert.isPending ? (
                "Saving..."
              ) : (
                <>
                  <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
                  {expense ? "Save" : "Record"}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
