import { useMemo, useState } from "react";
import {
  ClipboardList, Download, Plus,
  X, ChevronLeft, ChevronRight, Edit3,
} from "lucide-react";
import { toast } from "sonner";
import { useItems } from "@/hooks/useItems";
import { useSales } from "@/hooks/useSales";
import { usePurchaseOrders } from "@/hooks/usePurchaseOrders";
import {
  useStockAdjustments,
  useCreateStockAdjustment,
} from "@/hooks/useStockAdjustments";
import { useShopSettings } from "@/hooks/useShopSettings";
import { useAuth } from "@/hooks/useAuth";
import { cn, download, formatCurrency, formatDate, formatMoney, localISODate, todayISO } from "@/lib/utils";
import GlassDatePicker from "@/components/ui/GlassDatePicker";
import GlassSelect from "@/components/ui/GlassSelect";
import StatCard from "@/components/ui/StatCard";
import { resolveActor } from "@/lib/actor";
import { useUoms } from "@/hooks/useUoms";
import { validateTransactionQty } from "@/lib/uom";
import type { Item, StockAdjustment } from "@/types";
import { MONTH_NAMES } from "@/types";

/**
 * Stock Taking &amp; Analysis
 * ------------------------
 * Period-scoped movement analysis using ONLY existing inventory /
 * sales / PO / adjustment data \u2014 no parallel stock system. Opening
 * stock is reverse-computed from the current items.stock snapshot
 * plus movements between the period start and now. Closing stock is
 * computed the same way from the period end.
 *
 * Movements considered:
 *   \u2022 Sales lines (decrement)
 *   \u2022 PO received (increment) using receivedQty when present
 *   \u2022 stock_adjustments ledger (\u00b1)
 *
 * Excel &amp; CSV exports use the CSV format \u2014 Excel opens .csv
 * natively as a spreadsheet on all platforms.
 */
