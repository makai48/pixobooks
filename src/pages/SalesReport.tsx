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
import { useAuth } from "@/hooks/useAuth";
import { cn, download, formatCurrency, formatCompactCurrency, timeAgo, todayISO } from "@/lib/utils";
import type { PaymentMethod, Sale } from "@/types";
import DocumentView from "@/components/features/receipts/DocumentView";
import PrintablePortal from "@/components/features/receipts/PrintablePortal";
import ReceiptActions from "@/components/features/receipts/ReceiptActions";

export default function SalesReport() {
  const { can, canViewCosts, profile } = useAuth();
  const { data: sales = [], isLoading } = useSales(1000);
  const { data: settings } = useShopSettings();
  const voidSale = useVoidSale();

  const [q, setQ] = useState("");
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const [method, setMethod] = useState<"all" | PaymentMethod>("all");
  const [status, setStatus] = useState<"all" | "paid" | "partial" | "credit">("all");
  const [cashier, setCashier] = useState<string>("all");
  const [viewSale, setViewSale] = useState<Sale | null>(null);

  const cashiers = useMemo(
    () => ["all", ...Array.from(new Set(sales.map((s) => s.cashierName)))],
    [sales]
  );

  const filtered = useMemo(() => {
    return sales.filter((s) => {
      const d = s.createdAt.slice(0, 10);
      if (d < from) return false;
      if (d > to) return false;
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
          s.createdAt,
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

  return (
    <div className="p-4 md:p-6 space-y-4">
      <SubNav
        items={[
          { to: "/", label: "Sales POS", icon: LayoutDashboard, end: true },
          { to: "/sales-report", label: "Sales Report", icon: Receipt },
          { to: "/held", label: "Held Tickets", icon: PauseCircle },
          { to: "/quotes", label: "Quotes", icon: FileText },
        ]}
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Sales in period" value={String(filtered.length)} />
        <Stat
          label="Revenue"
          value={formatCompactCurrency(totals.total, currency)}
          fullValue={formatCurrency(totals.total, currency)}
        />
        <Stat
          label="Collected"
          value={formatCompactCurrency(totals.paid, currency)}
          fullValue={formatCurrency(totals.paid, currency)}
          tone="success"
        />
        <Stat
          label="Outstanding"
          value={formatCompactCurrency(totals.due, currency)}
          fullValue={formatCurrency(totals.due, currency)}
          tone={totals.due > 0 ? "danger" : undefined}
        />
      </div>

      {canViewCosts && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat
            label="Cost of goods"
            value={formatCompactCurrency(totals.cost, currency)}
            fullValue={formatCurrency(totals.cost, currency)}
          />
          <Stat
            label="Gross profit"
            value={formatCompactCurrency(totals.profit, currency)}
            fullValue={formatCurrency(totals.profit, currency)}
            tone={totals.profit >= 0 ? "success" : "danger"}
          />
          <Stat
            label="Tax collected"
            value={formatCompactCurrency(totals.tax, currency)}
            fullValue={formatCurrency(totals.tax, currency)}
          />
        </div>
      )}

      <div className="paper-card p-4 grid grid-cols-1 md:grid-cols-6 gap-3">
        <div className="md:col-span-2 relative self-end">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute pointer-events-none" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Number, customer, cashier" className="input pl-9" />
        </div>
        <div>
          <label htmlFor="sr-from" className="label">From</label>
          <input id="sr-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input mt-1" />
        </div>
        <div>
          <label htmlFor="sr-to" className="label">To</label>
          <input id="sr-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input mt-1" />
        </div>
        <div>
          <label htmlFor="sr-payment" className="label">Payment</label>
          <select id="sr-payment" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod | "all")} className="input mt-1">
            <option value="all">All methods</option>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="transfer">Wire</option>
            <option value="credit">Credit</option>
            <option value="partial">Partial</option>
          </select>
        </div>
        <div>
          <label htmlFor="sr-status" className="label">Status</label>
          <select id="sr-status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="input mt-1">
            <option value="all">All</option>
            <option value="paid">Paid</option>
            <option value="partial">Partial</option>
            <option value="credit">Credit</option>
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-xs text-ink-mute inline-flex items-center gap-2">
          <Receipt className="w-3.5 h-3.5" />
          {filtered.length} of {sales.length} transactions · tap any row to view receipt / invoice
        </div>
        <div className="flex gap-2 flex-wrap">
          <select value={cashier} onChange={(e) => setCashier(e.target.value)} className="input h-9 w-auto">
            {cashiers.map((c) => (
              <option key={c} value={c}>
                {c === "all" ? "All cashiers" : c}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              setQ(""); setFrom(todayISO()); setTo(todayISO());
              setMethod("all"); setStatus("all"); setCashier("all");
            }}
            className="btn btn-ghost"
          >
            <RotateCcw className="w-4 h-4" /> Reset
          </button>
          <button onClick={exportCsv} className="btn btn-primary">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* Ultra-compact transaction rows — vertical space reduced ~81% */}
      <div className="paper-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-ink-mute text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-ink-mute text-sm">
            No transactions in this range.
          </div>
        ) : (
          <div className="divide-y">
            {filtered.map((s) => (
              <TransactionRow
                key={s.id}
                sale={s}
                currency={currency}
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
  canViewCosts,
  canVoid,
  onClick,
  onVoid,
}: {
  sale: Sale;
  currency: string;
  canViewCosts: boolean;
  canVoid: boolean;
  onClick: () => void;
  onVoid: () => void;
}) {
  const totalQty = sale.lines.reduce((sum, l) => sum + l.qty, 0);
  const customer = sale.customerName || "Walk-in";
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

  return (
    <div className="flex items-center hover:bg-paper/50 transition text-[11px] leading-tight">
      <button
        onClick={onClick}
        className="flex-1 flex items-center gap-2 px-2 py-1 min-w-0 text-left"
        title={`${customer} · ${sale.number}`}
      >
        <span
          className={cn(
            "shrink-0 rounded-full border px-1.5 py-0 text-[8px] uppercase tracking-widest font-bold",
            statusMeta
          )}
        >
          {sale.paymentStatus}
        </span>
        <span className="shrink-0 text-ink-mute inline-flex items-center gap-0.5" title={sale.documentType}>
          {sale.documentType === "invoice" ? (
            <FileText className="w-2.5 h-2.5" />
          ) : (
            <Receipt className="w-2.5 h-2.5" />
          )}
        </span>
        <span className="font-semibold truncate text-ink shrink-0 max-w-[110px]">
          {sale.cashierName}
        </span>
        <span className="text-ink-mute truncate min-w-0 flex-1">
          <span className="text-ink font-medium">{customer}</span>
          <span className="opacity-70"> by {methodLabel}</span>
        </span>
        <span className="font-mono text-[9px] text-ink-mute shrink-0 hidden sm:inline">
          {sale.number}
        </span>
        <span className="num text-ink-mute shrink-0 hidden md:inline">
          {totalQty} item{totalQty !== 1 ? "s" : ""}
        </span>
        <span className="text-ink-mute shrink-0">{timeAgo(sale.createdAt)}</span>
        <span className="num font-bold text-ink shrink-0 min-w-[70px] text-right">
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
          className="px-1.5 h-6 shrink-0 text-danger hover:bg-danger/10 rounded"
          title="Void"
        >
          <Trash2 className="w-3 h-3" />
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
      <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-4 animate-fade-in no-print">
        <div
          className={cn(
            "bg-white rounded-lg w-full shadow-2xl overflow-hidden flex flex-col max-h-[95dvh]",
            isInvoice ? "max-w-3xl" : "max-w-md"
          )}
        >
          <div className="p-4 border-b flex items-center justify-between shrink-0">
            <div>
              <div className="text-[11px] uppercase tracking-widest text-gray-500">
                {isInvoice ? "Credit invoice" : "Sales receipt"}
              </div>
              <div className="font-display text-lg font-bold text-gray-900">{sale.number}</div>
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
            <div className="border-t bg-white p-4 space-y-2">
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
      className="paper-card p-4 min-w-0 cursor-pointer select-none"
      onDoubleClick={() => setExpanded((e) => !e)}
    >
      <div className="text-[11px] uppercase tracking-widest text-ink-mute truncate">
        {label}
      </div>
      <div
        title={fullValue ?? value}
        className={cn(
          "font-display font-bold num mt-1 leading-tight break-words",
          showFull
            ? "text-[clamp(0.65rem,3vw,0.95rem)]"
            : "text-[clamp(1rem,5.5vw,1.5rem)]",
          tone === "success" && "text-success",
          tone === "danger" && "text-danger"
        )}
      >
        {showFull ? fullValue : value}
      </div>
    </div>
  );
}
