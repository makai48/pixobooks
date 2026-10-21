import { useMemo, useState } from "react";
import {
  TrendingUp,
  DollarSign,
  Percent,
  Receipt,
  Users as UsersIcon,
  Wallet,
  Calendar,
} from "lucide-react";
import { useSales } from "@/hooks/useSales";
import { useExpenses } from "@/hooks/useExpenses";
import { useCustomers } from "@/hooks/useCustomers";
import { useShopSettings } from "@/hooks/useShopSettings";
import { useAuth } from "@/hooks/useAuth";
import { useClientReceivablesTotals } from "@/hooks/useClients";
import { cn, formatCurrency, formatDate, startOfMonth, startOfWeek, startOfYear } from "@/lib/utils";
import type { StatsPeriod } from "@/types";
import { STATS_PERIOD_META, MONTH_NAMES, DEFAULT_STATS_PERIOD } from "@/types";

type RangeMode = "quick" | "monthYear" | "custom";

/** Statistics page — buttons and body font sizes reduced ~50% throughout. */
export default function Statistics() {
  const { canViewCosts } = useAuth();
  const { data: sales = [] } = useSales();
  const { data: expenses = [] } = useExpenses();
  const { data: customers = [] } = useCustomers();
  const { data: settings } = useShopSettings();
  // Client Billing receivables — sourced from the new client_invoices
  // table. Legacy POS credit balances remain visible on the Customer
  // register and are NOT reflected here.
  const ledger = useClientReceivablesTotals();

  const [now] = useState(() => new Date());
  // Statistics defaults to Today per new policy.
  const [period, setPeriod] = useState<StatsPeriod>(DEFAULT_STATS_PERIOD);
  const [rangeMode, setRangeMode] = useState<RangeMode>("quick");
  const [pickedMonth, setPickedMonth] = useState(now.getMonth());
  const [pickedYear, setPickedYear] = useState(now.getFullYear());
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");

  const years = useMemo(() => {
    const y: number[] = [];
    for (let i = now.getFullYear() - 5; i <= now.getFullYear() + 1; i++) y.push(i);
    return y;
  }, [now]);

  const range = useMemo(() => {
    const nowD = new Date();
    const to = new Date(nowD);
    to.setHours(23, 59, 59, 999);
    let from: Date;
    if (rangeMode === "custom" && customFrom && customTo) {
      from = new Date(customFrom);
      const t = new Date(customTo);
      t.setHours(23, 59, 59, 999);
      return { from, to: t };
    }
    if (rangeMode === "monthYear") {
      const start = new Date(pickedYear, pickedMonth, 1);
      const end = new Date(pickedYear, pickedMonth + 1, 0);
      end.setHours(23, 59, 59, 999);
      return { from: start, to: end };
    }
    if (period === "day") { from = new Date(nowD); from.setHours(0, 0, 0, 0); }
    else if (period === "week") { from = startOfWeek(); }
    else if (period === "month") { from = startOfMonth(); }
    else { from = startOfYear(); }
    return { from, to };
  }, [period, rangeMode, customFrom, customTo, pickedMonth, pickedYear]);

  const stats = useMemo(() => {
    const inRange = (iso: string) => {
      const t = new Date(iso).getTime();
      return t >= range.from.getTime() && t <= range.to.getTime();
    };
    const salesInRange = sales.filter((s) => inRange(s.createdAt));
    const expInRange = expenses.filter((e) => {
      const d = new Date(e.expenseDate + "T12:00:00").getTime();
      return d >= range.from.getTime() && d <= range.to.getTime();
    });

    const revenue = salesInRange.reduce((s, x) => s + x.total, 0);
    const cost = salesInRange.reduce((s, x) => s + x.cost, 0);
    const gross = revenue - cost;
    const exp = expInRange.reduce((s, e) => s + e.amount, 0);
    const net = gross - exp;
    const margin = revenue > 0 ? (gross / revenue) * 100 : 0;

    const dayMs = 24 * 3600 * 1000;
    const rangeDays = Math.max(1, Math.round((range.to.getTime() - range.from.getTime()) / dayMs));
    const bucketKey = (iso: string): string => {
      const d = new Date(iso);
      if (rangeDays <= 1) return `${String(d.getHours()).padStart(2, "0")}:00`;
      if (rangeDays <= 62) return d.toISOString().slice(0, 10);
      return d.toISOString().slice(0, 7);
    };

    const byBucket = new Map<string, { key: string; rev: number; exp: number }>();
    for (const s of salesInRange) {
      const k = bucketKey(s.createdAt);
      const cur = byBucket.get(k) || { key: k, rev: 0, exp: 0 };
      cur.rev += s.total;
      byBucket.set(k, cur);
    }
    for (const e of expInRange) {
      const iso = new Date(e.expenseDate + "T12:00:00").toISOString();
      const k = bucketKey(iso);
      const cur = byBucket.get(k) || { key: k, rev: 0, exp: 0 };
      cur.exp += e.amount;
      byBucket.set(k, cur);
    }
    const buckets = [...byBucket.values()].sort((a, b) => a.key.localeCompare(b.key));

    const productCounts = new Map<string, { name: string; qty: number; total: number }>();
    for (const s of salesInRange) {
      for (const l of s.lines) {
        const cur = productCounts.get(l.itemId) || { name: l.name, qty: 0, total: 0 };
        cur.qty += l.qty;
        cur.total += l.qty * l.unitPrice * (1 - l.discountPct / 100);
        productCounts.set(l.itemId, cur);
      }
    }
    const topProducts = [...productCounts.values()].sort((a, b) => b.total - a.total).slice(0, 5);

    const cashierMap = new Map<string, { name: string; count: number; total: number }>();
    for (const s of salesInRange) {
      const cur = cashierMap.get(s.cashierName) || { name: s.cashierName, count: 0, total: 0 };
      cur.count += 1;
      cur.total += s.total;
      cashierMap.set(s.cashierName, cur);
    }
    const topCashiers = [...cashierMap.values()].sort((a, b) => b.total - a.total).slice(0, 5);

    return {
      revenue, cost, gross, net, exp, margin,
      salesCount: salesInRange.length,
      avgTicket: salesInRange.length ? revenue / salesInRange.length : 0,
      buckets, topProducts, topCashiers, salesInRange,
    };
  }, [sales, expenses, range]);

  const maxBar = Math.max(...stats.buckets.map((d) => d.rev + d.exp), 1);
  const periodLabel =
    rangeMode === "custom" && customFrom && customTo
      ? `${customFrom} → ${customTo}`
      : rangeMode === "monthYear"
      ? `${MONTH_NAMES[pickedMonth]} ${pickedYear}`
      : STATS_PERIOD_META[period].label;

  return (
    <div className="p-3 md:p-4 space-y-3 text-[11px]">
      <div className="paper-card p-2 md:p-3 space-y-2">
        <div className="flex items-center gap-1.5 text-ink-mute">
          <Calendar className="w-3 h-3" />
          <span className="label text-[9px]">Reporting period</span>
        </div>

        <div className="flex flex-wrap gap-1">
          {(Object.keys(STATS_PERIOD_META) as StatsPeriod[]).map((p) => (
            <button
              key={p}
              onClick={() => {
                setPeriod(p); setRangeMode("quick"); setCustomFrom(""); setCustomTo("");
              }}
              className={cn(
                "chip border px-2 h-6 text-[10px] transition",
                rangeMode === "quick" && period === p
                  ? "bg-ink text-paper border-ink"
                  : "border-line hover:border-ink"
              )}
            >
              {STATS_PERIOD_META[p].label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div className="paper-card p-2 space-y-1.5">
            <div className="text-[9px] uppercase tracking-widest text-ink-mute">
              Pick specific month
            </div>
            <div className="flex items-center gap-1.5">
              <select
                value={pickedMonth}
                onChange={(e) => { setPickedMonth(Number(e.target.value)); setRangeMode("monthYear"); setCustomFrom(""); setCustomTo(""); }}
                className="input h-7 text-[10px] flex-1"
              >
                {MONTH_NAMES.map((m, i) => (<option key={m} value={i}>{m}</option>))}
              </select>
              <select
                value={pickedYear}
                onChange={(e) => { setPickedYear(Number(e.target.value)); setRangeMode("monthYear"); setCustomFrom(""); setCustomTo(""); }}
                className="input h-7 text-[10px] w-20"
              >
                {years.map((y) => (<option key={y} value={y}>{y}</option>))}
              </select>
              <button
                onClick={() => setRangeMode("monthYear")}
                className={cn(
                  "btn h-7 px-2 text-[10px]",
                  rangeMode === "monthYear" ? "btn-primary" : "btn-outline"
                )}
              >
                Apply
              </button>
            </div>
          </div>
          <div className="paper-card p-2 space-y-1.5">
            <div className="text-[9px] uppercase tracking-widest text-ink-mute">
              Custom date range
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => { setCustomFrom(e.target.value); setRangeMode("custom"); }}
                className="input h-7 text-[10px] flex-1"
              />
              <span className="text-ink-mute text-[10px]">to</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => { setCustomTo(e.target.value); setRangeMode("custom"); }}
                className="input h-7 text-[10px] flex-1"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatCard label={`Revenue · ${periodLabel}`} value={formatCurrency(stats.revenue, settings?.currency)} icon={DollarSign} tone="magenta" />
        {canViewCosts && (
          <StatCard label="Gross profit" value={formatCurrency(stats.gross, settings?.currency)} icon={TrendingUp} tone="cyan" />
        )}
        <StatCard label={`Net (− ${formatCurrency(stats.exp, settings?.currency)} exp)`} value={canViewCosts ? formatCurrency(stats.net, settings?.currency) : "—"} icon={Wallet} tone={stats.net >= 0 ? "success" : "danger"} />
        {canViewCosts && (
          <StatCard label="Margin" value={`${stats.margin.toFixed(1)}%`} icon={Percent} tone="yellow" />
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <MiniStat label="Sales count" value={String(stats.salesCount)} />
        <MiniStat label="Avg ticket" value={formatCurrency(stats.avgTicket, settings?.currency)} />
        <MiniStat label="Expenses" value={formatCurrency(stats.exp, settings?.currency)} />
        <MiniStat label="Customers" value={String(customers.length)} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <MiniStat
          label="Client AR (billed)"
          value={formatCurrency(ledger.totalReceivable, settings?.currency)}
        />
        <MiniStat
          label="Overdue AR"
          value={formatCurrency(ledger.overdue, settings?.currency)}
        />
        <MiniStat
          label="Billed this month"
          value={formatCurrency(ledger.billedThisMonth, settings?.currency)}
        />
        <MiniStat
          label="Paid this month"
          value={formatCurrency(ledger.paidThisMonth, settings?.currency)}
        />
      </div>

      <div className="paper-card p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[9px] uppercase tracking-widest text-ink-mute">
              {periodLabel} · revenue vs expenses
            </div>
            <h2 className="font-display text-sm font-bold">Cashflow trend</h2>
          </div>
          <div className="flex gap-2 text-[10px]">
            <Legend color="bg-magenta-reg" label="Revenue" />
            <Legend color="bg-warning" label="Expenses" />
          </div>
        </div>
        <div className="mt-3 flex items-end gap-1 h-28 min-h-[7rem]">
          {stats.buckets.length === 0 ? (
            <div className="w-full text-center text-[10px] text-ink-mute">No activity in this range.</div>
          ) : (
            stats.buckets.map((d) => (
              <div key={d.key} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                <div className="w-full flex-1 flex flex-col justify-end gap-0.5">
                  <div className="bg-magenta-reg rounded-t-sm" style={{ height: `${(d.rev / maxBar) * 100}%` }} title={`Rev ${formatCurrency(d.rev, settings?.currency)}`} />
                  <div className="bg-warning rounded-t-sm opacity-80" style={{ height: `${(d.exp / maxBar) * 100}%` }} title={`Exp ${formatCurrency(d.exp, settings?.currency)}`} />
                </div>
                <div className="text-[8px] text-ink-mute num truncate w-full text-center">
                  {d.key.length > 6 ? d.key.slice(-5) : d.key}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="paper-card p-3">
          <div className="text-[9px] uppercase tracking-widest text-ink-mute">
            Top products · {periodLabel}
          </div>
          <h3 className="font-display text-sm font-bold mb-2">Best sellers</h3>
          {stats.topProducts.length === 0 ? (
            <div className="text-[10px] text-ink-mute">No sales yet.</div>
          ) : (
            <div className="space-y-1.5">
              {stats.topProducts.map((p) => {
                const max = stats.topProducts[0].total || 1;
                return (
                  <div key={p.name} className="space-y-0.5">
                    <div className="flex justify-between text-[10px]">
                      <span className="truncate pr-2">{p.name}</span>
                      <span className="num text-ink-mute">
                        {p.qty} · {formatCurrency(p.total, settings?.currency)}
                      </span>
                    </div>
                    <div className="h-1 rounded bg-ink/5 overflow-hidden">
                      <div className="h-full bg-magenta-reg" style={{ width: `${(p.total / max) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="paper-card p-3">
          <div className="text-[9px] uppercase tracking-widest text-ink-mute">
            Top cashiers · {periodLabel}
          </div>
          <h3 className="font-display text-sm font-bold mb-2">Who rings up most</h3>
          {stats.topCashiers.length === 0 ? (
            <div className="text-[10px] text-ink-mute">No sales yet.</div>
          ) : (
            <div className="space-y-1.5">
              {stats.topCashiers.map((c) => (
                <div key={c.name} className="flex items-center justify-between text-[10px]">
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-full bg-cyan-reg/10 text-cyan-reg font-bold text-[10px] flex items-center justify-center">
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="font-semibold">{c.name}</div>
                  </div>
                  <div className="text-right">
                    <div className="num font-semibold">
                      {formatCurrency(c.total, settings?.currency)}
                    </div>
                    <div className="text-[9px] text-ink-mute num">
                      {c.count} sales
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="paper-card overflow-hidden">
        <div className="p-2 border-b flex items-center justify-between">
          <div>
            <div className="text-[9px] uppercase tracking-widest text-ink-mute">Recent activity</div>
            <h3 className="font-display text-sm font-bold">Latest transactions</h3>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-ink-mute">
            <Receipt className="w-3 h-3" />
            {stats.salesInRange.length} in range
          </div>
        </div>
        <div className="overflow-auto max-h-64 scroll-lined">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-left text-[9px] uppercase tracking-widest text-ink-mute bg-paper/60 sticky top-0">
                <th className="p-1.5 pl-3">Number</th>
                <th className="p-1.5">Date</th>
                <th className="p-1.5">Cashier</th>
                <th className="p-1.5">Customer</th>
                <th className="p-1.5 text-right pr-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {stats.salesInRange.slice(0, 20).map((s) => (
                <tr key={s.id} className="border-t hover:bg-paper/40">
                  <td className="p-1.5 pl-3 font-mono text-[9px]">{s.number}</td>
                  <td className="p-1.5 text-ink-mute">{formatDate(s.createdAt)}</td>
                  <td className="p-1.5">{s.cashierName}</td>
                  <td className="p-1.5 text-ink-mute">{s.customerName || "Walk-in"}</td>
                  <td className="p-1.5 pr-3 text-right num font-semibold">
                    {formatCurrency(s.total, settings?.currency)}
                  </td>
                </tr>
              ))}
              {stats.salesInRange.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-ink-mute text-[10px]">
                    No sales in this range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-[10px] text-ink-mute flex items-center gap-1.5">
        <UsersIcon className="w-3 h-3" />
        {customers.length} customers on the register
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, tone = "magenta" }: {
  label: string; value: string; icon: React.ComponentType<{ className?: string }>;
  tone?: "magenta" | "cyan" | "yellow" | "success" | "danger";
}) {
  const bg = {
    magenta: "bg-magenta-reg/10 text-magenta-reg",
    cyan: "bg-cyan-reg/10 text-cyan-reg",
    yellow: "bg-yellow-reg/10 text-yellow-reg",
    success: "bg-success/10 text-success",
    danger: "bg-danger/10 text-danger",
  }[tone];
  return (
    <div className="paper-card p-2.5">
      <div className="flex items-center justify-between">
        <div className="text-[9px] uppercase tracking-widest text-ink-mute truncate pr-1">{label}</div>
        <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${bg}`}>
          <Icon className="w-2.5 h-2.5" />
        </div>
      </div>
      <div className="font-display text-base font-bold num mt-1">{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="paper-card p-2">
      <div className="text-[9px] uppercase tracking-widest text-ink-mute">{label}</div>
      <div className="num text-xs font-bold">{value}</div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-ink-mute">
      <span className={`w-2 h-2 rounded ${color}`} /> {label}
    </span>
  );
}
