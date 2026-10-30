/**
 * Pure aggregation helpers for the Statistics "Analytics" tab and the
 * enhanced best-sellers panel. Keeping the maths here makes it testable
 * without React or Supabase.
 */
import type {
  ClientInvoice,
  Expense,
  PurchaseOrder,
  Sale,
  SaleLine,
} from "@/types";

export type DateRange = { from: Date; to: Date };

export type SeriesPoint = { key: string; label: string; value: number };

export type ItemPerformance = {
  itemId: string;
  name: string;
  qtySold: number;
  revenue: number;
  profit: number;
  qtyPurchased: number;
  purchaseValue: number;
};

export type StaffPerformance = {
  name: string;
  count: number;
  revenue: number;
  profit: number;
};

export type ClientBalance = {
  clientId: string;
  clientName: string;
  due: number;
  overdue: number;
  oldestDays: number;
};

export type DebtBucket = { label: string; value: number; count: number };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Parse a timestamp OR a YYYY-MM-DD business date. Date-only values are
 *  anchored at local noon so a UTC shift can never move them a day. */
export function toTime(value: string | Date): number {
  if (value instanceof Date) return value.getTime();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(value + "T12:00:00").getTime();
  }
  return new Date(value).getTime();
}

export function inRange(value: string | Date, range: DateRange): boolean {
  const t = toTime(value);
  if (!Number.isFinite(t)) return false;
  return t >= range.from.getTime() && t <= range.to.getTime();
}

export function lineRevenue(line: SaleLine): number {
  return line.qty * line.unitPrice * (1 - (line.discountPct || 0) / 100);
}

/** Bucket label used by the trend charts: hours for a single day, days for
 *  up to two months, months for longer ranges. */
export function bucketOf(value: string | Date, range: DateRange): string {
  const d = value instanceof Date ? value : new Date(value);
  const days = Math.max(
    1,
    Math.round((range.to.getTime() - range.from.getTime()) / DAY_MS)
  );
  if (days <= 1) return `${String(d.getHours()).padStart(2, "0")}:00`;
  if (days <= 62) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function bucketLabel(key: string): string {
  if (key.includes(":")) return key;
  if (key.length === 7) return key.slice(2);
  return key.slice(5);
}

function sortSeries(map: Map<string, number>): SeriesPoint[] {
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, value]) => ({ key, label: bucketLabel(key), value }));
}

/* ------------------------------------------------------------------ *
 * Items
 * ------------------------------------------------------------------ */

/**
 * Per-item sales AND purchase performance for a period.
 *
 * Sale lines do not store their own cost, so the sale-level `cost` is
 * allocated across lines in proportion to line revenue. That keeps the
 * per-item profit totals equal to the sale profit without inventing
 * historical cost data.
 */
export function itemPerformance(
  sales: Sale[],
  purchases: PurchaseOrder[],
  range: DateRange
): ItemPerformance[] {
  const map = new Map<string, ItemPerformance>();
  const get = (itemId: string, name: string): ItemPerformance => {
    const key = itemId || name;
    let row = map.get(key);
    if (!row) {
      row = {
        itemId: key,
        name: name || "Unnamed item",
        qtySold: 0,
        revenue: 0,
        profit: 0,
        qtyPurchased: 0,
        purchaseValue: 0,
      };
      map.set(key, row);
    }
    return row;
  };

  for (const sale of sales) {
    if (!inRange(sale.createdAt, range)) continue;
    const saleRevenue = sale.lines.reduce((sum, l) => sum + lineRevenue(l), 0);
    for (const line of sale.lines) {
      const revenue = lineRevenue(line);
      const share = saleRevenue > 0 ? revenue / saleRevenue : 0;
      const cost = sale.cost * share;
      const row = get(line.itemId, line.name);
      row.qtySold += line.qty;
      row.revenue += revenue;
      row.profit += revenue - cost;
    }
  }

  for (const po of purchases) {
    if (po.status === "cancelled") continue;
    if (!inRange(po.receivedAt || po.createdAt, range)) continue;
    for (const line of po.lines) {
      const qty = line.receivedQty ?? line.qty;
      const unitCost = line.derivedUnitCost ?? line.unitCost;
      const row = get(line.materialId, line.name);
      row.qtyPurchased += qty;
      row.purchaseValue += qty * unitCost;
    }
  }

  return [...map.values()];
}

export function sortItemPerformance(
  rows: ItemPerformance[],
  metric: "revenue" | "profit" | "qty"
): ItemPerformance[] {
  const value = (r: ItemPerformance) =>
    metric === "profit" ? r.profit : metric === "qty" ? r.qtySold : r.revenue;
  return [...rows].sort((a, b) => value(b) - value(a));
}

/* ------------------------------------------------------------------ *
 * Staff / cashiers
 * ------------------------------------------------------------------ */

