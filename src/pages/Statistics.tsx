import { useMemo, useState } from "react";
import {
  Receipt,
  Users as UsersIcon,
  Calendar,
  BarChart3,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  Wallet,
  Landmark,
  Scale,
  Clock,
  Package,
  ShoppingCart,
  TrendingUp,
} from "lucide-react";
import { useSales } from "@/hooks/useSales";
import { useExpenses } from "@/hooks/useExpenses";
import { useCustomers } from "@/hooks/useCustomers";
import { useShopSettings } from "@/hooks/useShopSettings";
import { useAuth } from "@/hooks/useAuth";
import { useClientInvoices, useClientReceivablesTotals } from "@/hooks/useClients";
import { usePurchaseOrders } from "@/hooks/usePurchaseOrders";
import { useItems } from "@/hooks/useItems";
import {
  cn,
  formatCurrency,
  formatDate,
  formatMoney,
  localISODate,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "@/lib/utils";
import {
  clientBalances,
  debtAgeing,
  debtorDays,
  drawingsSeries,
  expenseBreakdown,
  itemPerformance,
  overgrownDebts,
  purchasesByVendor,
  sortItemPerformance,
  staffPerformance,
  trendBundle,
} from "@/lib/analytics";
import GlassDatePicker from "@/components/ui/GlassDatePicker";
import GlassSelect from "@/components/ui/GlassSelect";
import StatCard from "@/components/ui/StatCard";
import MoneyText from "@/components/ui/MoneyText";
import BarChart from "@/components/charts/BarChart";
import LineChart from "@/components/charts/LineChart";
import PieChart from "@/components/charts/PieChart";
import { chartColor } from "@/components/charts/palette";
import type { StatsPeriod } from "@/types";
import { STATS_PERIOD_META, MONTH_NAMES, DEFAULT_STATS_PERIOD } from "@/types";

type RangeMode = "quick" | "monthYear" | "custom";
type View = "overview" | "analytics";

/** Statistics page — Traditional design: compact chrome, dense rows. */
export default function Statistics() {
  const { canViewCosts } = useAuth();
  const { data: sales = [] } = useSales();
  const { data: expenses = [] } = useExpenses();
  const { data: customers = [] } = useCustomers();
  const { data: settings } = useShopSettings();
  const { data: purchaseOrders = [] } = usePurchaseOrders();
  const { data: items = [] } = useItems();
  const { data: invoices = [] } = useClientInvoices();
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
  const [view, setView] = useState<View>("overview");
  const [bestMetric, setBestMetric] = useState<"revenue" | "profit">("revenue");
  const [bestItem, setBestItem] = useState("");
  const [perfItem, setPerfItem] = useState("");

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
      from = new Date(customFrom + "T00:00:00");
      const t = new Date(customTo + "T00:00:00");
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

  const itemRows = useMemo(
    () => itemPerformance(sales, purchaseOrders, range),
    [sales, purchaseOrders, range]
  );
  const sortedItems = useMemo(
    () => sortItemPerformance(itemRows, bestMetric),
    [itemRows, bestMetric]
  );
  /** Every catalog item, including ones with no activity in this period.
   *  The dropdown must list the full item set so a user can inspect any
   *  product, not just the ones that happened to sell. */
  const allItemRows = useMemo(() => {
    const merged = new Map(itemRows.map((r) => [r.itemId, r]));
    for (const it of items) {
      if (!merged.has(it.id)) {
        merged.set(it.id, {
          itemId: it.id,
          name: it.name,
          qtySold: 0,
          revenue: 0,
          profit: 0,
          qtyPurchased: 0,
          purchaseValue: 0,
        });
      }
    }
    return [...merged.values()];
  }, [itemRows, items]);
  const itemOptions = useMemo(
    () =>
      [...allItemRows]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((i) => ({ value: i.itemId, label: i.name })),
    [allItemRows]
  );
  const selectedItem = allItemRows.find((i) => i.itemId === bestItem) || null;
  const perfSelected = allItemRows.find((i) => i.itemId === perfItem) || null;

  const stats = useMemo(() => {
    const salesInRange = sales.filter((s) => {
      const t = new Date(s.createdAt).getTime();
      return t >= range.from.getTime() && t <= range.to.getTime();
    });
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
      if (rangeDays <= 62) return localISODate(d);
      return localISODate(d).slice(0, 7);
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

    return {
      revenue, cost, gross, net, exp, margin,
      salesCount: salesInRange.length,
      avgTicket: salesInRange.length ? revenue / salesInRange.length : 0,
      buckets, salesInRange,
      posDebt: salesInRange.reduce((s, x) => s + x.amountDue, 0),
    };
  }, [sales, expenses, range]);

  const topCashiers = useMemo(() => staffPerformance(sales, range).slice(0, 5), [sales, range]);
  const staff = useMemo(() => staffPerformance(sales, range), [sales, range]);

  const trends = useMemo(() => trendBundle(sales, expenses, range), [sales, expenses, range]);
  const expenseCats = useMemo(() => expenseBreakdown(expenses, range), [expenses, range]);
  const drawings = useMemo(() => drawingsSeries(expenses, range), [expenses, range]);
  const vendors = useMemo(() => purchasesByVendor(purchaseOrders, range), [purchaseOrders, range]);
  const balances = useMemo(() => clientBalances(invoices), [invoices]);
  const overgrown = useMemo(() => overgrownDebts(invoices), [invoices]);
  const ageing = useMemo(() => debtAgeing(invoices), [invoices]);
  const dso = useMemo(() => debtorDays(invoices), [invoices]);

  const maxBar = Math.max(...stats.buckets.map((d) => d.rev + d.exp), 1);
  const periodLabel =
    rangeMode === "custom" && customFrom && customTo
      ? `${customFrom} → ${customTo}`
      : rangeMode === "monthYear"
      ? `${MONTH_NAMES[pickedMonth]} ${pickedYear}`
      : STATS_PERIOD_META[period].label;

  const currency = settings?.currency || "USD";
  const money = (v: number) => formatMoney(v, currency);
  const fullMoney = (v: number) => formatCurrency(v, currency);
  const showProfit = canViewCosts;

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

      {/* View tabs */}
      <div className="paper-card border-b flex overflow-x-auto scrollbar-none">
        {([
          { k: "overview" as const, label: "Overview", icon: BarChart3 },
          { k: "analytics" as const, label: "Analytics", icon: LineChartIcon },
        ]).map(({ k, label, icon: Icon }) => (
          <button
            key={k}
            onClick={() => setView(k)}
            className={cn(
              "px-2.5 md:px-4 h-8 md:h-10 flex items-center gap-1 md:gap-2 text-[10px] md:text-sm font-semibold border-b-2 transition whitespace-nowrap",
              view === k
                ? "border-magenta-reg text-magenta-reg"
                : "border-transparent text-ink-mute hover:text-ink"
            )}
          >
            <Icon className="w-3 h-3 md:w-4 md:h-4" />
            {label}
          </button>
        ))}
      </div>

      {view === "overview" && (
        <>
          <div className="grid grid-cols-3 md:grid-cols-4 gap-1.5 md:gap-3">
            <StatCard
              label={`Revenue · ${periodLabel}`}
              value={money(stats.revenue)}
              fullValue={fullMoney(stats.revenue)}
              tone="magenta"
            />
            {showProfit ? (
              <StatCard
                label="Gross profit"
                value={money(stats.gross)}
                fullValue={fullMoney(stats.gross)}
                tone="cyan"
              />
            ) : (
              <StatCard
                label="Expenses"
                value={money(stats.exp)}
                fullValue={fullMoney(stats.exp)}
                tone="warning"
              />
            )}
            <StatCard
              label="Net"
              value={showProfit ? money(stats.net) : "—"}
              fullValue={showProfit ? fullMoney(stats.net) : undefined}
              tone={showProfit ? (stats.net >= 0 ? "success" : "danger") : undefined}
            />
            {showProfit && (
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
                      <div className="bg-magenta-reg rounded-t-sm" style={{ height: `${(d.rev / maxBar) * 100}%` }} title={`Rev ${fullMoney(d.rev)}`} />
                      <div className="bg-warning rounded-t-sm opacity-80" style={{ height: `${(d.exp / maxBar) * 100}%` }} title={`Exp ${fullMoney(d.exp)}`} />
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
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[7px] md:text-[9px] uppercase tracking-wide md:tracking-widest text-ink-mute">
                    Top products · {periodLabel}
                  </div>
                  <h3 className="font-display text-sm font-bold mb-1.5 md:mb-2">Best sellers</h3>
                </div>
                {showProfit && (
                  <div className="flex gap-1 shrink-0">
                    {(["revenue", "profit"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setBestMetric(m)}
                        className={cn(
                          "chip border px-1.5 h-5 text-[8px] md:text-[9px] capitalize transition",
                          bestMetric === m
                            ? "bg-ink text-paper border-ink"
                            : "border-line hover:border-ink"
                        )}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <GlassSelect
                value={bestItem}
                onChange={setBestItem}
                ariaLabel="Filter best seller by item"
                options={[{ value: "", label: "All items" }, ...itemOptions]}
                className="input input-sm select-glass mb-1.5 md:mb-2"
              />

              {sortedItems.length === 0 ? (
                <div className="text-[10px] text-ink-mute">No sales yet.</div>
              ) : (
                <BarChart
                  data={sortedItems.slice(0, 4).map((i) => ({
                    label: i.name,
                    value: bestMetric === "profit" ? i.profit : i.revenue,
                  }))}
                  formatValue={money}
                  color={bestMetric === "profit" ? "#16a34a" : "#c2185b"}
                />
              )}

              {/* Specific-item detail — shown IN ADDITION to the top-4
                  chart above, never replacing it. */}
              {selectedItem && (
                <div className="grid grid-cols-2 gap-1.5 md:gap-2 text-[10px] md:text-xs mt-1.5 md:mt-2 border-t pt-1.5 md:pt-2">
                  <div className="col-span-2 font-semibold truncate">{selectedItem.name}</div>
                  <MiniStat label="Qty sold" value={String(selectedItem.qtySold)} />
                  <MiniStat label="Revenue" value={money(selectedItem.revenue)} />
                  {showProfit && (
                    <MiniStat label="Profit" value={money(selectedItem.profit)} />
                  )}
                  {showProfit && (
                    <MiniStat
                      label="Margin"
                      value={`${selectedItem.revenue > 0 ? ((selectedItem.profit / selectedItem.revenue) * 100).toFixed(1) : "0.0"}%`}
                    />
                  )}
                  <MiniStat label="Qty purchased" value={String(selectedItem.qtyPurchased)} />
                  <MiniStat label="Purchases" value={money(selectedItem.purchaseValue)} />
                </div>
              )}

              {/* All items — the dropdown above filters this table. */}
              <div className="mt-2 max-h-44 overflow-auto scroll-lined border-t">
                <table className="w-full text-[9px] md:text-[10px]">
                  <thead className="bg-paper/60 sticky top-0">
                    <tr className="text-left uppercase tracking-wide text-ink-mute">
                      <th className="p-1 pl-1.5">Item</th>
                      <th className="p-1 text-right">Qty</th>
                      <th className="p-1 text-right">Revenue</th>
                      {showProfit && <th className="p-1 pr-1.5 text-right">Profit</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedItems.map((i) => (
                      <tr
                        key={i.itemId}
                        className={cn(
                          "border-t cursor-pointer hover:bg-paper/40",
                          bestItem === i.itemId && "bg-magenta-reg/5"
                        )}
                        onClick={() => setBestItem(i.itemId)}
                      >
                        <td className="p-1 pl-1.5 truncate max-w-[120px]">{i.name}</td>
                        <td className="p-1 text-right num">{i.qtySold}</td>
                        <td className="p-1 text-right num">{money(i.revenue)}</td>
                        {showProfit && (
                          <td className={cn("p-1 pr-1.5 text-right num", i.profit < 0 && "text-danger")}>
                            {money(i.profit)}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="paper-card p-2.5 md:p-3">
              <div className="text-[7px] md:text-[9px] uppercase tracking-wide md:tracking-widest text-ink-mute">
                Top cashiers · {periodLabel}
              </div>
              <h3 className="font-display text-sm font-bold mb-1.5 md:mb-2">Who rings up most</h3>
              {topCashiers.length === 0 ? (
                <div className="text-[10px] text-ink-mute">No sales yet.</div>
              ) : (
                <div className="space-y-1 md:space-y-1.5">
                  {topCashiers.map((c) => (
                    <div key={c.name} className="flex items-center justify-between text-[9px] md:text-[10px] h-[24px] md:h-8">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className="w-4 h-4 md:w-5 md:h-5 rounded-full bg-cyan-reg/10 text-cyan-reg font-bold text-[8px] md:text-[10px] flex items-center justify-center shrink-0">
                          {c.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="font-semibold truncate">{c.name}</div>
                      </div>
                      <div className="text-right shrink-0 pl-2">
                        <div className="num font-semibold">{money(c.revenue)}</div>
                        <div className="text-[8px] md:text-[9px] text-ink-mute num">{c.count} sales</div>
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
        </>
      )}

      {view === "analytics" && (
        <div className="space-y-2 md:space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 md:gap-3">
            <StatCard
              label="POS debtors"
              value={money(stats.posDebt)}
              fullValue={fullMoney(stats.posDebt)}
              tone={stats.posDebt > 0 ? "danger" : undefined}
            />
            <StatCard
              label="Client balances"
              value={money(ledger.totalReceivable)}
              fullValue={fullMoney(ledger.totalReceivable)}
              tone={ledger.totalReceivable > 0 ? "warning" : undefined}
            />
            <StatCard
              label="Overgrown debts"
              value={money(overgrown.reduce((s, c) => s + c.due, 0))}
              fullValue={fullMoney(overgrown.reduce((s, c) => s + c.due, 0))}
              tone={overgrown.length > 0 ? "danger" : undefined}
            />
            <StatCard
              label="Debtor days"
              value={`${dso.toFixed(0)}d`}
              fullValue={`${dso.toFixed(1)} days average`}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3">
            <ChartCard icon={Package} kicker={`Items · ${periodLabel}`} title="Item sales">
              <BarChart
                data={sortItemPerformance(itemRows, "revenue").slice(0, 8).map((i) => ({
                  label: i.name,
                  value: i.revenue,
                }))}
                formatValue={money}
                color="#c2185b"
              />
            </ChartCard>

            <ChartCard icon={TrendingUp} kicker={`Profit · ${periodLabel}`} title={showProfit ? "Profit trend" : "Revenue trend"}>
              <LineChart
                data={(showProfit ? trends.profit : trends.revenue).map((p) => ({
                  label: p.label,
                  value: p.value,
                }))}
                color={showProfit ? "#16a34a" : "#c2185b"}
                formatValue={money}
              />
            </ChartCard>

            <ChartCard icon={UsersIcon} kicker={`Staff · ${periodLabel}`} title="Staff sales">
              <BarChart
                data={staff.slice(0, 8).map((s) => ({ label: s.name, value: s.revenue }))}
                formatValue={money}
                color="#0891b2"
              />
            </ChartCard>

            <ChartCard icon={PieChartIcon} kicker={`Expenses · ${periodLabel}`} title="Expense mix">
              <PieChart
                data={expenseCats.slice(0, 8).map((e, i) => ({
                  label: e.label,
                  value: e.value,
                  color: chartColor(i),
                }))}
                formatValue={money}
              />
            </ChartCard>

            <ChartCard icon={Wallet} kicker={`Drawings · ${periodLabel}`} title="Owner drawings">
              <LineChart
                data={drawings.map((p) => ({ label: p.label, value: p.value }))}
                color="#dc2626"
                formatValue={money}
                emptyLabel="No drawings in this period."
              />
            </ChartCard>

            <ChartCard icon={ShoppingCart} kicker={`Purchases · ${periodLabel}`} title="Purchases by vendor">
              <BarChart
                data={vendors.slice(0, 8).map((v) => ({ label: v.label, value: v.value }))}
                formatValue={money}
                color="#f59e0b"
              />
            </ChartCard>

            <ChartCard icon={Landmark} kicker="Outstanding" title="Debtors balance">
              <BarChart
                data={balances.slice(0, 8).map((c) => ({
                  label: `${c.clientName} · ${c.oldestDays}d`,
                  value: c.due,
                }))}
                formatValue={money}
                color="#dc2626"
              />
            </ChartCard>

            <ChartCard icon={Landmark} kicker="Per client" title="Client balances">
              <BarChart
                data={balances.slice(0, 8).map((c) => ({
                  label: c.clientName,
                  value: c.due,
                }))}
                formatValue={money}
                color="#7c3aed"
              />
            </ChartCard>

            <ChartCard icon={Scale} kicker="60+ days" title="Overgrown debts">
              <BarChart
                data={overgrown.slice(0, 8).map((c) => ({
                  label: `${c.clientName} · ${c.oldestDays}d`,
                  value: c.due,
                }))}
                formatValue={money}
                color="#b91c1c"
                emptyLabel="No debts older than 60 days."
              />
            </ChartCard>

            <ChartCard icon={Clock} kicker="Ageing" title="Debtor's days">
              <div className="flex items-baseline gap-2 mb-2">
                <span className="num text-xl md:text-2xl font-bold">{dso.toFixed(0)}</span>
                <span className="text-[10px] text-ink-mute">days average</span>
              </div>
              <BarChart
                data={ageing.map((b) => ({ label: b.label, value: b.value }))}
                formatValue={money}
                color="#64748b"
                emptyLabel="No open client invoices."
              />
            </ChartCard>
          </div>

          {/* Per-item sales AND purchase performance for the selected period */}
          <div className="paper-card p-2.5 md:p-3">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <div className="text-[7px] md:text-[9px] uppercase tracking-wide md:tracking-widest text-ink-mute">
                  Per-item performance · {periodLabel}
                </div>
                <h3 className="font-display text-sm font-bold">Sales vs purchases</h3>
              </div>
              <GlassSelect
                value={perfItem}
                onChange={setPerfItem}
                ariaLabel="Filter item performance"
                options={[{ value: "", label: "All items" }, ...itemOptions]}
                className="input input-sm select-glass"
              />
            </div>

            {perfSelected && (
              <div className="grid grid-cols-2 md:grid-cols-6 gap-1.5 md:gap-2 mt-2 mb-2">
                <MiniStat label="Qty sold" value={String(perfSelected.qtySold)} />
                <MiniStat label="Sales" value={money(perfSelected.revenue)} />
                {showProfit && <MiniStat label="Profit" value={money(perfSelected.profit)} />}
                {showProfit && (
                  <MiniStat
                    label="Margin"
                    value={`${perfSelected.revenue > 0 ? ((perfSelected.profit / perfSelected.revenue) * 100).toFixed(1) : "0.0"}%`}
                  />
                )}
                <MiniStat label="Qty bought" value={String(perfSelected.qtyPurchased)} />
                <MiniStat label="Purchases" value={money(perfSelected.purchaseValue)} />
              </div>
            )}

            <div className="overflow-auto max-h-72 scroll-lined border rounded-md mt-2">
              <table className="w-full text-[9px] md:text-[11px]">
                <thead className="bg-paper/60 sticky top-0">
                  <tr className="text-left uppercase tracking-wide text-ink-mute">
                    <th className="p-1.5 pl-2">Item</th>
                    <th className="p-1.5 text-right">Qty sold</th>
                    <th className="p-1.5 text-right">Sales</th>
                    {showProfit && <th className="p-1.5 text-right">Profit</th>}
                    <th className="p-1.5 text-right">Qty bought</th>
                    <th className="p-1.5 pr-2 text-right">Purchases</th>
                  </tr>
                </thead>
                <tbody>
                  {(perfItem ? allItemRows.filter((i) => i.itemId === perfItem) : [...itemRows].sort((a, b) => b.revenue - a.revenue)).map((i) => (
                    <tr key={i.itemId} className="border-t hover:bg-paper/40">
                      <td className="p-1.5 pl-2 truncate max-w-[180px]">{i.name}</td>
                      <td className="p-1.5 text-right num">{i.qtySold}</td>
                      <td className="p-1.5 text-right num">{money(i.revenue)}</td>
                      {showProfit && (
                        <td className={cn("p-1.5 text-right num", i.profit < 0 && "text-danger")}>
                          {money(i.profit)}
                        </td>
                      )}
                      <td className="p-1.5 text-right num">{i.qtyPurchased}</td>
                      <td className="p-1.5 pr-2 text-right num">{money(i.purchaseValue)}</td>
                    </tr>
                  ))}
                  {itemRows.length === 0 && (
                    <tr>
                      <td colSpan={showProfit ? 6 : 5} className="p-5 text-center text-ink-mute text-[10px]">
                        No item activity in this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

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
        <MoneyText value={value} />
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

function ChartCard({
  icon: Icon,
  kicker,
  title,
  children,
}: {
  icon: import("lucide-react").LucideIcon;
  kicker: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="paper-card p-2.5 md:p-3 min-w-0">
      <div className="flex items-center gap-1.5 text-ink-mute">
        <Icon className="w-3 h-3 shrink-0" />
        <div className="text-[7px] md:text-[9px] uppercase tracking-wide md:tracking-widest truncate">
          {kicker}
        </div>
      </div>
      <h3 className="font-display text-sm font-bold mb-1.5 md:mb-2">{title}</h3>
      {children}
    </div>
  );
}
