import { useMemo } from "react";
import { useExpenses } from "./useExpenses";
import type { Expense } from "@/types";

export type PayrollEntry = Expense & {
  employeeName: string;
  monthKey: string;
};

/**
 * Derive payroll history from expenses of category "Salary".
 * Expense description is auto-generated in ExpenseModal as
 * "Salary — [Employee Name] — [Month YYYY]" allowing us to extract both.
 */
export function usePayrollHistory() {
  const { data: expenses = [], isLoading } = useExpenses();
  const entries = useMemo<PayrollEntry[]>(() => {
    return expenses
      .filter((e) => (e.category || "").toLowerCase() === "salary")
      .map((e) => {
        const parts = (e.description || "").split(/[—–-]/).map((s) => s.trim());
        const employeeName = parts[1] || e.vendor || "Unassigned";
        const monthKey = (parts[2] || e.expenseDate?.slice(0, 7) || "").trim();
        return { ...e, employeeName, monthKey };
      });
  }, [expenses]);
  return { entries, isLoading };
}
