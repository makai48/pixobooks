import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { mapAttendance, mapEmployee } from "@/lib/mappers";
import type { AttendanceRecord, AttendanceStatus } from "@/types";
import { ATTENDANCE_META } from "@/types";
import { useActiveBusiness } from "@/hooks/useBusinesses";
import { withBusiness, currentBusinessId } from "@/lib/tenant";
import { localISODate } from "@/lib/utils";
import { syncStaffAllowancesForAttendance } from "./useStaffAllowances";

/** Automatic attendance validation requires at least this many transactions. */
export const ATTENDANCE_AUTO_MIN_TRANSACTIONS = 3;

export function useAttendance(employeeId?: string, fromDate?: string, toDate?: string) {
  const active = useActiveBusiness();
  const businessId = active === "none" ? null : active;
  return useQuery({
    queryKey: ["attendance", businessId, employeeId, fromDate, toDate],
    queryFn: async () => {
      let q = supabase.from("attendance").select("*").order("date", { ascending: false });
      if (businessId) q = q.eq("business_id", businessId);
      if (employeeId) q = q.eq("employee_id", employeeId);
      if (fromDate) q = q.gte("date", fromDate);
      if (toDate) q = q.lte("date", toDate);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map(mapAttendance);
    },
    enabled: !!employeeId || !fromDate,
    refetchInterval: 60000,
  });
}

/**
 * Daily transaction counts for one employee.
 *
 * This powers attendance eligibility: a day can be auto-validated only when
 * the employee actually made at least ATTENDANCE_AUTO_MIN_TRANSACTIONS sales.
 * All other days stay manual.
 */
export function useEmployeeTransactionDays(
  employeeId: string,
  employeeName: string,
  fromDate: string,
  toDate: string
) {
  const active = useActiveBusiness();
  const businessId = active === "none" ? null : active;
  const nameKey = (value: string) =>
    (value || "").trim().replace(/\s+/g, " ").toLowerCase();
  return useQuery({
    queryKey: [
      "employee_transaction_days",
      businessId,
      employeeId,
      nameKey(employeeName),
      fromDate,
      toDate,
    ],
    queryFn: async () => {
      const fromIso = new Date(`${fromDate}T00:00:00`).toISOString();
      const toIso = new Date(`${toDate}T23:59:59.999`).toISOString();
      let q = supabase
        .from("sales")
        .select("created_at, cashier_id, cashier_name")
        .gte("created_at", fromIso)
        .lte("created_at", toIso);
      if (businessId) q = q.eq("business_id", businessId);
      const { data, error } = await q;
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of data || []) {
        const matchesId = row.cashier_id && row.cashier_id === employeeId;
        const matchesName = nameKey(String(row.cashier_name || "")) === nameKey(employeeName);
        if (!matchesId && !matchesName) continue;
        const day = localISODate(String(row.created_at));
        if (day < fromDate || day > toDate) continue;
        counts[day] = (counts[day] || 0) + 1;
      }
      return counts;
    },
    enabled: !!employeeId && !!fromDate && !!toDate,
    refetchInterval: 60000,
  });
}

export function useAutoValidateAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      employeeId,
      employeeName,
      days,
    }: {
      employeeId: string;
      employeeName: string;
      /** date -> transaction count */
      days: Record<string, number>;
    }) => {
      const today = localISODate(new Date());
      const eligible = Object.entries(days)
        .filter(([date, count]) => date <= today && count >= ATTENDANCE_AUTO_MIN_TRANSACTIONS)
        .map(([date, count]) => ({ date, count }));

      if (eligible.length === 0) return 0;

      const { data: existing, error: existingErr } = await supabase
        .from("attendance")
        .select("date")
        .eq("employee_id", employeeId)
        .in("date", eligible.map((d) => d.date));
      if (existingErr) throw existingErr;

      const already = new Set((existing || []).map((r) => String(r.date)));
      const rows = eligible
        .filter((d) => !already.has(d.date))
        .map((d) => ({
          employee_id: employeeId,
          employee_name: employeeName,
          date: d.date,
          status: "present",
          hours: ATTENDANCE_META.present.hours,
          notes: `Auto-validated from ${d.count} transactions`,
        }));

      if (rows.length === 0) return 0;

      const { error } = await supabase
        .from("attendance")
        .insert(rows.map((row) => withBusiness(row)));
      if (error) throw error;

      // Mirror the normal attendance path: auto-validated present days also
      // create any daily staff-allowance expense. Best-effort only.
      try {
        const { data: profileRow } = await supabase
          .from("user_profiles")
          .select("*")
          .eq("id", employeeId)
          .maybeSingle();
        if (profileRow) {
          const profile = mapEmployee(profileRow);
          await Promise.all(
            rows.map((row) =>
              syncStaffAllowancesForAttendance({
                employee: profile,
                status: "present",
                date: row.date,
              }).catch(() => undefined)
            )
          );
        }
      } catch {
        // Allowance sync must never break the validation result.
      }

      return rows.length;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
    },
  });
}

