import { supabase } from "@/lib/supabase";
import type { AttendanceStatus, Employee } from "@/types";
import { AUTO_ALLOWANCE_MARKER, TXN_ALLOWANCE_MARKER } from "@/types";
import type {
  PendingTxnAllowance,
  TransactionAllowancePolicy,
  TxnAllowancePeriod,
} from "@/types";
import { currentBusinessId, withBusiness } from "@/lib/tenant";
import {
  formatDateByPreference,
  formatMonthByPreference,
  getActiveDateFormat,
} from "@/lib/dateFormat";

/**
 * Automatically create staff-allowance expense entries when attendance
 * is marked Present or Half-day for an employee. Only allowances with
 * a "daily" pay cycle in the employee's payroll profile qualify —
 * weekly/monthly/annual allowances are paid via the normal Salary
 * expense flow.
 *
 * Idempotency: the `notes` field of each expense includes a marker of
 * shape `AUTO_ALLOWANCE:<employeeId>:<date>:<allowanceName>` which is
 * queried before insertion. If an entry already exists it is skipped.
 * Half-day attendance receives 50% of the daily amount.
 */
export async function syncStaffAllowancesForAttendance(opts: {
  employee: Employee;
  status: AttendanceStatus;
  date: string;
  actor?: { id: string; name: string };
}): Promise<{ created: number; skipped: number }> {
  const { employee, status, date } = opts;
  if (status !== "present" && status !== "halfday") return { created: 0, skipped: 0 };
  const dailyAllowances = (employee.salary?.allowances || []).filter(
    (a) => (a.payCycle || employee.salary?.payCycle) === "daily" && Number(a.amount || 0) > 0
  );
  if (dailyAllowances.length === 0) return { created: 0, skipped: 0 };

  const base = Number(employee.salary?.base || 0);
  const halfFactor = status === "halfday" ? 0.5 : 1;
  let created = 0;
  let skipped = 0;

  for (const a of dailyAllowances) {
    const rawAmount =
      a.type === "percentage" ? (base * Number(a.amount || 0)) / 100 : Number(a.amount || 0);
    const amount = Math.round(rawAmount * halfFactor * 100) / 100;
    if (amount <= 0) continue;

    const allowanceName = (a.name || "Allowance").trim();
    const marker = `${AUTO_ALLOWANCE_MARKER}:${employee.id}:${date}:${allowanceName}`;

    // Check for an existing auto-created expense for this employee /
    // date / allowance — dedup even across re-runs.
    const bid = currentBusinessId();
    let existingQ = supabase
      .from("expenses")
      .select("id")
      .eq("expense_date", date)
      .eq("category", "Staff Allowance");
    if (bid) existingQ = existingQ.eq("business_id", bid);
    const { data: existing } = await existingQ
      .ilike("notes", `%${marker}%`)
      .maybeSingle();

    if (existing?.id) {
      skipped += 1;
      continue;
    }

    const description = `${allowanceName} — ${employee.name} — ${date}${
      status === "halfday" ? " (½ day)" : ""
    }`;
    const notes = `${marker}\nAuto-generated from attendance (${status}). Payroll profile → ${allowanceName}.`;

    const { error } = await supabase
      .from("expenses")
      .insert(
        withBusiness({
          category: "Staff Allowance",
          description,
          amount,
          expense_date: date,
          payment_method: "cash",
          vendor: employee.id,
          notes,
          created_by: opts.actor?.id || null,
          created_by_name: opts.actor?.name || "Auto-attendance",
        })
      );
    if (!error) created += 1;
  }

  return { created, skipped };
}

/* ------------------------------------------------------------------ */
/* Transaction-count-based allowance policy (Item 7).                  */
/*                                                                     */
/* When an employee enters `policy.threshold` transactions inside one  */
/* period, their allowance is auto-considered: it either posts straight */
/* to the ledger as a "Staff Allowance" expense, or — when the policy  */
/* requires approval — waits in the settings pending queue for a       */
/* manager/accountant to approve. Idempotency uses the same marker     */
/* technique as the attendance flow.                                   */
/* ------------------------------------------------------------------ */

