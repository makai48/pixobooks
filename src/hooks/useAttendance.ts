import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { mapAttendance, mapEmployee } from "@/lib/mappers";
import type { AttendanceRecord, AttendanceStatus } from "@/types";
import { ATTENDANCE_META } from "@/types";
import { useActiveBusiness } from "@/hooks/useBusinesses";
import { withBusiness, currentBusinessId } from "@/lib/tenant";
import { syncStaffAllowancesForAttendance } from "./useStaffAllowances";

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