/**
 * Called after a completed sale. Once the cashier reaches the minimum number
 * of transactions for today, mark today Present if it is still unmarked.
 * Days below the threshold stay untouched for manual attendance entry.
 */
export async function autoValidateAttendanceFromSales(opts: {
  employeeId?: string | null;
  employeeName: string;
}): Promise<boolean> {
  const employeeName = (opts.employeeName || "").trim();
  const employeeId = opts.employeeId;
  if (!employeeId) return false;
  const today = localISODate(new Date());
  const nameKey = (value: string) =>
    (value || "").trim().replace(/\s+/g, " ").toLowerCase();

  let q = supabase
    .from("sales")
    .select("cashier_id, cashier_name")
    .gte("created_at", new Date(`${today}T00:00:00`).toISOString())
    .lte("created_at", new Date(`${today}T23:59:59.999`).toISOString());
  const bid = currentBusinessId();
  if (bid) q = q.eq("business_id", bid);
  const { data, error } = await q;
  if (error) return false;

  const count = (data || []).filter(
    (row) =>
      row.cashier_id === employeeId ||
      nameKey(String(row.cashier_name || "")) === nameKey(employeeName)
  ).length;
  if (count < ATTENDANCE_AUTO_MIN_TRANSACTIONS) return false;

  const { data: existing } = await supabase
    .from("attendance")
    .select("id")
    .eq("employee_id", employeeId)
    .eq("date", today)
    .maybeSingle();
  if (existing?.id) return false;

  const { error: insertErr } = await supabase.from("attendance").insert(
    withBusiness({
      employee_id: employeeId,
      employee_name: employeeName,
      date: today,
      status: "present",
      hours: ATTENDANCE_META.present.hours,
      notes: `Auto-validated from ${count} transactions`,
    })
  );
  return !insertErr;
}

type UpsertAttendance = {
  id?: string;
  employeeId: string;
  employeeName: string;
  date: string;
  status: AttendanceStatus;
  hours?: number;
  clockIn?: string | null;
  clockOut?: string | null;
  notes?: string | null;
};

export function useUpsertAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: UpsertAttendance) => {
      const payload: Record<string, unknown> = {
        employee_id: a.employeeId,
        employee_name: a.employeeName,
        date: a.date,
        status: a.status,
        hours: a.hours ?? ATTENDANCE_META[a.status].hours,
        clock_in: a.clockIn || null,
        clock_out: a.clockOut || null,
        notes: a.notes || null,
      };
      // Check if attendance for this day exists
      const bid = currentBusinessId();
      let existingQ = supabase
        .from("attendance")
        .select("id")
        .eq("employee_id", a.employeeId)
        .eq("date", a.date);
      if (bid) existingQ = existingQ.eq("business_id", bid);
      const { data: existing } = await existingQ.maybeSingle();

      let record: AttendanceRecord;
      if (existing?.id) {
        const { data, error } = await supabase
          .from("attendance")
          .update(payload)
          .eq("id", existing.id)
          .select()
          .single();
        if (error) throw error;
        record = mapAttendance(data);
      } else {
        const { data, error } = await supabase
          .from("attendance")
          .insert(withBusiness(payload))
          .select()
          .single();
        if (error) throw error;
        record = mapAttendance(data);
      }

      // Auto-create staff-allowance expenses for daily-payCycle allowances
      // when the day is marked Present or Half-day. Idempotent via the
      // AUTO_ALLOWANCE marker in the expense notes.
      if (a.status === "present" || a.status === "halfday") {
        try {
          const { data: profileRow } = await supabase
            .from("user_profiles")
            .select("*")
            .eq("id", a.employeeId)
            .maybeSingle();
          if (profileRow) {
            const employee = mapEmployee(profileRow);
            await syncStaffAllowancesForAttendance({
              employee,
              status: a.status,
              date: a.date,
            });
          }
        } catch (err) {
          // Silent: allowance sync must never break attendance marking.
          if (import.meta.env.DEV) console.warn("staff-allowance sync failed:", err);
        }
      }

      return record;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
    },
  });
}

export function attendanceStats(records: AttendanceRecord[]) {
  const stats = {
    present: 0,
    absent: 0,
    halfday: 0,
    leave: 0,
    holiday: 0,
    totalHours: 0,
  };
  for (const r of records) {
    if (r.status === "present" || r.status === "absent" || r.status === "halfday" || r.status === "leave" || r.status === "holiday") {
      stats[r.status] += 1;
    }
    stats.totalHours += r.hours || 0;
  }
  return stats;
}