export type TxnPeriodInfo = {
  key: string;
  label: string;
  /** Inclusive YYYY-MM-DD lower bound for `created_at`. */
  startISO: string;
  /** Exclusive YYYY-MM-DD upper bound for `created_at`. */
  endISO: string;
};

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;

export function txnPeriodInfo(
  period: TxnAllowancePeriod,
  refISO?: string
): TxnPeriodInfo {
  const ref = refISO || new Date().toISOString().slice(0, 10);
  const [y, m, d] = ref.split("-").map(Number);
  const base = new Date(y || 1970, (m || 1) - 1, d || 1);
  const dateFormat = getActiveDateFormat();
  if (period === "weekly") {
    const monday = new Date(base);
    monday.setDate(base.getDate() - ((base.getDay() + 6) % 7));
    const next = new Date(monday);
    next.setDate(monday.getDate() + 7);
    return {
      key: `W:${isoDay(monday)}`,
      label: `Week of ${formatDateByPreference(monday, dateFormat, true)}`,
      startISO: isoDay(monday),
      endISO: isoDay(next),
    };
  }
  if (period === "monthly") {
    const s = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(
      2,
      "0"
    )}-01`;
    const next = new Date(base.getFullYear(), base.getMonth() + 1, 1);
    return {
      key: `M:${s.slice(0, 7)}`,
      label: formatMonthByPreference(base, dateFormat),
      startISO: s,
      endISO: isoDay(next),
    };
  }
  const next = new Date(base);
  next.setDate(base.getDate() + 1);
  return {
    key: `D:${ref}`,
    label: formatDateByPreference(base, dateFormat),
    startISO: ref,
    endISO: isoDay(next),
  };
}

export async function countCashierTransactions(
  employeeId: string,
  startISO: string,
  endISO: string
): Promise<number> {
  const bid = currentBusinessId();
  let q = supabase
    .from("sales")
    .select("id", { count: "exact", head: true })
    .eq("cashier_id", employeeId)
    .gte("created_at", `${startISO}T00:00:00`)
    .lt("created_at", `${endISO}T00:00:00`);
  if (bid) q = q.eq("business_id", bid);
  const { count, error } = await q;
  if (error) throw error;
  return count || 0;
}

export async function postTxnAllowanceExpense(opts: {
  employeeId: string;
  employeeName: string;
  periodLabel: string;
  count: number;
  amount: number;
  allowanceName: string;
  marker: string;
  actor?: { id?: string | null; name?: string | null };
  expenseDate?: string;
}): Promise<void> {
  const description = `${opts.allowanceName} — ${opts.employeeName} — ${opts.periodLabel} (${opts.count} txns)`;
  const notes =
    `${opts.marker}\n` +
    `Auto-considered: ${opts.count} transactions in ${opts.periodLabel}.`;
  const { error } = await supabase.from("expenses").insert(
    withBusiness({
      category: "Staff Allowance",
      description,
      amount: opts.amount,
      expense_date: opts.expenseDate || new Date().toISOString().slice(0, 10),
      payment_method: "cash",
      vendor: opts.employeeId,
      notes,
      created_by: opts.actor?.id || null,
      created_by_name: opts.actor?.name || "Auto-policy",
    })
  );
  if (error) throw error;
}

export type TxnAwardOutcome =
  | { status: "disabled" }
  | { status: "below"; count: number }
  | { status: "dismissed" }
  | { status: "skipped" }
  | { status: "exists" }
  | { status: "pending"; award: PendingTxnAllowance }
  | { status: "created"; amount: number };

/**
 * Sale-completion entry point: count this cashier's transactions in the
 * policy period and auto-consider the allowance. Fire-and-forget — every
 * failure path resolves silently so checkout (and its receipt) is never
 * blocked or delayed by the policy engine.
 */
export async function evaluateTxnPolicyForCashier(opts: {
  cashierId: string | null;
  employees: Pick<Employee, "id" | "name" | "salary">[];
  policy?: TransactionAllowancePolicy;
  pending?: PendingTxnAllowance[];
  actor?: { id?: string | null; name?: string | null };
  persistPending: (next: PendingTxnAllowance[]) => Promise<void>;
  onAward?: (
    outcome: Extract<TxnAwardOutcome, { status: "pending" | "created" }>
  ) => void;
}): Promise<void> {
  const { policy } = opts;
  if (!policy?.enabled || !opts.cashierId) return;
  const employee = opts.employees.find((e) => e.id === opts.cashierId);
  if (!employee) return;
  const info = txnPeriodInfo(policy.period);
  let count = 0;
  try {
    count = await countCashierTransactions(
      employee.id,
      info.startISO,
      info.endISO
    );
  } catch {
    return;
  }
  if (count <= 0) return;
  try {
    const outcome = await evaluateTxnAllowance({
      employee,
      policy,
      count,
      period: policy.period,
      periodKey: info.key,
      periodLabel: info.label,
      actor: opts.actor,
      currentPending: opts.pending || [],
      persistPending: opts.persistPending,
    });
    if (
      (outcome.status === "pending" || outcome.status === "created") &&
      opts.onAward
    ) {
      opts.onAward(outcome);
    }
  } catch {
    /* never break the sale flow */
  }
}

export async function evaluateTxnAllowance(opts: {
  employee: Pick<Employee, "id" | "name" | "salary">;
  policy: TransactionAllowancePolicy;
  count: number;
  period: TxnAllowancePeriod;
  periodKey: string;
  periodLabel: string;
  actor?: { id?: string | null; name?: string | null };
  currentPending: PendingTxnAllowance[];
  persistPending: (next: PendingTxnAllowance[]) => Promise<void>;
}): Promise<TxnAwardOutcome> {
  const { employee, policy } = opts;
  if (!policy.enabled) return { status: "disabled" };
  if (opts.count < policy.threshold)
    return { status: "below", count: opts.count };
  const key = `${employee.id}:${opts.periodKey}`;
  if (policy.dismissed.includes(key)) return { status: "dismissed" };

  const allowanceName = (policy.allowanceName || "Transaction bonus").trim();
  const base = Number(employee.salary?.base || 0);
  const raw =
    policy.amountType === "percentage"
      ? (base * Number(policy.amount || 0)) / 100
      : Number(policy.amount || 0);
  const amount = Math.round(raw * 100) / 100;
  if (amount <= 0) return { status: "skipped" };

  const marker = `${TXN_ALLOWANCE_MARKER}:${employee.id}:${opts.periodKey}:${allowanceName}`;
  if (opts.currentPending.some((p) => p.key === key))
    return { status: "exists" };

  const bid = currentBusinessId();
  let existingQ = supabase
    .from("expenses")
    .select("id")
    .eq("category", "Staff Allowance")
    .ilike("notes", `%${marker}%`);
  if (bid) existingQ = existingQ.eq("business_id", bid);
  const { data: existing } = await existingQ.maybeSingle();
  if (existing?.id) return { status: "exists" };

  if (policy.requireApproval) {
    const award: PendingTxnAllowance = {
      key,
      employeeId: employee.id,
      employeeName: employee.name,
      period: opts.period,
      periodKey: opts.periodKey,
      periodLabel: opts.periodLabel,
      count: opts.count,
      amount,
      allowanceName,
      createdAt: new Date().toISOString(),
    };
    await opts.persistPending([...opts.currentPending, award]);
    return { status: "pending", award };
  }

  await postTxnAllowanceExpense({
    employeeId: employee.id,
    employeeName: employee.name,
    periodLabel: opts.periodLabel,
    count: opts.count,
    amount,
    allowanceName,
    marker,
    actor: opts.actor,
  });
  return { status: "created", amount };
}
