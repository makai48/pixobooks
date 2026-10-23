import { useMemo, useState } from "react";
import {
  Receipt,
  Users as UsersIcon,
  Calendar,
} from "lucide-react";
import { useSales } from "@/hooks/useSales";
import { useExpenses } from "@/hooks/useExpenses";
import { useCustomers } from "@/hooks/useCustomers";
import { useShopSettings } from "@/hooks/useShopSettings";
import { useAuth } from "@/hooks/useAuth";
import { useClientReceivablesTotals } from "@/hooks/useClients";
import {
  cn,
  formatCurrency,
  formatDate,
  formatMoney,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "@/lib/utils";
import GlassDatePicker from "@/components/ui/GlassDatePicker";
import GlassSelect from "@/components/ui/GlassSelect";
import StatCard from "@/components/ui/StatCard";
import type { StatsPeriod } from "@/types";
import { STATS_PERIOD_META, MONTH_NAMES, DEFAULT_STATS_PERIOD } from "@/types";

type RangeMode = "quick" | "monthYear" | "custom";

/** Statistics page — Traditional design: compact chrome, dense rows. */
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

  const currency = settings?.currency || "USD";
  const money = (v: number) => formatMoney(v, currency);

  return (
    <div className="p-2.5 md:p-6 space-y-2 md:space-y-4">
      <div className="paper-card p-2.5 md:p-3 space-y-1.5 md:space-y-2">
        <div className="flex items-center gap-1.5 text-ink-mute">
          <Calendar className="w-3 h-3" />
          <span className="label text-[7px] md:text-[9px]">Reporting period</span>
        </div>

        <div className="flex flex-wrap gap-1">
          {(Object.keys(STATS_PERIOD_META) as StatsPeriod[]).map((p) => (
            <button
              key={p}
              onClick={() => {
                setPeriod(p); setRangeMode("quick"); setCustomFrom(""); setCustomTo("");
              }}
              className={cn(
                "chip border px-2 h-6 text-[9px] md:text-[10px] transition",
                rangeMode === "quick" && period === p
                  ? "bg-ink text-paper border-ink"
                  : "border-line hover:border-ink"
              )}
            >
              {STATS_PERIOD_META[p].label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 md:gap-2">
          <div className="paper-card p-2 space-y-1">
            <div className="text-[7px] md:text-[9px] uppercase tracking-wide md:tracking-widest text-ink-mute">
              Pick specific month
            </div>
            <div className="flex items-center gap-1">
              <GlassSelect
                value={String(pickedMonth)}
                onChange={(v) => {
                  setPickedMonth(Number(v)); setRangeMode("monthYear"); setCustomFrom(""); setCustomTo("");
                }}
                ariaLabel="Month"
                options={MONTH_NAMES.map((m, i) => ({ value: String(i), label: m }))}
                className="input input-sm select-glass max-md:px-1.5"
              />
              <GlassSelect
                value={String(pickedYear)}
                onChange={(v) => {
                  setPickedYear(Number(v)); setRangeMode("monthYear"); setCustomFrom(""); setCustomTo("");
                }}
                ariaLabel="Year"
                options={years.map((y) => ({ value: String(y), label: String(y) }))}
                className="input input-sm select-glass max-md:px-1.5"
              />
              <button
                onClick={() => setRangeMode("monthYear")}
                className={cn(
                  "btn btn-sm shrink-0",
                  rangeMode === "monthYear" ? "btn-primary" : "btn-outline"
                )}
              >
                Apply
              </button>
            </div>
          </div>
          <div className="paper-card p-2 space-y-1">
            <div className="text-[7px] md:text-[9px] uppercase tracking-wide md:tracking-widest text-ink-mute">
              Custom date range
            </div>
            <div className="flex items-center gap-1">
              <span className="text-ink-mute text-[9px] md:text-[10px] shrink-0">From</span>
              <GlassDatePicker
                value={customFrom}
                onChange={(v) => { setCustomFrom(v); setRangeMode("custom"); }}
                ariaLabel="Custom from date"
                className="input input-sm select-glass max-md:px-1.5"
              />
              <span className="text-ink-mute text-[9px] md:text-[10px] shrink-0">To</span>
              <GlassDatePicker
                value={customTo}
                onChange={(v) => { setCustomTo(v); setRangeMode("custom"); }}
                ariaLabel="Custom to date"
                className="input input-sm select-glass max-md:px-1.5"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-4 gap-1.5 md:gap-3">
        <StatCard
          label={`Revenue · ${periodLabel}`}
          value={money(stats.revenue)}
          fullValue={formatCurrency(stats.revenue, currency)}
          tone="magenta"
        />
        {canViewCosts ? (
          <StatCard
            label="Gross profit"
            value={money(stats.gross)}
            fullValue={formatCurrency(stats.gross, currency)}
            tone="cyan"
          />
        ) : (
          <StatCard
            label="Expenses"
            value={money(stats.exp)}
            fullValue={formatCurrency(stats.exp, currency)}
            tone="warning"
          />
        )}
        <StatCard
          label="Net"
          value={canViewCosts ? money(stats.net) : "—"}
          fullValue={canViewCosts ? formatCurrency(stats.net, currency) : undefined}
          tone={canViewCosts ? (stats.net >= 0 ? "success" : "danger") : undefined}
        />
        {canViewCosts && (
          <div className="hidden md:block">
            <StatCard label="Margin" value={`${stats.margin.toFixed(1)}%`} />
          </div>
        )}
      </div>

      <div className="paper-card p-2.5 md:p-4 grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-1.5 md:gap-3">
        <MiniStat label="Sales count" value={String(stats.salesCount)} />
        <MiniStat label="Avg ticket" value={money(stats.avgTicket)} />
        <MiniStat label="Expenses" value={money(stats.exp)} />
        <MiniStat label="Customers" value={String(customers.length)} />
        <MiniStat label="Client AR (billed)" value={money(ledger.totalReceivable)} />
        <MiniStat label="Overdue AR" value={money(ledger.overdue)} />
        <MiniStat label="Billed this month" value={money(ledger.billedThisMonth)} />
        <MiniStat label="Paid this month" value={money(ledger.paidThisMonth)} />
      </div>

      <div className="paper-card p-2.5 md:p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[7px] md:text-[9px] uppercase tracking-wide md:tracking-widest text-ink-mute truncate">
              {periodLabel} · revenue vs expenses
            </div>
            <h2 className="font-display text-sm font-bold">Cashflow trend</h2>
          </div>
          <div className="flex gap-1.5 md:gap-2 text-[9px] md:text-[10px] shrink-0">
            <Legend color="bg-magenta-reg" label="Revenue" />
            <Legend color="bg-warning" label="Expenses" />
          </div>
        </div>
        <div className="mt-2 md:mt-3 flex items-end gap-1 h-20 md:h-28 min-h-[5rem] md:min-h-[7rem]">
          {stats.buckets.length === 0 ? (
            <div className="w-full text-center text-[10px] text-ink-mute">No activity in this range.</div>
          ) : (
            stats.buckets.map((d) => (
              <div key={d.key} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                <div className="w-full flex-1 flex flex-col justify-end gap-0.5">
                  <div className="bg-magenta-reg rounded-t-sm" style={{ height: `${(d.rev / maxBar) * 100}%` }} title={`Rev ${formatCurrency(d.rev, currency)}`} />
                  <div className="bg-warning rounded-t-sm opacity-80" style={{ height: `${(d.exp / maxBar) * 100}%` }} title={`Exp ${formatCurrency(d.exp, currency)}`} />
                </div>
                <div className="text-[7px] md:text-[8px] text-ink-mute num truncate w-full text-center">
                  {d.key.length > 6 ? d.key.slice(-5) : d.key}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3">
        <div className="paper-card p-2.5 md:p-3">
          <div className="text-[7px] md:text-[9px] uppercase tracking-wide md:tracking-widest text-ink-mute">
            Top products · {periodLabel}
          </div>
          <h3 className="font-display text-sm font-bold mb-1.5 md:mb-2">Best sellers</h3>
          {stats.topProducts.length === 0 ? (
            <div className="text-[10px] text-ink-mute">No sales yet.</div>
          ) : (
            <div className="space-y-1 md:space-y-1.5">
              {stats.topProducts.map((p) => {
                const max = stats.topProducts[0].total || 1;
                return (
                  <div key={p.name} className="space-y-0.5">
                    <div className="flex justify-between text-[9px] md:text-[10px] leading-tight">
                      <span className="truncate pr-2">{p.name}</span>
                      <span className="num text-ink-mute shrink-0">
                        {p.qty} · {money(p.total)}
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

        <div className="paper-card p-2.5 md:p-3">
          <div className="text-[7px] md:text-[9px] uppercase tracking-wide md:tracking-widest text-ink-mute">
            Top cashiers · {periodLabel}
          </div>
          <h3 className="font-display text-sm font-bold mb-1.5 md:mb-2">Who rings up most</h3>
          {stats.topCashiers.length === 0 ? (
            <div className="text-[10px] text-ink-mute">No sales yet.</div>
          ) : (
            <div className="space-y-1 md:space-y-1.5">
              {stats.topCashiers.map((c) => (
                <div key={c.name} className="flex items-center justify-between text-[9px] md:text-[10px] h-[24px] md:h-8">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="w-4 h-4 md:w-5 md:h-5 rounded-full bg-cyan-reg/10 text-cyan-reg font-bold text-[8px] md:text-[10px] flex items-center justify-center shrink-0">
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="font-semibold truncate">{c.name}</div>
                  </div>
                  <div className="text-right shrink-0 pl-2">
                    <div className="num font-semibold">
                      {money(c.total)}
                    </div>
                    <div className="text-[8px] md:text-[9px] text-ink-mute num">
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
        <div className="p-2 md:p-2.5 border-b flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[7px] md:text-[9px] uppercase tracking-wide md:tracking-widest text-ink-mute">Recent activity</div>
            <h3 className="font-display text-sm font-bold">Latest transactions</h3>
          </div>
          <div className="flex items-center gap-1 text-[9px] md:text-[10px] text-ink-mute shrink-0">
            <Receipt className="w-3 h-3" />
            {stats.salesInRange.length} in range
          </div>
        </div>
        <div className="overflow-auto max-h-60 md:max-h-64 scroll-lined">
          <table className="w-full text-[10px] md:text-xs">
            <thead>
              <tr className="text-left text-[8px] md:text-[9px] uppercase tracking-wide md:tracking-widest text-ink-mute bg-paper/60 sticky top-0">
                <th className="p-1 pl-2 md:p-1.5 md:pl-3">Number</th>
                <th className="p-1 md:p-1.5">Date</th>
                <th className="p-1 md:p-1.5 hidden md:table-cell">Cashier</th>
                <th className="p-1 md:p-1.5 hidden sm:table-cell">Customer</th>
                <th className="p-1 pr-2 md:p-1.5 md:pr-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {stats.salesInRange.slice(0, 20).map((s) => (
                <tr key={s.id} className="border-t hover:bg-paper/40">
                  <td className="px-1 md:px-1.5 pl-2 md:pl-3 h-[21px] md:h-[28px] font-mono text-[9px] md:text-[11px] whitespace-nowrap">{s.number}</td>
                  <td className="px-1 md:px-1.5 h-[21px] md:h-[28px] text-ink-mute whitespace-nowrap">{formatDate(s.createdAt)}</td>
                  <td className="px-1 md:px-1.5 h-[21px] md:h-[28px] hidden md:table-cell truncate max-w-[110px]">{s.cashierName}</td>
                  <td className="px-1 md:px-1.5 h-[21px] md:h-[28px] text-ink-mute hidden sm:table-cell truncate max-w-[120px]">{s.customerName || "Walk-in"}</td>
                  <td className="px-1 pr-2 md:px-1.5 md:pr-3 h-[21px] md:h-[28px] text-right num font-semibold whitespace-nowrap">
                    {money(s.total)}
                  </td>
                </tr>
              ))}
              {stats.salesInRange.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-5 md:p-6 text-center text-ink-mute text-[10px]">
                    No sales in this range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-[9px] md:text-[10px] text-ink-mute flex items-center gap-1.5">
        <UsersIcon className="w-3 h-3" />
        {customers.length} customers on the register
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[7px] md:text-[9px] uppercase tracking-wide md:tracking-widest text-ink-mute truncate leading-none">
        {label}
      </div>
      <div className="num text-[11px] md:text-sm font-bold mt-0.5 md:mt-1 leading-tight truncate" title={value}>
        {value}
      </div>
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