export default function StockTaking() {
  const { profile, user, can } = useAuth();
  const actor = useMemo(() => resolveActor(profile, user), [profile, user]);
  const { data: items = [], isLoading: itemsLoading } = useItems();
  const { data: sales = [] } = useSales(2000);
  const { data: pos = [] } = usePurchaseOrders();
  const { data: settings } = useShopSettings();

  const [now] = useState(() => new Date());
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [rangeMode, setRangeMode] = useState<"month" | "custom">("month");
  const [customFrom, setCustomFrom] = useState(todayISO());
  const [customTo, setCustomTo] = useState(todayISO());
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [typeFilter, setTypeFilter] = useState<string>("All");
  const [adjustItem, setAdjustItem] = useState<Item | null>(null);

  const from =
    rangeMode === "custom"
      ? customFrom
      : new Date(year, month, 1).toISOString().slice(0, 10);
  const to =
    rangeMode === "custom"
      ? customTo
      : new Date(year, month + 1, 0).toISOString().slice(0, 10);

  const { data: adjustments = [] } = useStockAdjustments(from, to);
  const { data: allAdjustments = [] } = useStockAdjustments(); // used for opening/closing reverse-compute

  const years = useMemo(() => {
    const y: number[] = [];
    for (let i = now.getFullYear() - 5; i <= now.getFullYear() + 1; i++) y.push(i);
    return y;
  }, [now]);

  const canAdjust = can("inventory.adjust") || can("inventory.edit");

  const categories = useMemo(
    () => Array.from(new Set(items.map((i) => i.category))).sort(),
    [items]
  );

  const stocked = useMemo(
    () =>
      items.filter(
        (i) =>
          i.itemType === "material" ||
          i.itemType === "intermediate" ||
          i.itemType === "ready"
      ),
    [items]
  );

  /** Movements per item within the period, computed once. */
  const perItem = useMemo(() => {
    type Row = {
      item: Item;
      sold: number;
      received: number;
      adjustPositive: number;
      adjustNegative: number;
      opening: number;
      closing: number;
    };

    const map = new Map<string, Row>();
    for (const it of stocked) {
      map.set(it.id, {
        item: it,
        sold: 0,
        received: 0,
        adjustPositive: 0,
        adjustNegative: 0,
        opening: 0,
        closing: 0,
      });
    }

    // Sales sold-in-period
    for (const s of sales) {
      const d = localISODate(s.createdAt);
      if (d < from || d > to) continue;
      for (const l of s.lines) {
        const row = map.get(l.itemId);
        // If the sold item is a Product with a BOM, decrement its
        // materials in the BOM view. For direct-stocked items just
        // decrement themselves.
        if (row) {
          row.sold += l.qty;
          continue;
        }
        const soldItem = items.find((i) => i.id === l.itemId);
        if (soldItem?.bom && soldItem.bom.length > 0) {
          for (const b of soldItem.bom) {
            const matRow = map.get(b.materialId);
            if (matRow) matRow.sold += b.qty * l.qty;
          }
        }
      }
    }

    // Received-in-period from POs marked received in the window
    for (const p of pos) {
      const ra = p.receivedAt || p.updatedAt;
      if (!ra) continue;
      const d = ra.slice(0, 10);
      if (d < from || d > to) continue;
      if (p.status !== "received") continue;
      for (const line of p.lines) {
        const row = map.get(line.materialId);
        if (!row) continue;
        const qty = Number(line.receivedQty ?? line.qty ?? 0);
        row.received += qty;
      }
    }

    // Adjustments in-period
    for (const a of adjustments) {
      const row = map.get(a.itemId);
      if (!row) continue;
      if (a.qtyChange >= 0) row.adjustPositive += a.qtyChange;
      else row.adjustNegative += Math.abs(a.qtyChange);
    }

    // Reverse-compute Opening / Closing from items.stock snapshot.
    // Movements AFTER `to` roll BACK from now \u2192 closing.
    // Movements DURING [from, to] roll back from closing \u2192 opening.
    for (const row of map.values()) {
      const it = row.item;
      const nowStock = Number(it.stock || 0);

      // Everything after "to"
      let soldAfter = 0;
      let recvAfter = 0;
      let adjAfter = 0;
      for (const s of sales) {
        const d = localISODate(s.createdAt);
        if (d <= to) continue;
        for (const l of s.lines) {
          if (l.itemId === it.id) soldAfter += l.qty;
          const so = items.find((i) => i.id === l.itemId);
          if (so?.bom) {
            for (const b of so.bom) {
              if (b.materialId === it.id) soldAfter += b.qty * l.qty;
            }
          }
        }
      }
      for (const p of pos) {
        const ra = p.receivedAt || p.updatedAt;
        if (!ra || ra.slice(0, 10) <= to || p.status !== "received") continue;
        for (const line of p.lines) {
          if (line.materialId !== it.id) continue;
          recvAfter += Number(line.receivedQty ?? line.qty ?? 0);
        }
      }
      for (const a of allAdjustments) {
        if (a.itemId !== it.id) continue;
        if (a.adjustmentDate <= to) continue;
        adjAfter += a.qtyChange;
      }
      // Closing = Now + soldAfter - receivedAfter - adjustmentsAfter
      const closing = Math.max(0, nowStock + soldAfter - recvAfter - adjAfter);
      // Opening = Closing + sold - received - (positive - negative)
      const netAdj = row.adjustPositive - row.adjustNegative;
      const opening = Math.max(0, closing + row.sold - row.received - netAdj);
      row.closing = closing;
      row.opening = opening;
    }

    return Array.from(map.values()).sort((a, b) =>
      a.item.name.localeCompare(b.item.name)
    );
  }, [stocked, sales, pos, adjustments, allAdjustments, items, from, to]);

  const filteredRows = useMemo(() => {
    return perItem.filter((r) => {
      if (categoryFilter !== "All" && r.item.category !== categoryFilter) return false;
      if (typeFilter !== "All" && r.item.itemType !== typeFilter) return false;
      return true;
    });
  }, [perItem, categoryFilter, typeFilter]);

  const totals = useMemo(() => {
    const openingValue = filteredRows.reduce(
      (s, r) => s + r.opening * r.item.cost,
      0
    );
    const purchases = filteredRows.reduce(
      (s, r) => s + r.received * r.item.cost,
      0
    );
    const sold = filteredRows.reduce((s, r) => s + r.sold * r.item.cost, 0);
    const adjustments = filteredRows.reduce(
      (s, r) => s + (r.adjustPositive - r.adjustNegative) * r.item.cost,
      0
    );
    const closingValue = filteredRows.reduce(
      (s, r) => s + r.closing * r.item.cost,
      0
    );
    const variance = closingValue - openingValue - purchases + sold - adjustments;
    return { openingValue, purchases, sold, adjustments, closingValue, variance };
  }, [filteredRows]);

  const currency = settings?.currency || "USD";
  const periodLabel =
    rangeMode === "custom"
      ? `${customFrom} \u2192 ${customTo}`
      : `${MONTH_NAMES[month]} ${year}`;

  const exportCsv = (kind: "summary" | "adjustments") => {
    if (kind === "summary") {
      const rows: string[][] = [
        [
          "SKU",
          "Name",
          "Category",
          "Type",
          "Opening Qty",
          "Purchases",
          "Sold",
          "Adjustments (net)",
          "Closing Qty",
          "Unit Cost",
          "Opening Value",
          "Purchases Value",
          "Sold Value",
          "Closing Value",
        ],
        ...filteredRows.map((r) => {
          const net = r.adjustPositive - r.adjustNegative;
          return [
            r.item.sku,
            r.item.name,
            r.item.category,
            r.item.itemType,
            r.opening.toString(),
            r.received.toString(),
            r.sold.toString(),
            net.toString(),
            r.closing.toString(),
            r.item.cost.toFixed(2),
            (r.opening * r.item.cost).toFixed(2),
            (r.received * r.item.cost).toFixed(2),
            (r.sold * r.item.cost).toFixed(2),
            (r.closing * r.item.cost).toFixed(2),
          ];
        }),
      ];
      download(
        `stock-taking-${from}-to-${to}.csv`,
        rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")
      );
      toast.success("Stock taking summary exported");
    } else {
      const rows: string[][] = [
        [
          "Date",
          "Item",
          "Type",
          "Old Stock",
          "Change",
          "New Stock",
          "Reason",
          "Recorded by",
        ],
        ...adjustments.map((a) => [
          a.adjustmentDate,
          a.itemName,
          a.adjustmentType,
          a.oldStock.toString(),
          (a.qtyChange >= 0 ? "+" : "") + a.qtyChange.toString(),
          a.newStock.toString(),
          a.reason || "",
          a.createdByName || "",
        ]),
      ];
      download(
        `stock-adjustments-${from}-to-${to}.csv`,
        rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")
      );
      toast.success("Adjustments log exported");
    }
  };

  return (
    <div className="p-2.5 md:p-6 space-y-2 md:space-y-4">
      {/* Period control */}
      <div className="paper-card p-2.5 md:p-4 flex flex-col md:flex-row md:items-center gap-1.5 md:gap-3">
        <div className="flex items-center gap-1.5 text-ink-mute min-w-0">
          <ClipboardList className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0" />
          <div className="min-w-0">
            <div className="text-[7px] md:text-[10px] uppercase tracking-wide md:tracking-widest truncate">Stock analysis period</div>
            <div className="font-display font-bold text-ink text-xs md:text-sm truncate">{periodLabel}</div>
          </div>
        </div>
        <div className="flex items-center gap-1 border rounded-md p-0.5 shrink-0">
          <button
            onClick={() => setRangeMode("month")}
            className={cn(
              "h-6 md:h-8 px-2 md:px-3 rounded text-[9px] md:text-xs font-semibold",
              rangeMode === "month" ? "bg-ink text-paper" : "text-ink-mute"
            )}
          >
            Monthly
          </button>
          <button
            onClick={() => setRangeMode("custom")}
            className={cn(
              "h-6 md:h-8 px-2 md:px-3 rounded text-[9px] md:text-xs font-semibold",
              rangeMode === "custom" ? "bg-ink text-paper" : "text-ink-mute"
            )}
          >
            Custom
          </button>
        </div>
        {rangeMode === "month" ? (
          <div className="flex items-center gap-1 md:gap-2 md:flex-1">
            <button
              onClick={() => {
                const d = new Date(year, month - 1, 1);
                setYear(d.getFullYear());
                setMonth(d.getMonth());
              }}
              className="btn btn-outline btn-sm w-7 md:w-9 p-0 shrink-0"
            >
              <ChevronLeft className="w-3.5 h-3.5 md:w-4 md:h-4" />
            </button>
            <GlassSelect
              value={String(month)}
              onChange={(v) => setMonth(Number(v))}
              ariaLabel="Month"
              options={MONTH_NAMES.map((m, i) => ({ value: String(i), label: m }))}
              className="input input-sm select-glass max-md:px-1.5"
            />
            <GlassSelect
              value={String(year)}
              onChange={(v) => setYear(Number(v))}
              ariaLabel="Year"
              options={years.map((y) => ({ value: String(y), label: String(y) }))}
              className="input input-sm select-glass max-md:px-1.5"
            />
            <button
              onClick={() => {
                const d = new Date(year, month + 1, 1);
                setYear(d.getFullYear());
                setMonth(d.getMonth());
              }}
              className="btn btn-outline btn-sm w-7 md:w-9 p-0 shrink-0"
            >
              <ChevronRight className="w-3.5 h-3.5 md:w-4 md:h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1 md:gap-2 md:flex-1">
            <span className="text-ink-mute text-[9px] md:text-xs shrink-0">From</span>
            <GlassDatePicker
              value={customFrom}
              onChange={setCustomFrom}
              ariaLabel="From date"
              className="input input-sm select-glass max-md:px-1.5"
            />
            <span className="text-ink-mute text-[9px] md:text-xs shrink-0">To</span>
            <GlassDatePicker
              value={customTo}
              onChange={setCustomTo}
              ariaLabel="To date"
              className="input input-sm select-glass max-md:px-1.5"
            />
          </div>
        )}
        <div className="flex gap-1 md:gap-2 flex-wrap">
          <button onClick={() => exportCsv("summary")} className="btn btn-outline btn-sm">
            <Download className="w-3.5 h-3.5 md:w-4 md:h-4" /> Summary CSV
          </button>
          <button onClick={() => exportCsv("adjustments")} className="btn btn-outline btn-sm">
            <Download className="w-3.5 h-3.5 md:w-4 md:h-4" /> Adjustments CSV
          </button>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-1.5 md:gap-2">
        <StatCard
          label="Opening"
          value={formatMoney(totals.openingValue, currency)}
          fullValue={formatCurrency(totals.openingValue, currency)}
        />
        <StatCard
          label="Purchases"
          value={formatMoney(totals.purchases, currency)}
          fullValue={formatCurrency(totals.purchases, currency)}
          tone="success"
        />
        <StatCard
          label="Sold"
          value={formatMoney(totals.sold, currency)}
          fullValue={formatCurrency(totals.sold, currency)}
          tone="danger"
        />
        <StatCard
          label="Adjustments"
          value={formatMoney(totals.adjustments, currency)}
          fullValue={formatCurrency(totals.adjustments, currency)}
          tone={totals.adjustments >= 0 ? "success" : "danger"}
        />
        <StatCard
          label="Closing"
          value={formatMoney(totals.closingValue, currency)}
          fullValue={formatCurrency(totals.closingValue, currency)}
        />
        <StatCard
          label="Variance"
          value={formatMoney(totals.variance, currency)}
          fullValue={formatCurrency(totals.variance, currency)}
          tone={Math.abs(totals.variance) < 0.01 ? "success" : "danger"}
        />
      </div>

      {/* Filters */}
      <div className="paper-card p-2.5 md:p-3 grid grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] md:grid-cols-3 items-center md:items-end gap-x-1.5 gap-y-1.5 md:gap-3">
        <div className="max-md:contents">
          <label htmlFor="st-category" className="label max-md:text-[9px] max-md:whitespace-nowrap">Category</label>
          <GlassSelect
            id="st-category"
            value={categoryFilter}
            onChange={setCategoryFilter}
            ariaLabel="Category"
            options={[
              { value: "All", label: "All categories" },
              ...categories.map((c) => ({ value: c, label: c })),
            ]}
            className="input input-sm select-glass min-w-0 max-md:px-1.5 md:mt-1"
          />
        </div>
        <div className="max-md:contents">
          <label htmlFor="st-item-type" className="label max-md:text-[9px] max-md:whitespace-nowrap">Type</label>
          <GlassSelect
            id="st-item-type"
            value={typeFilter}
            onChange={setTypeFilter}
            ariaLabel="Item type"
            options={[
              { value: "All", label: "All types" },
              { value: "material", label: "Material" },
              { value: "intermediate", label: "Intermediate" },
              { value: "ready", label: "Ready" },
            ]}
            className="input input-sm select-glass min-w-0 max-md:px-1.5 md:mt-1"
          />
        </div>
        <div className="col-span-2 md:col-span-1 text-[9px] md:text-[11px] text-ink-mute md:self-end md:pb-1">
          {filteredRows.length} of {stocked.length} stocked items · {adjustments.length} adjustments in range
        </div>
      </div>

      {/* Table */}
      <div className="paper-card overflow-hidden">
        <div className="overflow-auto max-h-[60vh]">
          <table className="w-full text-[10px] md:text-sm">
            <thead>
              <tr className="text-left text-[8px] md:text-[10px] uppercase tracking-wide md:tracking-widest text-ink-mute bg-paper/60 sticky top-0">
                <th className="p-1.5 pl-2 md:p-2 md:pl-3">Item</th>
                <th className="p-1.5 hidden md:table-cell">Type</th>
                <th className="p-1.5 text-right hidden md:table-cell">Opening</th>
                <th className="p-1.5 text-right hidden md:table-cell">Purchases</th>
                <th className="p-1.5 text-right hidden md:table-cell">Sold</th>
                <th className="p-1.5 text-right hidden md:table-cell">Adjust</th>
                <th className="p-1.5 text-right">Closing</th>
                <th className="p-1.5 text-right hidden lg:table-cell">Unit cost</th>
                <th className="p-1.5 text-right">Value</th>
                {canAdjust && <th className="p-1.5 pr-2 md:pr-3"></th>}
              </tr>
            </thead>
            <tbody>
              {itemsLoading ? (
                <tr>
                  <td colSpan={10} className="p-6 md:p-10 text-center text-ink-mute">
                    Loading...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-6 md:p-10 text-center text-ink-mute">
                    No stocked items match the filters.
                  </td>
                </tr>
              ) : (
                filteredRows.map((r) => {
                  const net = r.adjustPositive - r.adjustNegative;
                  return (
                    <tr key={r.item.id} className="border-t hover:bg-paper/40">
                      <td className="p-1 pl-2 md:p-2 md:pl-3 h-[30px] md:h-[34px]">
                        <div className="font-semibold text-[10px] md:text-xs leading-tight truncate max-w-[130px] md:max-w-none">{r.item.name}</div>
                        <div className="text-[8px] md:text-[10px] text-ink-mute num leading-tight">{r.item.sku}</div>
                      </td>
                      <td className="p-1 md:p-2 hidden md:table-cell">
                        <span className="chip text-[10px] px-2 py-0 bg-ink/5 border">
                          {r.item.itemType}
                        </span>
                      </td>
                      <td className="p-1 md:p-2 text-right num text-[10px] md:text-xs whitespace-nowrap hidden md:table-cell">{r.opening.toLocaleString()}</td>
                      <td className="p-1 md:p-2 text-right num text-[10px] md:text-xs text-success whitespace-nowrap hidden md:table-cell">
                        {r.received > 0 ? `+${r.received.toLocaleString()}` : "\u2014"}
                      </td>
                      <td className="p-1 md:p-2 text-right num text-[10px] md:text-xs text-danger whitespace-nowrap hidden md:table-cell">
                        {r.sold > 0 ? `-${r.sold.toLocaleString()}` : "\u2014"}
                      </td>
                      <td
                        className={cn(
                          "p-1 md:p-2 text-right num text-[10px] md:text-xs whitespace-nowrap hidden md:table-cell",
                          net > 0 && "text-success",
                          net < 0 && "text-danger"
                        )}
                      >
                        {net === 0 ? "\u2014" : (net > 0 ? "+" : "") + net.toLocaleString()}
                      </td>
                      <td className="p-1 md:p-2 text-right num text-[10px] md:text-xs font-semibold whitespace-nowrap">
                        {r.closing.toLocaleString()}
                      </td>
                      <td className="p-1 md:p-2 text-right num text-[10px] md:text-xs whitespace-nowrap hidden lg:table-cell">
                        {formatCurrency(r.item.cost, currency)}
                      </td>
                      <td className="p-1 md:p-2 text-right num text-[10px] md:text-xs font-bold whitespace-nowrap">
                        {formatMoney(r.closing * r.item.cost, currency)}
                      </td>
                      {canAdjust && (
                        <td className="p-1 pr-2 md:p-2 md:pr-3 text-right">
                          <button
                            onClick={() => setAdjustItem(r.item)}
                            className="inline-flex items-center justify-center h-6 w-6 md:h-7 md:w-auto md:px-2 p-0 rounded text-[10px] md:text-[11px] text-ink-mute hover:bg-paper"
                            title="Adjust stock"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span className="hidden md:inline md:ml-1">Adjust</span>
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Adjustments log */}
      <div className="paper-card overflow-hidden">
        <div className="p-2.5 md:p-3 border-b flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[7px] md:text-[11px] uppercase tracking-wide md:tracking-widest text-ink-mute">
              Stock adjustments log
            </div>
            <h3 className="font-display text-sm md:text-base font-bold">Manual movements in period</h3>
          </div>
          <div className="text-[9px] md:text-xs text-ink-mute shrink-0">{adjustments.length} entries</div>
        </div>
        <div className="overflow-auto max-h-64 scroll-lined">
          <table className="w-full text-[10px] md:text-sm">
            <thead>
              <tr className="text-left text-[8px] md:text-[10px] uppercase tracking-wide md:tracking-widest text-ink-mute bg-paper/40 sticky top-0">
                <th className="p-1.5 pl-2 md:p-2 md:pl-4">Date</th>
                <th className="p-1.5 md:p-2">Item</th>
                <th className="p-1.5 md:p-2 hidden md:table-cell">Type</th>
                <th className="p-1.5 text-right hidden md:table-cell">Old</th>
                <th className="p-1.5 text-right">Change</th>
                <th className="p-1.5 text-right">New</th>
                <th className="p-1.5 hidden lg:table-cell">Reason</th>
                <th className="p-1.5 pr-2 md:pr-4 hidden lg:table-cell">By</th>
              </tr>
            </thead>
            <tbody>
              {adjustments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-5 md:p-6 text-center text-ink-mute text-[10px] md:text-xs">
                    No stock adjustments in this period.
                  </td>
                </tr>
              ) : (
                adjustments.map((a: StockAdjustment) => (
                  <tr key={a.id} className="border-t hover:bg-paper/40">
                    <td className="px-1.5 pl-2 md:px-2 md:pl-3 h-[21px] md:h-[28px] text-[9px] md:text-xs whitespace-nowrap">{formatDate(a.adjustmentDate)}</td>
                    <td className="px-1.5 md:px-2 h-[21px] md:h-[28px] font-semibold text-[10px] md:text-xs truncate max-w-[110px] md:max-w-none">{a.itemName}</td>
                    <td className="px-1.5 md:px-2 h-[21px] md:h-[28px] text-ink-mute hidden md:table-cell">{a.adjustmentType}</td>
                    <td className="px-1.5 md:px-2 h-[21px] md:h-[28px] text-right num hidden md:table-cell">{a.oldStock}</td>
                    <td
                      className={cn(
                        "px-1.5 md:px-2 h-[21px] md:h-[28px] text-right num font-semibold",
                        a.qtyChange > 0 && "text-success",
                        a.qtyChange < 0 && "text-danger"
                      )}
                    >
                      {a.qtyChange > 0 ? "+" : ""}
                      {a.qtyChange}
                    </td>
                    <td className="px-1.5 md:px-2 h-[21px] md:h-[28px] text-right num">{a.newStock}</td>
                    <td className="px-1.5 md:px-2 h-[21px] md:h-[28px] text-ink-mute truncate max-w-[160px] hidden lg:table-cell">{a.reason || "\u2014"}</td>
                    <td className="px-1.5 pr-2 md:pr-4 h-[21px] md:h-[28px] text-ink-mute hidden lg:table-cell">{a.createdByName || "\u2014"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {adjustItem && (
        <StockAdjustModal
          item={adjustItem}
          onClose={() => setAdjustItem(null)}
          actor={actor}
        />
      )}
    </div>
  );
}

function StockAdjustModal({
  item,
  onClose,
  actor,
}: {
  item: Item;
  onClose: () => void;
  actor?: { id: string; name: string; role?: string };
}) {
  const create = useCreateStockAdjustment();
  const { data: uoms = [] } = useUoms();
  const [mode, setMode] = useState<"set" | "add">("set");
  const [value, setValue] = useState<number>(item.stock);
  const [reason, setReason] = useState("");
  const [type, setType] = useState<
    "manual" | "stocktake" | "correction"
  >("stocktake");
  const [date, setDate] = useState(todayISO());

  const newStock =
    mode === "set" ? Math.max(0, value) : Math.max(0, item.stock + value);
  const delta = newStock - item.stock;

  const submit = async () => {
    if (delta === 0) return toast.error("No change in stock");
    // Stock ledger is kept in base units: absolute levels must satisfy
    // the base UOM's divisibility (§7 — never rounded, rejected instead).
    {
      const check = validateTransactionQty(newStock, item.baseUnit, uoms, {
        itemAllowDecimalQty: item.allowDecimalQty,
        label: `${item.name} stock`,
      });
      if (!check.ok) return toast.error(check.reason);
    }
    try {
      await create.mutateAsync({
        itemId: item.id,
        itemName: item.name,
        oldStock: item.stock,
        newStock,
        reason: reason || null,
        adjustmentType: type,
        adjustmentDate: date,
        actor,
      });
      toast.success(`${item.name} adjusted \u00b7 ${delta > 0 ? "+" : ""}${delta}`);
      onClose();
    } catch (err) {
      const { isOfflineQueuedError } = await import("@/hooks/useOfflineQueue");
      if (isOfflineQueuedError(err)) {
        toast.success("Adjustment queued — will sync when you're back online");
        onClose();
        return;
      }
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink/50 flex items-center justify-center p-2 sm:p-4 animate-fade-in">
      <div className="paper-card w-full max-w-md overflow-hidden max-h-[95dvh] flex flex-col">
        <div className="p-3 sm:p-4 border-b flex items-center justify-between shrink-0">
          <div>
            <div className="text-[10px] sm:text-[11px] uppercase tracking-widest text-ink-mute">
              Adjust stock
            </div>
            <h2 className="font-display text-base sm:text-lg font-bold">{item.name}</h2>
            <div className="text-[10px] sm:text-xs text-ink-mute">
              Current: {item.stock} {item.baseUnit}
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost h-8 w-8 p-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-3 sm:p-4 space-y-2 sm:space-y-3 overflow-auto scroll-lined">
          <div>
            <label htmlFor="st-adjust-type" className="label">Adjustment type</label>
            <GlassSelect
              id="st-adjust-type"
              value={type}
              onChange={(v) => setType(v as typeof type)}
              ariaLabel="Adjustment type"
              options={[
                { value: "stocktake", label: "Stock take (physical count)" },
                { value: "manual", label: "Manual adjustment" },
                { value: "correction", label: "Correction (data fix)" },
              ]}
              className="input mt-1 select-glass"
            />
          </div>
          <div>
            <span id="st-adjust-mode-label" className="label">Mode</span>
            <div role="group" aria-labelledby="st-adjust-mode-label" className="flex items-center gap-1 border rounded-md p-0.5 mt-1">
              <button
                onClick={() => {
                  setMode("set");
                  setValue(item.stock);
                }}
                className={cn(
                  "flex-1 h-9 rounded text-xs font-semibold",
                  mode === "set" ? "bg-ink text-paper" : "text-ink-mute"
                )}
              >
                Set to
              </button>
              <button
                onClick={() => {
                  setMode("add");
                  setValue(0);
                }}
                className={cn(
                  "flex-1 h-9 rounded text-xs font-semibold",
                  mode === "add" ? "bg-ink text-paper" : "text-ink-mute"
                )}
              >
                Adjust by
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="st-adjust-value" className="label">
              {mode === "set" ? "New stock level" : "Change (\u00b1)"}
            </label>
            <input
              id="st-adjust-value"
              type="number"
              step="0.001"
              value={value}
              onChange={(e) => setValue(Number(e.target.value))}
              className="input mt-1 num text-right"
            />
          </div>
          <div>
            <label htmlFor="st-adjust-date" className="label">Adjustment date</label>
            <GlassDatePicker
              id="st-adjust-date"
              value={date}
              onChange={setDate}
              ariaLabel="Adjustment date"
              className="input mt-1 select-glass"
            />
          </div>
          <div>
            <label htmlFor="st-adjust-reason" className="label">Reason (optional)</label>
            <input
              id="st-adjust-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="input mt-1"
              placeholder="e.g. Damaged in transit, physical count"
            />
          </div>
          <div className="paper-card p-3 bg-paper/50 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-mute">Was</span>
              <span className="num">{item.stock} {item.baseUnit}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-mute">Change</span>
              <span
                className={cn(
                  "num font-semibold",
                  delta > 0 && "text-success",
                  delta < 0 && "text-danger"
                )}
              >
                {delta > 0 ? "+" : ""}
                {delta}
              </span>
            </div>
            <div className="flex justify-between font-bold border-t pt-1">
              <span>New</span>
              <span className="num">{newStock} {item.baseUnit}</span>
            </div>
          </div>
        </div>
        <div className="p-3 sm:p-4 border-t flex justify-end gap-1.5 sm:gap-2 shrink-0">
          <button onClick={onClose} className="btn btn-outline">Cancel</button>
          <button onClick={submit} disabled={create.isPending} className="btn btn-primary">
            <Plus className="w-4 h-4" />
            {create.isPending ? "Saving..." : "Record adjustment"}
          </button>
        </div>
      </div>
    </div>
  );
}