export function staffPerformance(sales: Sale[], range: DateRange): StaffPerformance[] {
  const map = new Map<string, StaffPerformance>();
  for (const sale of sales) {
    if (!inRange(sale.createdAt, range)) continue;
    const name = sale.cashierName || "Unknown";
    const row = map.get(name) || { name, count: 0, revenue: 0, profit: 0 };
    row.count += 1;
    row.revenue += sale.total;
    row.profit += sale.profit;
    map.set(name, row);
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}

/* ------------------------------------------------------------------ *
 * Expenses / drawings
 * ------------------------------------------------------------------ */

export function expenseBreakdown(
  expenses: Expense[],
  range: DateRange
): { label: string; value: number }[] {
  const map = new Map<string, number>();
  for (const e of expenses) {
    if (!inRange(e.expenseDate, range)) continue;
    map.set(e.category, (map.get(e.category) || 0) + e.amount);
  }
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

export function drawingsSeries(
  expenses: Expense[],
  range: DateRange,
  drawingsCategory = "Drawings"
): SeriesPoint[] {
  const map = new Map<string, number>();
  for (const e of expenses) {
    if (e.category !== drawingsCategory) continue;
    if (!inRange(e.expenseDate, range)) continue;
    const key = bucketOf(new Date(e.expenseDate + "T12:00:00"), range);
    map.set(key, (map.get(key) || 0) + e.amount);
  }
  return sortSeries(map);
}

/* ------------------------------------------------------------------ *
 * Trends
 * ------------------------------------------------------------------ */

export type TrendBundle = {
  revenue: SeriesPoint[];
  cost: SeriesPoint[];
  expenses: SeriesPoint[];
  profit: SeriesPoint[];
};

export function trendBundle(
  sales: Sale[],
  expenses: Expense[],
  range: DateRange
): TrendBundle {
  const revenue = new Map<string, number>();
  const cost = new Map<string, number>();
  const exp = new Map<string, number>();

  for (const sale of sales) {
    if (!inRange(sale.createdAt, range)) continue;
    const key = bucketOf(sale.createdAt, range);
    revenue.set(key, (revenue.get(key) || 0) + sale.total);
    cost.set(key, (cost.get(key) || 0) + sale.cost);
  }
  for (const e of expenses) {
    if (!inRange(e.expenseDate, range)) continue;
    const key = bucketOf(new Date(e.expenseDate + "T12:00:00"), range);
    exp.set(key, (exp.get(key) || 0) + e.amount);
  }

  const keys = new Set([...revenue.keys(), ...cost.keys(), ...exp.keys()]);
  const ordered = [...keys].sort();
  const profitMap = new Map<string, number>();
  for (const key of ordered) {
    profitMap.set(
      key,
      (revenue.get(key) || 0) - (cost.get(key) || 0) - (exp.get(key) || 0)
    );
  }

  return {
    revenue: sortSeries(revenue),
    cost: sortSeries(cost),
    expenses: sortSeries(exp),
    profit: sortSeries(profitMap),
  };
}

/* ------------------------------------------------------------------ *
 * Purchases
 * ------------------------------------------------------------------ */

export function purchasesByVendor(
  purchases: PurchaseOrder[],
  range: DateRange
): { label: string; value: number }[] {
  const map = new Map<string, number>();
  for (const po of purchases) {
    if (po.status === "cancelled") continue;
    if (!inRange(po.receivedAt || po.createdAt, range)) continue;
    const vendor = po.vendor || "Unknown vendor";
    map.set(vendor, (map.get(vendor) || 0) + po.total);
  }
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

/* ------------------------------------------------------------------ *
 * Client balances / debtors
 * ------------------------------------------------------------------ */

function daysBetween(from: string | Date, to: Date): number {
  const start = toTime(from);
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, Math.floor((to.getTime() - start) / DAY_MS));
}

export function clientBalances(
  invoices: ClientInvoice[],
  today = new Date()
): ClientBalance[] {
  const map = new Map<string, ClientBalance>();
  for (const inv of invoices) {
    if (inv.status === "cancelled") continue;
    if (inv.amountDue <= 0) continue;
    const key = inv.clientId || inv.clientName || inv.number;
    const row =
      map.get(key) ||
      {
        clientId: key,
        clientName: inv.clientName || "Unknown client",
        due: 0,
        overdue: 0,
        oldestDays: 0,
      };
    const age = daysBetween(inv.issueDate, today);
    row.due += inv.amountDue;
    if (inv.dueDate && inv.dueDate < localDay(today)) row.overdue += inv.amountDue;
    row.oldestDays = Math.max(row.oldestDays, age);
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.due - a.due);
}

/** "Overgrown" debts — balances that have been outstanding beyond a
 *  threshold (default 60 days). */
export function overgrownDebts(
  invoices: ClientInvoice[],
  today = new Date(),
  thresholdDays = 60
): ClientBalance[] {
  return clientBalances(invoices, today)
    .filter((c) => c.oldestDays >= thresholdDays)
    .sort((a, b) => b.oldestDays - a.oldestDays);
}

export function debtAgeing(
  invoices: ClientInvoice[],
  today = new Date()
): DebtBucket[] {
  const buckets: DebtBucket[] = [
    { label: "Current", value: 0, count: 0 },
    { label: "1–30d", value: 0, count: 0 },
    { label: "31–60d", value: 0, count: 0 },
    { label: "61–90d", value: 0, count: 0 },
    { label: "90d+", value: 0, count: 0 },
  ];
  for (const inv of invoices) {
    if (inv.status === "cancelled" || inv.amountDue <= 0) continue;
    const age = daysBetween(inv.issueDate, today);
    const idx = age <= 0 ? 0 : age <= 30 ? 1 : age <= 60 ? 2 : age <= 90 ? 3 : 4;
    buckets[idx].value += inv.amountDue;
    buckets[idx].count += 1;
  }
  return buckets;
}

/** Amount-weighted average days outstanding across open client invoices. */
export function debtorDays(invoices: ClientInvoice[], today = new Date()): number {
  let due = 0;
  let weighted = 0;
  for (const inv of invoices) {
    if (inv.status === "cancelled" || inv.amountDue <= 0) continue;
    const age = daysBetween(inv.issueDate, today);
    due += inv.amountDue;
    weighted += inv.amountDue * age;
  }
  return due > 0 ? weighted / due : 0;
}

export function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}
