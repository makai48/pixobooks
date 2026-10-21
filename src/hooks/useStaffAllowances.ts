import { supabase } from "@/lib/supabase";
import type { AttendanceStatus, Employee } from "@/types";
import { AUTO_ALLOWANCE_MARKER } from "@/types";
import { currentBusinessId, withBusiness } from "@/lib/tenant";

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
