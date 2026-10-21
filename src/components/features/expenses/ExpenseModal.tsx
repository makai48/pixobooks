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
        // Drawings are always cash-out of the till by definition.
        paymentMethod: isDrawing ? "cash" : form.paymentMethod,
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
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-4 animate-fade-in">
      <div className="paper-card w-full max-w-md overflow-hidden max-h-[95dvh] flex flex-col">
        <div className="p-5 border-b flex items-center justify-between shrink-0">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-ink-mute">
              {expense ? "Edit expense" : "Record expense"}
            </div>
            <h2 className="font-display text-xl font-bold">
              {isSalary
                ? "Payroll payment"
                : isDrawing
                ? "Owner drawing"
                : "Track shop spend"}
            </h2>
          </div>
          <button onClick={onClose} className="btn btn-ghost">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4 overflow-auto">
          <div>
            <label htmlFor="exp-category" className="label">Category</label>
            <select
              id="exp-category"
              value={form.category}
              onChange={(e) => {
                const category = e.target.value;
                setForm((f) => ({ ...f, category }));
                // Reset salary-specific fields when switching away
                if (category !== "Salary") {
                  setEmployeeId("");
                }
              }}
              className="input mt-1"
            >
              {displayCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {isDrawing && (
            <div className="rounded-lg border border-danger/30 bg-danger/5 p-3 space-y-1">
              <div className="text-[11px] uppercase tracking-widest text-danger font-semibold">
                Owner drawing · cash out of till
              </div>
              <p className="text-[11px] text-ink-mute">
                Drawings are recorded as cash-outs in the Cashbook and
                automatically feed today&apos;s total into the Daily Balancing &amp;
                Banking form. Payment method is fixed to cash.
              </p>
            </div>
          )}

          {isSalary && (
            <div className="rounded-lg border border-magenta-reg/30 bg-magenta-reg/5 p-3 space-y-3">
              <div className="text-[11px] uppercase tracking-widest text-magenta-reg font-semibold">
                Salary payment
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="exp-salary-employee" className="label inline-flex items-center gap-1">
                    <UserIcon className="w-3 h-3" /> Employee
                  </label>
                  <select
                    id="exp-salary-employee"
                    required
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    className="input mt-1"
                  >
                    <option value="">Choose employee...</option>
                    {employees
                      .filter((e) => e.active !== false)
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name} · {e.role}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="exp-salary-month" className="label inline-flex items-center gap-1">
                    <CalendarIcon className="w-3 h-3" /> Month
                  </label>
                  <input
                    id="exp-salary-month"
                    type="month"
                    value={salaryMonth}
                    onChange={(e) => setSalaryMonth(e.target.value)}
                    className="input mt-1"
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
                      {formatCurrency(form.amount, settings?.currency)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <label htmlFor="exp-description" className="label">Description</label>
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

          <div className="grid grid-cols-2 gap-3">
            <div>
            <label htmlFor="exp-amount" className="label">Amount</label>
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
            <label htmlFor="exp-date" className="label">Payment date</label>
            <input
              id="exp-date"
              type="date"
              value={form.expenseDate}
              onChange={(e) => setForm({ ...form, expenseDate: e.target.value })}
              className="input mt-1"
            />
            </div>
            <div className={isSalary || isDrawing ? "col-span-2" : ""}>
            <label htmlFor="exp-method" className="label">Payment method</label>
            <select
              id="exp-method"
              value={isDrawing ? "cash" : form.paymentMethod}
                onChange={(e) =>
                  setForm({ ...form, paymentMethod: e.target.value as PaymentMethod })
                }
                className="input mt-1"
                disabled={isDrawing}
              >
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="transfer">Wire</option>
              </select>
            </div>
          </div>

          {!isSalary && !isDrawing && (
            <div>
            <label htmlFor="exp-vendor" className="label">Vendor</label>
            <input
              id="exp-vendor"
              value={form.vendor}
              onChange={(e) => setForm({ ...form, vendor: e.target.value })}
              className="input mt-1"
              placeholder="Supplier or provider"
            />
            </div>
          )}

          {isDrawing && (
            <div>
            <label htmlFor="exp-payee" className="label">Payee (optional)</label>
            <input
              id="exp-payee"
              value={form.vendor}
              onChange={(e) => setForm({ ...form, vendor: e.target.value })}
              className="input mt-1"
              placeholder="Owner name or purpose (personal, family, etc.)"
            />
            </div>
          )}

          <div>
            <label htmlFor="exp-notes" className="label">Notes</label>
            <textarea
              id="exp-notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="input mt-1 h-20"
            />
          </div>
        </form>
        <div className="flex justify-end gap-2 p-4 border-t shrink-0 bg-card">
          <button type="button" onClick={onClose} className="btn btn-outline">
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
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
