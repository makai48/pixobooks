import { useMemo, useState } from "react";
import {
  Search,
  Download,
  RotateCcw,
  Trash2,
  Receipt,
  FileText,
  X,
  Wallet,
  Plus,
  LayoutDashboard,
  PauseCircle,
} from "lucide-react";
import SubNav from "@/components/layout/SubNav";
import { toast } from "sonner";
import {
  useSales,
  useVoidSale,
  useSalePayments,
  useAddSalePayment,
} from "@/hooks/useSales";
import { useShopSettings } from "@/hooks/useShopSettings";
import { useEmployees } from "@/hooks/useEmployees";
import { useAuth } from "@/hooks/useAuth";
import { cn, download, formatCurrency, formatCompactCurrency, formatDate, localISODate, timeAgo, todayISO } from "@/lib/utils";
import { byTransactionDateDesc, inDayRange } from "@/lib/salesReport";
import type { PaymentMethod, Sale } from "@/types";
import DocumentView from "@/components/features/receipts/DocumentView";
import PrintablePortal from "@/components/features/receipts/PrintablePortal";
import ReceiptActions from "@/components/features/receipts/ReceiptActions";
import GlassSelect from "@/components/ui/GlassSelect";
import GlassDatePicker from "@/components/ui/GlassDatePicker";

