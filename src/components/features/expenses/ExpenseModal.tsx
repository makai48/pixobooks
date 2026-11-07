import { useEffect, useMemo, useState } from "react";
import { X, User as UserIcon, Calendar as CalendarIcon } from "lucide-react";
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
import MoneyText from "@/components/ui/MoneyText";
import GlassDatePicker from "@/components/ui/GlassDatePicker";
import GlassMonthPicker from "@/components/ui/GlassMonthPicker";
import GlassSelect from "@/components/ui/GlassSelect";
import VendorSelect from "@/components/features/suppliers/VendorSelect";

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

  const isSalary = form.category === "Salary";
  const isDrawing = form.category === "Drawings";

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
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-end md:items-center justify-center p-2 md:p-4 animate-fade-in">
      <div className="paper-card w-full max-w-md max-h-[94dvh] md:max-h-[92vh] overflow-hidden flex flex-col">
        <div className="px-2.5 md:px-5 py-2 md:py-4 border-b flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <div className="text-[9px] md:text-[11px] uppercase tracking-wide md:tracking-widest text-ink-mute truncate">
              {expense ? "Edit expense" : isDrawing ? "New drawing" : "Record expense"}
            </div>
            <h2 className="font-display text-base md:text-xl font-bold leading-tight">
              {isSalary
                ? "Payroll payment"
                : isDrawing
                ? "Owner drawing"
                : "Track shop spend"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-sm max-md:w-7 max-md:px-0 shrink-0"
            aria-label="Close expense"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <form
          id="expense-form"
          onSubmit={submit}
          className="flex-1 overflow-auto p-2.5 md:p-5 space-y-2 md:space-y-4"
        >
          <div>
            <label htmlFor="exp-category" className="label text-[9px] md:text-xs">Category</label>
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
              className="input select-glass mt-1"
            />
          </div>

          {isDrawing && (
            <div className="rounded-lg border border-danger/30 bg-danger/5 p-2.5 md:p-3 space-y-0.5 md:space-y-1">
              <div className="text-[9px] md:text-[11px] uppercase tracking-wide md:tracking-widest text-danger font-semibold">
                Owner drawing
              </div>
              <p className="text-[10px] md:text-[11px] text-ink-mute">
                Drawings feed today&apos;s total into the Daily Balancing &amp;
                Banking form. Cash drawings leave the till immediately;
                transfer or card drawings are recorded without affecting the
                till count.
              </p>
            </div>
          )}

          {isSalary && (
            <div className="rounded-lg border border-magenta-reg/30 bg-magenta-reg/5 p-2.5 md:p-3 space-y-2 md:space-y-3">
              <div className="text-[9px] md:text-[11px] uppercase tracking-wide md:tracking-widest text-magenta-reg font-semibold">
                Salary payment
              </div>
              <div className="grid grid-cols-2 gap-1.5 md:gap-3">
                <div>
                  <label htmlFor="exp-salary-employee" className="label text-[9px] md:text-xs inline-flex items-center gap-1">
                    <UserIcon className="w-3 h-3" /> Employee
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
                    className="input select-glass mt-1"
                  />
                </div>
                <div>
                  <label htmlFor="exp-salary-month" className="label text-[9px] md:text-xs inline-flex items-center gap-1">
                    <CalendarIcon className="w-3 h-3" /> Month
                  </label>
                  <GlassMonthPicker
                    id="exp-salary-month"
                    value={salaryMonth}
                    onChange={setSalaryMonth}
                    ariaLabel="Salary month"
                    className="mt-1"
                  />
                </div>
              </div>
              {salaryEmployee?.salary && salaryAutoSynced && (
                <div className="text-[11px] text-ink-soft space-y-0.5 border-t border-magenta-reg/20 pt-2">
                  <div className="flex justify-between">
                    <span>Base ({salaryEmployee.salary.payCycle})</span>
                    <span className="num">
                      {formatCurrency(
                        salaryEmployee.salary.base,
                        settings?.currency
                      )}
                    </span>
                  </div>
                  {salaryEmployee.salary.allowances?.map((a, i) => (
                    <div key={i} className="flex justify-between text-ink-mute">
                      <span>
                        + {a.name || "Allowance"} ({a.type === "percentage" ? `${a.amount}%` : "fixed"})
                      </span>
                      <span className="num">
                        {formatCurrency(
                          a.type === "percentage"
                            ? (salaryEmployee.salary?.base ?? 0) * (a.amount / 100)
                            : a.amount,
                          settings?.currency
                        )}
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between font-semibold pt-1 border-t border-magenta-reg/20">
                    <span>Total payable</span>
                    <span className="num text-magenta-reg">
                      <MoneyText value={formatCurrency(form.amount, settings?.currency)} />
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <label htmlFor="exp-description" className="label text-[9px] md:text-xs">Description</label>
            <input
              id="exp-description"
              required
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="input mt-1"
              placeholder={
                isSalary
                  ? "Auto-filled from employee & month"
                  : "e.g. Toner cartridge refill"
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-1.5 md:gap-3">
            <div>
              <label htmlFor="exp-amount" className="label text-[9px] md:text-xs">Amount</label>
            <input
              id="exp-amount"
              type="number"
              step="0.01"
              min={0}
              required
              value={form.amount}
                onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
                className="input mt-1 num text-right"
              />
              {isSalary && salaryEmployee && (
                <div className="text-[10px] text-ink-mute mt-1">
                  Predefined from employee payroll
                </div>
              )}
            </div>
            <div>
              <label htmlFor="exp-date" className="label text-[9px] md:text-xs">Payment date</label>
              <GlassDatePicker
                id="exp-date"
                value={form.expenseDate}
                onChange={(v) => setForm({ ...form, expenseDate: v })}
                ariaLabel="Payment date"
                className="input mt-1"
              />
            </div>
            <div className={isSalary ? "col-span-2" : ""}>
              <label htmlFor="exp-method" className="label text-[9px] md:text-xs">Payment method</label>
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
                  { value: "transfer", label: "Wire" },
                ]}
                className="input select-glass mt-1"
              />
            </div>
          </div>

          {!isSalary && !isDrawing && (
            <div>
              <label htmlFor="exp-vendor" className="label text-[9px] md:text-xs">Vendor</label>
            <VendorSelect
              id="exp-vendor"
              value={form.vendor}
              onChange={(vendor) => setForm({ ...form, vendor })}
              placeholder="Select supplier..."
              allowEmpty
            />
            </div>
          )}

          {isDrawing && (
            <div>
              <label htmlFor="exp-payee" className="label text-[9px] md:text-xs">Payee (optional)</label>
            <input
              id="exp-payee"
              value={form.vendor}
              onChange={(e) => setForm({ ...form, vendor: e.target.value })}
              className="input mt-1"
              placeholder="Admin name or purpose (personal, family, etc.)"
            />
            </div>
          )}

          <div>
            <label htmlFor="exp-notes" className="label text-[9px] md:text-xs">Notes</label>
            <textarea
              id="exp-notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="input mt-1 h-14 md:h-20 text-[13px] md:text-sm"
            />
          </div>
        </form>
        {/* Pinned footer — actions stay reachable while the form scrolls */}
        <div className="shrink-0 flex items-center justify-end gap-1.5 md:gap-2 px-2.5 md:px-5 py-2 md:p-4 border-t md:bg-card">
          <button type="button" onClick={onClose} className="btn btn-outline">
            Cancel
          </button>
          <button
            type="submit"
            form="expense-form"
            disabled={upsert.isPending}
            className="btn btn-primary"
          >
            {upsert.isPending ? "Saving..." : expense ? "Save" : "Record"}
          </button>
        </div>
      </div>
    </div>
  );
}
