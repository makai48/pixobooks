import { useMemo, useState } from "react";
import { Wallet, Download, Search, UserCog, UserCheck, KeyRound, Shield } from "lucide-react";
import SubNav from "@/components/layout/SubNav";
import { toast } from "sonner";
import { usePayrollHistory } from "@/hooks/usePayrollHistory";
import { useShopSettings } from "@/hooks/useShopSettings";
import { useAuth } from "@/hooks/useAuth";
import { cn, download, formatCurrency, formatDate } from "@/lib/utils";

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
      <div className="p-8 max-w-lg mx-auto text-center">
        <div className="paper-card p-8">
          <Wallet className="w-8 h-8 mx-auto text-ink-mute" />
          <h2 className="font-display text-xl font-bold mt-3">Restricted</h2>
          <p className="text-sm text-ink-mute mt-1">
            Only owners and payroll-authorized users can view this log.
          </p>
        </div>
      </div>
    );
  }

  const grandTotal = filtered.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <SubNav
        items={[
          { to: "/employees", label: "Team", icon: UserCog },
          { to: "/payroll-history", label: "Payroll", icon: Wallet },
          { to: "/account-approvals", label: "Approvals", icon: UserCheck },
          { to: "/password-resets", label: "Password Resets", icon: KeyRound },
          { to: "/audit-log", label: "Audit Log", icon: Shield },
        ]}
      />
      <div className="paper-card p-4 flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-xl font-bold">Payroll history</h1>
          <p className="text-xs text-ink-mute">
            Every Salary expense recorded — grouped by employee and month.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Employee, month..."
              className="input pl-9 h-10 w-52"
            />
          </div>
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="input h-10 w-auto"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y === "all" ? "All years" : y}
              </option>
            ))}
          </select>
          <button onClick={exportCsv} className="btn btn-primary h-10">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Entries" value={String(filtered.length)} />
        <Stat
          label="Total paid"
          value={formatCurrency(grandTotal, settings?.currency)}
        />
        <Stat label="Employees" value={String(byEmployee.length)} />
        <Stat label="Year" value={year} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-1 paper-card p-4">
          <h3 className="font-display text-lg font-bold mb-2">By employee</h3>
          {byEmployee.length === 0 ? (
            <div className="text-sm text-ink-mute">No payroll yet.</div>
          ) : (
            <div className="space-y-2">
              {byEmployee.map((e) => (
                <div
                  key={e.name}
                  className="flex items-center justify-between p-2 rounded hover:bg-paper/50"
                >
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{e.name}</div>
                    <div className="text-[11px] text-ink-mute">
                      {e.count} payment{e.count === 1 ? "" : "s"}
                    </div>
                  </div>
                  <div className="num font-bold">
                    {formatCurrency(e.total, settings?.currency)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="md:col-span-2 paper-card overflow-hidden">
          <div className="overflow-auto max-h-[65vh] scroll-lined">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-widest text-ink-mute bg-paper/60 sticky top-0">
                  <th className="p-3 pl-5">Date</th>
                  <th className="p-3">Employee</th>
                  <th className="p-3">Month</th>
                  <th className="p-3 text-right pr-5">Amount</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-ink-mute">
                      Loading...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-10 text-center text-ink-mute">
                      No salary entries recorded.
                    </td>
                  </tr>
                ) : (
                  filtered.map((e) => (
                    <tr key={e.id} className="border-t hover:bg-paper/40">
                      <td className="p-3 pl-5 text-xs">{formatDate(e.expenseDate)}</td>
                      <td className="p-3 font-semibold">{e.employeeName}</td>
                      <td className="p-3 text-xs text-ink-mute">{e.monthKey}</td>
                      <td className="p-3 pr-5 text-right num font-semibold">
                        {formatCurrency(e.amount, settings?.currency)}
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="paper-card p-4">
      <div className="text-[11px] uppercase tracking-widest text-ink-mute">{label}</div>
      <div className={cn("font-display text-2xl font-bold num mt-1")}>{value}</div>
    </div>
  );
}
