import { useMemo, useState } from "react";
import { Wallet, Download, Search, UserCog, UserCheck, KeyRound, Shield } from "lucide-react";
import SubNav from "@/components/layout/SubNav";
import { toast } from "sonner";
import { usePayrollHistory } from "@/hooks/usePayrollHistory";
import { useShopSettings } from "@/hooks/useShopSettings";
import { useAuth } from "@/hooks/useAuth";
import GlassSelect from "@/components/ui/GlassSelect";
import StatCard from "@/components/ui/StatCard";
import { download, formatCurrency, formatDate, formatMoney } from "@/lib/utils";

export default function PayrollHistoryPage() {
  const { can, isAppOwner } = useAuth();
  const { entries, isLoading } = usePayrollHistory();
  const { data: settings } = useShopSettings();
  const [q, setQ] = useState("");
  const [year, setYear] = useState<string>(new Date().getFullYear().toString());

  const canView = isAppOwner || can("employees.payroll") || can("expenses.view");

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (year !== "all" && !(e.expenseDate || "").startsWith(year)) return false;
      if (!q) return true;
      const query = q.toLowerCase();
      return (
        e.employeeName.toLowerCase().includes(query) ||
        e.description.toLowerCase().includes(query) ||
        e.monthKey.toLowerCase().includes(query)
      );
    });
  }, [entries, q, year]);

  const byEmployee = useMemo(() => {
    const m = new Map<string, { name: string; total: number; count: number }>();
    for (const e of filtered) {
      const cur = m.get(e.employeeName) || { name: e.employeeName, total: 0, count: 0 };
      cur.total += e.amount;
      cur.count += 1;
      m.set(e.employeeName, cur);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [filtered]);

  const years = useMemo(() => {
    const s = new Set<string>();
    for (const e of entries) s.add((e.expenseDate || "").slice(0, 4));
    return ["all", ...Array.from(s).sort().reverse()];
  }, [entries]);

  const exportCsv = () => {
    const rows = [
      ["Date", "Employee", "Month", "Amount", "Description"],
      ...filtered.map((e) => [
        e.expenseDate,
        e.employeeName,
        e.monthKey,
        e.amount.toFixed(2),
        e.description.replace(/,/g, ";"),
      ]),
    ];
    download(`payroll-history-${year}.csv`, rows.map((r) => r.join(",")).join("\n"));
    toast.success("Payroll CSV exported");
  };

  if (!canView) {
    return (
      <div className="p-4 md:p-8 max-w-lg mx-auto text-center">
        <div className="paper-card p-6 md:p-8">
          <Wallet className="w-7 h-7 md:w-8 md:h-8 mx-auto text-ink-mute" />
          <h2 className="font-display text-lg md:text-xl font-bold mt-2 md:mt-3">Restricted</h2>
          <p className="text-[11px] md:text-sm text-ink-mute mt-1">
            Only owners and payroll-authorized users can view this log.
          </p>
        </div>
      </div>
    );
  }

  const currency = settings?.currency || "USD";
  const grandTotal = filtered.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="p-2.5 md:p-6 space-y-2 md:space-y-4">
      <SubNav
        items={[
          { to: "/employees", label: "Team", icon: UserCog },
          { to: "/payroll-history", label: "Payroll", icon: Wallet },
          { to: "/account-approvals", label: "Approvals", icon: UserCheck },
          { to: "/password-resets", label: "Password Resets", icon: KeyRound },
          { to: "/audit-log", label: "Audit Log", icon: Shield },
        ]}
      />

      <div className="paper-card p-2.5 md:p-4 flex flex-col md:flex-row md:items-center gap-1.5 md:gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-base md:text-xl font-bold leading-tight">Payroll history</h1>
          <p className="text-[10px] md:text-xs text-ink-mute">
            Every Salary expense recorded — grouped by employee and month.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <div className="relative flex-1 min-w-[110px] md:flex-none">
            <Search className="w-3.5 h-3.5 md:w-4 md:h-4 absolute left-2 md:left-3 top-1/2 -translate-y-1/2 text-ink-mute pointer-events-none" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Employee, month..."
              className="input input-sm pl-7 md:pl-9 md:w-52"
            />
          </div>
          <GlassSelect
            value={year}
            onChange={setYear}
            ariaLabel="Payroll year"
            options={years.map((y) => ({
              value: y,
              label: y === "all" ? "All years" : y,
            }))}
            className="input input-sm select-glass"
          />
          <button onClick={exportCsv} className="btn btn-primary btn-sm shrink-0">
            <Download className="w-3.5 h-3.5 md:w-4 md:h-4" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5 md:gap-3">
        <StatCard label="Entries" value={String(filtered.length)} />
        <StatCard
          label="Total paid"
          value={formatMoney(grandTotal, currency)}
          fullValue={formatCurrency(grandTotal, currency)}
        />
        <StatCard label="Employees" value={String(byEmployee.length)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-4">
        <div className="md:col-span-1 paper-card p-2.5 md:p-4">
          <h3 className="font-display text-sm md:text-lg font-bold mb-1 md:mb-2">By employee</h3>
          {byEmployee.length === 0 ? (
            <div className="text-[11px] md:text-sm text-ink-mute">No payroll yet.</div>
          ) : (
            <div className="space-y-0.5 md:space-y-1">
              {byEmployee.map((e) => (
                <div
                  key={e.name}
                  className="flex items-center justify-between h-[26px] md:h-10 px-1.5 md:px-2 rounded hover:bg-paper/50"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-[10px] md:text-sm truncate leading-tight">{e.name}</div>
                    <div className="text-[8px] md:text-[11px] text-ink-mute leading-tight">
                      {e.count} payment{e.count === 1 ? "" : "s"}
                    </div>
                  </div>
                  <div className="num font-bold text-[10px] md:text-sm shrink-0">
                    {formatMoney(e.total, currency)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="md:col-span-2 paper-card overflow-hidden">
          <div className="overflow-auto max-h-[50vh] md:max-h-[65vh] scroll-lined">
            <table className="w-full text-[11px] md:text-sm">
              <thead>
                <tr className="text-left text-[8px] md:text-[11px] uppercase tracking-wide md:tracking-widest text-ink-mute bg-paper/60 sticky top-0">
                  <th className="p-1.5 pl-3 md:p-3 md:pl-5">Date</th>
                  <th className="p-1.5 md:p-3">Employee</th>
                  <th className="p-1.5 md:p-3 hidden md:table-cell">Month</th>
                  <th className="p-1.5 pr-3 md:p-3 md:pr-5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={4} className="p-6 md:p-8 text-center text-ink-mute">
                      Loading...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 md:p-10 text-center text-ink-mute">
                      No salary entries recorded.
                    </td>
                  </tr>
                ) : (
                  filtered.map((e) => (
                    <tr key={e.id} className="border-t hover:bg-paper/40">
                      <td className="px-1.5 md:px-3 pl-3 md:pl-5 h-[21px] md:h-[30px] text-[10px] md:text-xs whitespace-nowrap">
                        {formatDate(e.expenseDate)}
                      </td>
                      <td className="px-1.5 md:px-3 h-[21px] md:h-[30px] font-semibold text-[10px] md:text-sm truncate max-w-[130px] md:max-w-none">
                        {e.employeeName}
                      </td>
                      <td className="px-1.5 md:px-3 h-[21px] md:h-[30px] text-[10px] md:text-xs text-ink-mute hidden md:table-cell">
                        {e.monthKey}
                      </td>
                      <td className="px-1.5 pr-3 md:px-3 md:pr-5 h-[21px] md:h-[30px] text-right num font-semibold text-[10px] md:text-sm whitespace-nowrap">
                        {formatMoney(e.amount, currency)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