export default function SalesReport() {
  const { can, canViewCosts, profile } = useAuth();
  // Paint instantly from the persisted 500-row feed while the full report
  // feed (5000 rows, all transaction dates) resolves in the background.
  const { data: recentSales = [] } = useSales();
  const { data: fullSales = [], isLoading: fullLoading } = useSales(5000);
  const sales = fullSales.length > 0 ? fullSales : recentSales;
  const isLoading = fullLoading && recentSales.length === 0;
  const { data: settings } = useShopSettings();
  const { data: employees = [] } = useEmployees();
  const voidSale = useVoidSale();

  const [q, setQ] = useState("");
  /** The report opens on Today (per policy). "All" clears both bounds and
   *  shows every transaction, ordered by the date each sale actually
   *  happened. Imported sales keep their original `created_at`, so they
   *  appear on their real days. */
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const [rangePreset, setRangePreset] = useState<"today" | "7d" | "month" | "all" | "custom">("today");
  const [method, setMethod] = useState<"all" | PaymentMethod>("all");
  const [status, setStatus] = useState<"all" | "paid" | "partial" | "credit">("all");
  const [cashier, setCashier] = useState<string>("all");
  const [viewSale, setViewSale] = useState<Sale | null>(null);

  const cashiers = useMemo(
    () => ["all", ...Array.from(new Set(sales.map((s) => s.cashierName)))],
    [sales]
  );

  const initialsByCashier = useMemo(() => {
    const names = Array.from(new Set(sales.map((s) => s.cashierName)));
    const firstSale = new Map<string, string>();
    for (const s of sales) {
      const prev = firstSale.get(s.cashierName);
      if (!prev || s.createdAt < prev) firstSale.set(s.cashierName, s.createdAt);
    }
    const registeredAt = new Map(
      employees.map((e) => [e.name.trim().toLowerCase(), e.createdAt])
    );
    const baseInitials = (name: string) => {
      const parts = name.trim().split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
      }
      return (parts[0] || "?").slice(0, 2).toUpperCase();
    };

    const ordered = names
      .map((name) => ({
        name,
        initials: baseInitials(name),
        order: registeredAt.get(name.trim().toLowerCase()) || firstSale.get(name) || "",
      }))
      .sort((a, b) => a.order.localeCompare(b.order) || a.name.localeCompare(b.name));

    const groups = new Map<string, string[]>();
    for (const c of ordered) {
      const list = groups.get(c.initials) || [];
      list.push(c.name);
      groups.set(c.initials, list);
    }

    const out = new Map<string, string>();
    for (const c of ordered) {
      const list = groups.get(c.initials) || [];
      out.set(c.name, list.length > 1 ? `${c.initials}${list.indexOf(c.name) + 1}` : c.initials);
    }
    return out;
  }, [sales, employees]);

  /** Quick range presets — Today is the default. */
  const applyPreset = (preset: "today" | "7d" | "month" | "all") => {
    const today = todayISO();
    setRangePreset(preset);
    if (preset === "today") {
      setFrom(today);
      setTo(today);
      return;
    }
    if (preset === "7d") {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      setFrom(localISODate(d));
      setTo(today);
      return;
    }
    if (preset === "month") {
      const d = new Date();
      d.setDate(1);
      setFrom(localISODate(d));
      setTo(today);
      return;
    }
    setFrom("");
    setTo("");
  };

  const filtered = useMemo(() => {
    const rows = sales.filter((s) => {
      if (!inDayRange(s.createdAt, { from, to })) return false;
      if (method !== "all" && s.paymentMethod !== method) return false;
      if (status !== "all" && s.paymentStatus !== status) return false;
      if (cashier !== "all" && s.cashierName !== cashier) return false;
      if (q) {
        const query = q.toLowerCase();
        return (
          s.number.toLowerCase().includes(query) ||
          (s.customerName || "").toLowerCase().includes(query) ||
          s.cashierName.toLowerCase().includes(query)
        );
      }
      return true;
    });
    // Always present newest transaction first, regardless of query order.
    return rows.sort(byTransactionDateDesc);
  }, [sales, q, from, to, method, status, cashier]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, s) => {
        acc.total += s.total;
        acc.paid += s.amountPaid;
        acc.due += s.amountDue;
        acc.cost += s.cost;
        acc.profit += s.profit;
        acc.tax += s.tax;
        return acc;
      },
      { total: 0, paid: 0, due: 0, cost: 0, profit: 0, tax: 0 }
    );
  }, [filtered]);

  const exportCsv = () => {
    const header = ["Number", "Date", "Cashier", "Customer", "Method", "Status", "Subtotal", "Tax", "Total", "Paid", "Due"];
    if (canViewCosts) header.push("Cost", "Profit");
    const rows = [
      header,
      ...filtered.map((s) => {
        const row = [
          s.number,
          // The business-local day the sale happened (imported sales keep
          // their real timestamp), plus the local time of day.
          `${localISODate(s.createdAt)} ${new Date(s.createdAt).toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
          })}`,
          s.cashierName,
          s.customerName || "Walk-in",
          s.paymentMethod,
          s.paymentStatus,
          s.subtotal.toFixed(2),
          s.tax.toFixed(2),
          s.total.toFixed(2),
          s.amountPaid.toFixed(2),
          s.amountDue.toFixed(2),
        ];
        if (canViewCosts) row.push(s.cost.toFixed(2), s.profit.toFixed(2));
        return row;
      }),
    ];
    download(`sales-${from}-to-${to}.csv`, rows.map((r) => r.join(",")).join("\n"));
    toast.success("CSV exported");
  };

  const currency = settings?.currency || "USD";
  const money = (n: number) =>
    Math.abs(n) >= 1_000_000 ? formatCompactCurrency(n, currency) : formatCurrency(n, currency);

  return (
    <div className="p-2.5 md:p-6 space-y-2 md:space-y-4">
      <SubNav
        items={[
          { to: "/", label: "POS", icon: LayoutDashboard, end: true },
          { to: "/sales-report", label: "Report", icon: Receipt },
          { to: "/held", label: "Held Tickets", icon: PauseCircle },
          { to: "/quotes", label: "Quotes", icon: FileText },
        ]}
      />
      <div className="grid grid-cols-3 md:grid-cols-4 gap-1.5 md:gap-3">
        <Stat
          label="Revenue"
          value={money(totals.total)}
          fullValue={formatCurrency(totals.total, currency)}
        />
        <Stat
          label="Collected"
          value={money(totals.paid)}
          fullValue={formatCurrency(totals.paid, currency)}
          tone="success"
        />
        <Stat
          label="Outstanding"
          value={money(totals.due)}
          fullValue={formatCurrency(totals.due, currency)}
          tone={totals.due > 0 ? "danger" : undefined}
        />
        <div className="hidden md:block">
          <Stat label="Sales in period" value={String(filtered.length)} />
        </div>
      </div>

      {canViewCosts && (
        <div className="grid grid-cols-3 gap-1.5 md:gap-3">
          <Stat
            label="Cost of goods"
            value={money(totals.cost)}
            fullValue={formatCurrency(totals.cost, currency)}
          />
          <Stat
            label="Gross profit"
            value={money(totals.profit)}
            fullValue={formatCurrency(totals.profit, currency)}
            tone={totals.profit >= 0 ? "success" : "danger"}
          />
          <Stat
            label="Tax collected"
            value={money(totals.tax)}
            fullValue={formatCurrency(totals.tax, currency)}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1 md:gap-1.5">
        <span className="label text-[8px] md:text-[9px] text-ink-mute mr-0.5">Range</span>
        {([
          { k: "today", label: "Today" },
          { k: "7d", label: "Last 7 days" },
          { k: "month", label: "This month" },
          { k: "all", label: "All time" },
        ] as const).map((p) => (
          <button
            key={p.k}
            type="button"
            onClick={() => applyPreset(p.k)}
            className={cn(
              "chip border px-2 h-6 text-[9px] md:text-[10px] transition",
              rangePreset === p.k
                ? "bg-ink text-paper border-ink"
                : "border-line hover:border-ink"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="paper-card p-2.5 md:p-4 grid grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center md:items-end gap-x-1.5 gap-y-1.5 md:grid-cols-6 md:gap-3">
        <div className="relative col-span-4 md:col-span-2">
          <Search className="w-3.5 h-3.5 md:w-4 md:h-4 absolute left-2 md:left-3 top-1/2 -translate-y-1/2 text-ink-mute pointer-events-none" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Number, customer, cashier" className="input input-sm pl-7 md:pl-9" />
        </div>
        <div className="max-md:contents">
          <label htmlFor="sr-from" className="label max-md:text-[9px] max-md:whitespace-nowrap">From</label>
          <GlassDatePicker id="sr-from" value={from} onChange={(v) => { setFrom(v); setRangePreset("custom"); }} ariaLabel="From date" className="input input-sm select-glass max-md:px-1.5 md:mt-1" placeholder="Any date" allowClear />
        </div>
        <div className="max-md:contents">
          <label htmlFor="sr-to" className="label max-md:text-[9px] max-md:whitespace-nowrap">To</label>
          <GlassDatePicker id="sr-to" value={to} onChange={(v) => { setTo(v); setRangePreset("custom"); }} ariaLabel="To date" className="input input-sm select-glass max-md:px-1.5 md:mt-1" placeholder="Any date" allowClear />
        </div>
        <div className="max-md:contents">
          <label htmlFor="sr-payment" className="label max-md:text-[9px] max-md:whitespace-nowrap">Payment</label>
          <GlassSelect
            id="sr-payment"
            value={method}
            onChange={(v) => setMethod(v as PaymentMethod | "all")}
            ariaLabel="Payment method"
            options={[
              { value: "all", label: "All methods" },
              { value: "cash", label: "Cash" },
              { value: "card", label: "Card" },
              { value: "transfer", label: "Wire" },
              { value: "credit", label: "Credit" },
              { value: "partial", label: "Partial" },
            ]}
            className="input input-sm select-glass min-w-0 max-md:px-1.5 md:mt-1"
          />
        </div>
        <div className="max-md:contents">
          <label htmlFor="sr-status" className="label max-md:text-[9px] max-md:whitespace-nowrap">Status</label>
          <GlassSelect
            id="sr-status"
            value={status}
            onChange={(v) => setStatus(v as typeof status)}
            ariaLabel="Payment status"
            options={[
              { value: "all", label: "All" },
              { value: "paid", label: "Paid" },
              { value: "partial", label: "Partial" },
              { value: "credit", label: "Credit" },
            ]}
            className="input input-sm select-glass min-w-0 max-md:px-1.5 md:mt-1"
          />
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-[10px] md:text-xs text-ink-mute inline-flex items-center gap-1.5 md:gap-2">
          <Receipt className="w-3 h-3 md:w-3.5 md:h-3.5 shrink-0" />
          {filtered.length} of {sales.length}{" "}
          <span className="md:hidden">sales</span>
          <span className="hidden md:inline">transactions · tap any row to view receipt / invoice</span>
        </div>
        <div className="flex gap-1 md:gap-2 flex-wrap max-md:flex-1 max-md:justify-end">
          <GlassSelect
            value={cashier}
            onChange={setCashier}
            ariaLabel="Cashier"
            options={cashiers.map((c) => ({
              value: c,
              label: c === "all" ? "All cashiers" : c,
            }))}
            className="input input-sm select-glass"
          />
          <button
            onClick={() => {
              setQ("");
              setFrom(todayISO());
              setTo(todayISO());
              setRangePreset("today");
              setMethod("all"); setStatus("all"); setCashier("all");
            }}
            className="btn btn-ghost btn-sm"
          >
            <RotateCcw className="w-3.5 h-3.5 md:w-4 md:h-4" /> Reset
          </button>
          <button onClick={exportCsv} className="btn btn-primary btn-sm">
            <Download className="w-3.5 h-3.5 md:w-4 md:h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* Ultra-compact transaction rows — vertical space reduced ~81% */}
      <div className="paper-card overflow-hidden">
        {isLoading ? (
          <div className="p-6 md:p-8 text-center text-ink-mute text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 md:p-10 text-center text-ink-mute text-sm">
            No transactions in this range.
          </div>
        ) : (
          <div className="divide-y">
            {filtered.map((s) => (
              <TransactionRow
                key={s.id}
                sale={s}
                currency={currency}
                initials={initialsByCashier.get(s.cashierName) || s.cashierName.slice(0, 2).toUpperCase()}
                canViewCosts={canViewCosts}
                canVoid={can("sales.void")}
                onClick={() => setViewSale(s)}
                onVoid={() =>
                  confirm(`Void sale ${s.number}?`) &&
                  voidSale.mutate(s.id, {
                    onSuccess: () => toast.success("Sale voided"),
                  })
                }
              />
            ))}
          </div>
        )}
      </div>

      {viewSale && settings && (
        <TransactionViewer
          sale={viewSale}
          onClose={() => setViewSale(null)}
          settings={settings}
          canCollect={can("pos.credit") || can("pos.sell")}
          cashier={{
            id: profile?.id || null,
            name: profile?.name || "Unknown",
          }}
        />
      )}
    </div>
  );
}

/* Dense single-line transaction row — replaces the previous ~100px card */
function TransactionRow({
  sale,
  currency,
  initials,
  canViewCosts,
  canVoid,
  onClick,
  onVoid,
}: {
  sale: Sale;
  currency: string;
  initials: string;
  canViewCosts: boolean;
  canVoid: boolean;
  onClick: () => void;
  onVoid: () => void;
}) {
  const totalQty = sale.lines.reduce((sum, l) => sum + l.qty, 0);
  const rawCustomer = sale.customerName?.trim();
  const customer =
    !rawCustomer || rawCustomer.toLowerCase() === "walk-in customer"
      ? "Walk-in"
      : rawCustomer;
  const methodLabel =
    sale.paymentMethod === "transfer"
      ? "Wire"
      : sale.paymentMethod === "cash"
      ? "Cash"
      : sale.paymentMethod === "card"
      ? "Card"
      : sale.paymentMethod === "credit"
      ? "Credit"
      : "Partial";

  const statusMeta = {
    paid: "bg-success/10 text-success border-success/30",
    partial: "bg-yellow-reg/10 text-yellow-reg border-yellow-reg/40",
    credit: "bg-danger/10 text-danger border-danger/30",
  }[sale.paymentStatus];

  // Show the actual transaction day, not "3mo ago" — imported sales must read
  // on the date they happened (device-local, matching the report's day filter).
  const dayLabel = formatDate(sale.createdAt);
  const shortDay = new Date(sale.createdAt).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
  });
  const fullWhen = new Date(sale.createdAt).toLocaleString();

  return (
    <div className="flex items-center h-[27px] max-md:h-[21px] hover:bg-paper/50 transition text-[11px] leading-tight">
      <button
        onClick={onClick}
        className="flex-1 flex items-center gap-1.5 md:gap-2 px-2 max-md:pr-1 py-1 max-md:py-0 min-w-0 text-left max-md:grid max-md:grid-cols-[40px_17.5px_minmax(0,1fr)_auto_auto_auto] max-md:gap-x-1 h-full"
        title={`${customer} · ${sale.number}`}
      >
        <span
          className={cn(
            "shrink-0 rounded-full border px-1.5 py-px text-[8px] uppercase tracking-widest font-bold max-md:justify-self-start max-md:leading-none",
            sale.paymentMethod === "transfer" && sale.paymentStatus === "paid"
              ? "bg-cyan-reg/10 text-cyan-reg border-cyan-reg/30"
              : statusMeta
          )}
        >
          {methodLabel.slice(0, 4)}
        </span>
        <span
          className="shrink-0 text-ink-mute hidden md:inline-flex items-center gap-0.5"
          title={sale.documentType}
        >
          {sale.documentType === "invoice" ? (
            <FileText className="w-2.5 h-2.5" />
          ) : (
            <Receipt className="w-2.5 h-2.5" />
          )}
        </span>
        <span className="font-semibold truncate text-ink shrink-0 max-w-[110px] hidden md:inline">
          {sale.cashierName}
        </span>
        <span
          className="shrink-0 md:hidden inline-flex items-center justify-start text-[11px] font-bold text-ink max-md:leading-none"
          title={sale.cashierName}
        >
          {initials}
        </span>
        <span className="min-w-0 flex flex-col leading-tight md:flex-1 md:flex-row md:items-baseline md:gap-1 max-md:contents">
          <span className="truncate max-md:min-w-0 max-md:leading-none">
            <span className="text-ink font-medium">{customer}</span>
            <span className="opacity-70 hidden md:inline"> by {methodLabel}</span>
          </span>
          <span className="text-[10px] text-ink-mute md:hidden max-md:leading-none truncate" title={fullWhen}>
            {shortDay} · {timeAgo(sale.createdAt).replace(" ago", "")}
          </span>
        </span>
        <span className="font-mono text-[9px] text-ink-mute shrink-0 hidden md:inline">
          {sale.number}
        </span>
        <span className="num text-ink-mute shrink-0 whitespace-nowrap max-md:leading-none max-md:text-[10px] max-md:font-bold">
          {totalQty} {totalQty === 1 ? "Item" : "Items"}
        </span>
        <span className="text-ink-mute shrink-0 hidden md:inline-flex items-center gap-1" title={fullWhen}>
          {dayLabel}
          <span className="text-[9px] text-ink-mute/80">· {timeAgo(sale.createdAt)}</span>
        </span>
        <span className="num font-bold text-ink shrink-0 md:min-w-[70px] text-right max-md:leading-none">
          {formatCurrency(sale.total, currency)}
        </span>
        {sale.amountDue > 0 && (
          <span className="num text-danger shrink-0 hidden md:inline text-[10px]">
            ({formatCurrency(sale.amountDue, currency)} due)
          </span>
        )}
        {canViewCosts && sale.profit !== 0 && (
          <span
            className={cn(
              "num shrink-0 text-[10px] hidden lg:inline",
              sale.profit >= 0 ? "text-success" : "text-danger"
            )}
          >
            {sale.profit >= 0 ? "+" : ""}
            {formatCurrency(sale.profit, currency)}
          </span>
        )}
      </button>
      {canVoid && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onVoid();
          }}
          className="px-1.5 h-6 max-md:h-full max-md:w-4 max-md:px-0 shrink-0 inline-flex items-center justify-center text-danger hover:bg-danger/10 rounded"
          title="Void"
        >
          <Trash2 className="w-3 h-3 max-md:w-2.5 max-md:h-2.5" />
        </button>
      )}
    </div>
  );
}

function TransactionViewer({
  sale,
  onClose,
  settings,
  canCollect,
  cashier,
}: {
  sale: Sale;
  onClose: () => void;
  settings: import("@/types").Settings;
  canCollect: boolean;
  cashier: { id: string | null; name: string };
}) {
  const { data: payments = [] } = useSalePayments(sale.id);
  const addPayment = useAddSalePayment();
  const [addOpen, setAddOpen] = useState(false);
  const [payAmount, setPayAmount] = useState(sale.amountDue);
  const [payMethod, setPayMethod] = useState<PaymentMethod>("cash");

  const collect = async () => {
    if (payAmount <= 0) return toast.error("Amount must be > 0");
    try {
      const updated = await addPayment.mutateAsync({
        saleId: sale.id,
        amount: payAmount,
        paymentMethod: payMethod,
        receivedBy: cashier.id,
        receivedByName: cashier.name,
      });
      if (updated.amountDue <= 0) {
        toast.success("Balance cleared — final receipt issued");
      } else {
        toast.success(`Collected ${formatCurrency(payAmount, settings.currency)}`);
      }
      setAddOpen(false);
      setPayAmount(updated.amountDue);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  const isInvoice = sale.documentType === "invoice" || sale.amountDue > 0;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-2 sm:p-4 animate-fade-in no-print">
        <div
          className={cn(
            "bg-white rounded-lg w-full shadow-2xl overflow-hidden flex flex-col max-h-[95dvh]",
            isInvoice ? "max-w-3xl" : "max-w-md"
          )}
        >
          <div className="p-3 sm:p-4 border-b flex items-center justify-between shrink-0">
            <div>
              <div className="text-[10px] sm:text-[11px] uppercase tracking-widest text-gray-500">
                {isInvoice ? "Credit invoice" : "Sales receipt"}
              </div>
              <div className="font-display text-base sm:text-lg font-bold text-gray-900">{sale.number}</div>
            </div>
            <button
              onClick={onClose}
              className="rounded-md h-8 w-8 flex items-center justify-center hover:bg-gray-100 text-gray-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-auto bg-gray-100">
            <DocumentView sale={sale} settings={settings} payments={payments} />
          </div>

          <ReceiptActions
            sale={sale}
            settings={settings}
            payments={payments}
            onClose={onClose}
            extra={
              sale.amountDue > 0 && canCollect && !addOpen ? (
                <button
                  onClick={() => setAddOpen(true)}
                  className="btn btn-accent flex-1 h-10 text-xs sm:text-sm"
                >
                  <Plus className="w-4 h-4 shrink-0" /> Collect
                </button>
              ) : undefined
            }
          />
          {addOpen && sale.amountDue > 0 && (
            <div className="border-t bg-white p-3 sm:p-4 space-y-2">
              <div className="flex items-center gap-2">
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                  className="input h-10 w-auto text-gray-900 border-gray-300"
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="transfer">Wire</option>
                </select>
                <input
                  autoFocus
                  type="number"
                  min={0}
                  max={sale.amountDue}
                  step="0.01"
                  value={payAmount}
                  onChange={(e) => setPayAmount(Math.max(0, Math.min(sale.amountDue, Number(e.target.value))))}
                  className="input h-10 flex-1 text-right num text-gray-900 border-gray-300"
                />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setAddOpen(false)} className="btn btn-outline flex-1 !text-gray-900 !border-gray-300">Cancel</button>
                <button onClick={collect} disabled={addPayment.isPending} className="btn btn-primary flex-1">
                  <Wallet className="w-4 h-4" /> Confirm
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Portal — ONLY this content is printed */}
      <PrintablePortal>
        <DocumentView sale={sale} settings={settings} payments={payments} />
      </PrintablePortal>
    </>
  );
}

function Stat({
  label,
  value,
  fullValue,
  tone,
}: {
  label: string;
  value: string;
  fullValue?: string;
  tone?: "success" | "danger";
}) {
  const [expanded, setExpanded] = useState(false);
  const showFull = expanded && !!fullValue;

  return (
    <div
      className="paper-card p-2 md:p-4 min-w-0 cursor-pointer select-none"
      onDoubleClick={() => setExpanded((e) => !e)}
    >
      <div className="text-[7px] md:text-[11px] uppercase tracking-wide md:tracking-widest leading-none text-ink-mute truncate">
        {label}
      </div>
      <div
        title={fullValue ?? value}
        className={cn(
          "font-display font-bold num mt-0.5 md:mt-1 leading-tight break-words",
          showFull
            ? "text-[7px] md:text-[clamp(0.65rem,3vw,0.95rem)]"
            : "text-[12px] md:text-[clamp(1rem,5.5vw,1.5rem)]",
          tone === "success" && "text-success",
          tone === "danger" && "text-danger"
        )}
      >
        {showFull ? fullValue : value}
      </div>
    </div>
  );
}
