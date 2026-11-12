import { useMemo, useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Landmark,
  Banknote,
  TrendingUp,
  Plus,
  X,
  Trash2,
  Wallet,
  Repeat,
  ArrowDownRight,
  ArrowUpRight,
  Scale,
  CheckCircle2,
  Info,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { useSales } from "@/hooks/useSales";
import { useExpenses } from "@/hooks/useExpenses";
import { useShopSettings } from "@/hooks/useShopSettings";
import { useAuth } from "@/hooks/useAuth";
import {
  useBankDeposits,
  useCreateBankDeposit,
  useDeleteBankDeposit,
  useUpdateBankDeposit,
  useMostRecentBankAccount,
} from "@/hooks/useBankDeposits";
import {
  useStandingOrders,
  useUpsertStandingOrder,
  useDeleteStandingOrder,
} from "@/hooks/useStandingOrders";
import {
  useUpsertDailyBalancing,
  useLiveOpeningBalance,
} from "@/hooks/useDailyBalancing";
import { useClientReceivablesTotals } from "@/hooks/useClients";
import { cn, formatCurrency, formatDate, formatDateTime, formatMoney, todayISO, localISODate } from "@/lib/utils";
import GlassSelect from "@/components/ui/GlassSelect";
import GlassDatePicker from "@/components/ui/GlassDatePicker";
import StatCard from "@/components/ui/StatCard";
import MoneyText from "@/components/ui/MoneyText";
import type { StandingOrder, StandingOrderKind, StandingOrderFrequency, BankDeposit } from "@/types";
import { MONTH_NAMES } from "@/types";
import { EMPTY_DAY_FLOW, effectiveBankedToday } from "@/lib/cashLedger";
import "./financial-statements.css";

type Tab = "cashbook" | "bank" | "pnl" | "orders";

/** Tabs shown in Financial Statements, in order. Each one is gated by its own
 *  `finance.*.view` permission (see the component below). */
const FINANCE_TABS: {
  k: Tab;
  label: string;
  short: string;
  icon: import("lucide-react").LucideIcon;
}[] = [
  { k: "cashbook", label: "Cashbook", short: "Cash", icon: Banknote },
  { k: "bank", label: "Bank Statement", short: "Bank", icon: Landmark },
  { k: "pnl", label: "Profit & Loss", short: "P&L", icon: TrendingUp },
  { k: "orders", label: "Standing Orders & Loans", short: "Orders", icon: Repeat },
];

export default function FinancialStatements() {
  const { profile, can } = useAuth();
  const { data: sales = [] } = useSales(5000);
  const { data: expenses = [] } = useExpenses();
  const { data: settings } = useShopSettings();
  const [now] = useState(() => new Date());
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  /** Statement period defaults to Today (per policy). "month" switches
   *  to the month/year pickers for historical statements. */
  const [periodMode, setPeriodMode] = useState<"today" | "month">("today");

  /* Granular finance access. The legacy umbrella keys (`finance.view` /
   * `finance.manage`) are honoured as fallbacks so every employee that had
   * access before the split keeps exactly the same tabs and buttons. */
  const canCashbook = can("finance.cashbook.view") || can("finance.view");
  const canBank =
    can("finance.bank.view") ||
    can("finance.bank.manage") ||
    can("finance.bank.delete") ||
    can("finance.view");
  const canPnl = can("finance.pnl.view") || can("finance.view");
  const canOrders =
    can("finance.orders.view") ||
    can("finance.orders.manage") ||
    can("finance.orders.delete") ||
    can("finance.view");
  const canRecordBanking = can("finance.bank.manage") || can("finance.manage");
  const canDeleteBanking = can("finance.bank.delete") || can("finance.manage");
  const canManageOrders = can("finance.orders.manage") || can("finance.manage");
  const canDeleteOrders = can("finance.orders.delete") || can("finance.manage");

  const allowedTabs = useMemo(
    () =>
      FINANCE_TABS.filter((t) =>
        t.k === "cashbook"
          ? canCashbook
          : t.k === "bank"
            ? canBank
            : t.k === "pnl"
              ? canPnl
              : canOrders
      ),
    [canCashbook, canBank, canPnl, canOrders]
  );

  const [tab, setTab] = useState<Tab>(() => allowedTabs[0]?.k ?? "cashbook");
  const [balancingOpen, setBalancingOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [editOrder, setEditOrder] = useState<StandingOrder | null>(null);
  const [editDeposit, setEditDeposit] = useState<BankDeposit | null>(null);

  // Permissions can change while the page is open (another admin edits them).
  // Never leave the user parked on a tab they can no longer see.
  useEffect(() => {
    if (allowedTabs.length && !allowedTabs.some((t) => t.k === tab)) {
      setTab(allowedTabs[0].k);
    }
  }, [allowedTabs, tab]);

  const today = todayISO();
  const from =
    periodMode === "today"
      ? today
      : localISODate(new Date(year, month, 1));
  const to =
    periodMode === "today"
      ? today
      : localISODate(new Date(year, month + 1, 0));
  const { data: deposits = [] } = useBankDeposits(from, to);
  const { data: orders = [] } = useStandingOrders();
  const currency = settings?.currency || "USD";
  const ledger = useClientReceivablesTotals();

  const years = useMemo(() => {
    const y: number[] = [];
    for (let i = now.getFullYear() - 5; i <= now.getFullYear() + 1; i++) y.push(i);
    return y;
  }, [now]);

  // Filter by LOCAL business date (not UTC .slice) so late-evening
  // sales stay attributed to the correct business day.
  const salesInMonth = useMemo(() => sales.filter((s) => {
    if (s.voidedAt) return false;
    const d = localISODate(s.createdAt);
    return d >= from && d <= to;
  }), [sales, from, to]);

  const expInMonth = useMemo(() => expenses.filter((e) => e.expenseDate >= from && e.expenseDate <= to), [expenses, from, to]);

  type Row = { date: string; ref: string; description: string; debit: number; credit: number; };

  const cashRows: Row[] = useMemo(() => {
    const rows: Row[] = [];
    for (const s of salesInMonth) {
      if (s.paymentMethod === "cash" && s.amountPaid > 0) {
        rows.push({ date: localISODate(s.createdAt), ref: s.number, description: `Cash sale · ${s.customerName || "Walk-in"}`, debit: s.amountPaid, credit: 0 });
      }
      if (s.paymentMethod === "partial" && s.amountPaid > 0) {
        rows.push({ date: localISODate(s.createdAt), ref: s.number, description: `Cash portion · ${s.customerName || "Walk-in"}`, debit: s.amountPaid, credit: 0 });
      }
    }
    for (const e of expInMonth) {
      if (e.paymentMethod === "cash") {
        rows.push({ date: e.expenseDate, ref: e.id.slice(0, 6).toUpperCase(), description: `${e.category} · ${e.description}`, debit: 0, credit: e.amount });
      }
    }
    for (const d of deposits) {
      rows.push({ date: d.depositedAt, ref: (d.reference || d.id).slice(0, 8), description: `Banking to ${d.bankName || "bank"}`, debit: 0, credit: d.amount });
    }
    return rows.sort((a, b) => a.date.localeCompare(b.date));
  }, [salesInMonth, expInMonth, deposits]);

  const cashTotals = cashRows.reduce((a, r) => ({ debit: a.debit + r.debit, credit: a.credit + r.credit }), { debit: 0, credit: 0 });
  const cashBalance = cashTotals.debit - cashTotals.credit;

  const bankRows: Row[] = useMemo(() => {
    const rows: Row[] = [];
    for (const s of salesInMonth) {
      if ((s.paymentMethod === "card" || s.paymentMethod === "transfer") && s.amountPaid > 0) {
        rows.push({ date: localISODate(s.createdAt), ref: s.number, description: `${s.paymentMethod === "card" ? "Card" : "Transfer"} · ${s.customerName || "Walk-in"}`, debit: s.amountPaid, credit: 0 });
      }
    }
    for (const d of deposits) {
      rows.push({ date: d.depositedAt, ref: (d.reference || d.id).slice(0, 8), description: `Cash deposit from till`, debit: d.amount, credit: 0 });
    }
    for (const e of expInMonth) {
      if (e.paymentMethod === "card" || e.paymentMethod === "transfer") {
        rows.push({ date: e.expenseDate, ref: e.id.slice(0, 6).toUpperCase(), description: `${e.category} · ${e.description}`, debit: 0, credit: e.amount });
      }
    }
    return rows.sort((a, b) => a.date.localeCompare(b.date));
  }, [salesInMonth, expInMonth, deposits]);

  const bankTotals = bankRows.reduce((a, r) => ({ debit: a.debit + r.debit, credit: a.credit + r.credit }), { debit: 0, credit: 0 });
  const bankBalance = bankTotals.debit - bankTotals.credit;

  const revenue = salesInMonth.reduce((s, x) => s + x.total, 0);
  const cogs = salesInMonth.reduce((s, x) => s + x.cost, 0);
  const gross = revenue - cogs;
  const totalExp = expInMonth.reduce((s, e) => s + e.amount, 0);
  const expByCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of expInMonth) m.set(e.category, (m.get(e.category) || 0) + e.amount);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [expInMonth]);
  const net = gross - totalExp;

  return (
    <div className="p-2.5 md:p-6 space-y-2 md:space-y-4">
      <div className="paper-card p-2.5 md:p-4 flex flex-col md:flex-row md:items-center gap-1.5 md:gap-3">
        <div className="flex items-center gap-1.5 text-ink-mute shrink-0">
          <Landmark className="w-3.5 h-3.5 md:w-4 md:h-4" />
          <span className="label text-[7px] md:text-[11px] whitespace-nowrap">Statement period</span>
        </div>
        <div className="flex items-center gap-1 md:gap-2 md:flex-1 flex-wrap">
          <button
            type="button"
            onClick={() => setPeriodMode("today")}
            className={cn(
              "chip border px-2 h-6 text-[9px] md:text-[10px] transition",
              periodMode === "today"
                ? "bg-ink text-paper border-ink"
                : "border-line hover:border-ink"
            )}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setPeriodMode("month")}
            className={cn(
              "chip border px-2 h-6 text-[9px] md:text-[10px] transition",
              periodMode === "month"
                ? "bg-ink text-paper border-ink"
                : "border-line hover:border-ink"
            )}
          >
            Month
          </button>
          {periodMode === "month" && (
            <>
              <GlassSelect
                value={String(month)}
                onChange={(v) => setMonth(Number(v))}
                ariaLabel="Statement month"
                options={MONTH_NAMES.map((m, i) => ({ value: String(i), label: m }))}
                className="input input-sm select-glass max-md:px-1.5"
              />
              <GlassSelect
                value={String(year)}
                onChange={(v) => setYear(Number(v))}
                ariaLabel="Statement year"
                options={years.map((y) => ({ value: String(y), label: String(y) }))}
                className="input input-sm select-glass max-md:px-1.5"
              />
            </>
          )}
        </div>
        {(canRecordBanking || canManageOrders) && (
          <div className="flex gap-1 md:gap-2 flex-wrap">
            {canRecordBanking && (
              <button onClick={() => setBalancingOpen(true)} className="btn btn-accent btn-sm">
                <Scale className="w-3.5 h-3.5 md:w-4 md:h-4" />
                <span className="hidden sm:inline">Daily Balancing &amp; Banking</span>
                <span className="sm:hidden">Balancing</span>
              </button>
            )}
            {canManageOrders && (
              <button onClick={() => { setEditOrder(null); setOrderOpen(true); }} className="btn btn-outline btn-sm">
                <Repeat className="w-3.5 h-3.5 md:w-4 md:h-4" />
                <span className="hidden sm:inline">Standing / Loan</span>
                <span className="sm:hidden">Standing</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Client Billing receivables summary — sourced from client_invoices */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 md:gap-3">
        <StatCard
          label="Client AR (billed)"
          value={formatMoney(ledger.totalReceivable, currency)}
          fullValue={formatCurrency(ledger.totalReceivable, currency)}
          tone={ledger.totalReceivable > 0 ? "success" : undefined}
        />
        <StatCard
          label="Overdue AR"
          value={formatMoney(ledger.overdue, currency)}
          fullValue={formatCurrency(ledger.overdue, currency)}
          tone={ledger.overdue > 0 ? "danger" : undefined}
        />
        <StatCard
          label="Billed this month"
          value={formatMoney(ledger.billedThisMonth, currency)}
          fullValue={formatCurrency(ledger.billedThisMonth, currency)}
        />
        <StatCard
          label="Paid this month"
          value={formatMoney(ledger.paidThisMonth, currency)}
          fullValue={formatCurrency(ledger.paidThisMonth, currency)}
          tone="success"
        />
      </div>

      {allowedTabs.length === 0 ? (
        <div className="paper-card p-6 text-center text-ink-mute text-sm">
          You do not have permission to view any finance statement. Ask an admin
          for cashbook, bank, P&amp;L or orders access.
        </div>
      ) : (
      <div className="paper-card overflow-hidden">
        <div className="border-b flex overflow-x-auto scrollbar-none">
          {allowedTabs.map(({ k, label, short, icon: Icon }) => (
            <button key={k} onClick={() => setTab(k)} className={cn("px-2.5 md:px-4 h-9 md:h-12 flex items-center gap-1 md:gap-2 text-[10px] md:text-sm font-semibold border-b-2 transition whitespace-nowrap", tab === k ? "border-magenta-reg text-magenta-reg" : "border-transparent text-ink-mute hover:text-ink")}>
              <Icon className="w-3 h-3 md:w-4 md:h-4" />
              <span className="md:hidden">{short}</span>
              <span className="hidden md:inline">{label}</span>
            </button>
          ))}
        </div>

        <div className="p-2 md:p-4">
          {tab === "cashbook" && (
            <LedgerTable rows={cashRows} debitLabel="Cash in" creditLabel="Cash out" totals={cashTotals} balance={cashBalance} currency={currency} balanceLabel="Cash on hand" />
          )}
          {tab === "bank" && (
            <LedgerTable rows={bankRows} debitLabel="Deposits" creditLabel="Withdrawals" totals={bankTotals} balance={bankBalance} currency={currency} balanceLabel="Bank balance" />
          )}
          {tab === "pnl" && (
            <ProfitLoss revenue={revenue} cogs={cogs} gross={gross} expByCategory={expByCategory} totalExp={totalExp} net={net} currency={currency} />
          )}
          {tab === "orders" && (
            <StandingOrdersView
              orders={orders}
              onEdit={(o) => { setEditOrder(o); setOrderOpen(true); }}
              currency={currency}
              canEdit={canManageOrders}
              canDelete={canDeleteOrders}
            />
          )}
        </div>
      </div>
      )}

      {balancingOpen && (
        <DailyBalancingModal
          onClose={() => setBalancingOpen(false)}
          currency={currency}
          actor={profile ? { id: profile.id, name: profile.name, role: profile.role } : undefined}
        />
      )}

      {orderOpen && (
        <StandingOrderModal order={editOrder} currency={currency} onClose={() => { setOrderOpen(false); setEditOrder(null); }} createdBy={profile?.id || null} />
      )}

      {(canCashbook || canBank) && deposits.length > 0 && (
        <div className="paper-card td-card">
          <div className="td-kicker mb-1.5 md:mb-2">Recent daily banking entries</div>
          <DepositsList
            deposits={deposits}
            currency={currency}
            canEdit={canRecordBanking}
            canDelete={canDeleteBanking}
            onEdit={setEditDeposit}
          />
        </div>
      )}

      {editDeposit && (
        <BankDepositModal
          deposit={editDeposit}
          currency={currency}
          actor={profile ? { id: profile.id, name: profile.name, role: profile.role } : undefined}
          onClose={() => setEditDeposit(null)}
        />
      )}
    </div>
  );
}

function LedgerTable({ rows, debitLabel, creditLabel, totals, balance, currency, balanceLabel }: {
  rows: { date: string; ref: string; description: string; debit: number; credit: number }[];
  debitLabel: string; creditLabel: string; totals: { debit: number; credit: number };
  balance: number; currency: string; balanceLabel: string;
}) {
  let running = 0;
  return (
    <div>
      <div className="grid grid-cols-3 gap-1.5 md:gap-3 mb-2 md:mb-4">
        <StatCard label={debitLabel} value={formatMoney(totals.debit, currency)} fullValue={formatCurrency(totals.debit, currency)} tone="success" />
        <StatCard label={creditLabel} value={formatMoney(totals.credit, currency)} fullValue={formatCurrency(totals.credit, currency)} tone="danger" />
        <StatCard label={balanceLabel} value={formatMoney(balance, currency)} fullValue={formatCurrency(balance, currency)} tone={balance >= 0 ? "success" : "danger"} />
      </div>
      <div className="overflow-auto max-h-[50vh] scroll-lined border rounded-md">
        <table className="w-full text-[10px] md:text-sm">
          <thead className="bg-paper sticky top-0">
            <tr className="text-left text-[8px] md:text-[10px] uppercase tracking-wide md:tracking-widest text-ink-mute">
              <th className="p-1 pl-2 md:p-2 md:pl-3">Date</th>
              <th className="p-1 md:p-2 hidden md:table-cell">Ref</th>
              <th className="p-1 md:p-2">Description</th>
              <th className="p-1 md:p-2 text-right">{debitLabel}</th>
              <th className="p-1 md:p-2 text-right">{creditLabel}</th>
              <th className="p-1 pr-2 md:p-2 md:pr-3 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="p-6 md:p-8 text-center text-ink-mute">No entries for this period.</td></tr>
            ) : (
              rows.map((r, i) => {
                running += r.debit - r.credit;
                return (
                  <tr key={i} className="border-t hover:bg-paper/40">
                    <td className="px-1 pl-2 md:px-2 md:pl-3 h-[24px] md:h-[30px] text-[9px] md:text-xs whitespace-nowrap">
                      <span className="md:hidden">{r.date.slice(5)}</span>
                      <span className="hidden md:inline">{formatDate(r.date)}</span>
                    </td>
                    <td className="px-1 md:px-2 h-[24px] md:h-[30px] font-mono text-[10px] md:text-xs hidden md:table-cell">{r.ref}</td>
                    <td className="px-1 md:px-2 h-[24px] md:h-[30px] text-[9px] md:text-xs truncate max-w-[110px] md:max-w-none">{r.description}</td>
                    <td className="px-1 md:px-2 h-[24px] md:h-[30px] text-right num text-[9px] md:text-xs text-success whitespace-nowrap">{r.debit > 0 ? formatMoney(r.debit, currency) : "—"}</td>
                    <td className="px-1 md:px-2 h-[24px] md:h-[30px] text-right num text-[9px] md:text-xs text-danger whitespace-nowrap">{r.credit > 0 ? formatMoney(r.credit, currency) : "—"}</td>
                    <td className="px-1 pr-2 md:px-2 md:pr-3 h-[24px] md:h-[30px] text-right num text-[9px] md:text-xs font-semibold whitespace-nowrap">{formatMoney(running, currency)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot className="bg-paper/60">
            <tr className="border-t font-semibold">
              <td colSpan={2} className="p-1 pl-2 md:hidden text-[8px] uppercase text-ink-mute">Totals</td>
              <td colSpan={3} className="p-2 pl-3 text-xs uppercase text-ink-mute hidden md:table-cell">Totals</td>
              <td className="p-1 md:p-2 text-right num text-[9px] md:text-xs text-success whitespace-nowrap">{formatMoney(totals.debit, currency)}</td>
              <td className="p-1 md:p-2 text-right num text-[9px] md:text-xs text-danger whitespace-nowrap">{formatMoney(totals.credit, currency)}</td>
              <td className="p-1 pr-2 md:p-2 md:pr-3 text-right num text-[9px] md:text-xs whitespace-nowrap">{formatMoney(balance, currency)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function ProfitLoss({ revenue, cogs, gross, expByCategory, totalExp, net, currency }: {
  revenue: number; cogs: number; gross: number; expByCategory: [string, number][]; totalExp: number; net: number; currency: string;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-4">
      <div className="md:col-span-2 border rounded-md overflow-hidden">
        <table className="w-full text-[10px] md:text-sm">
          <tbody>
            <PLRow label="Revenue" value={revenue} currency={currency} strong />
            <PLRow label="− Cost of goods sold" value={-cogs} currency={currency} indent />
            <PLRow label="Gross profit" value={gross} currency={currency} strong divider />
            {expByCategory.map(([cat, amt]) => (
              <PLRow key={cat} label={`− ${cat}`} value={-amt} currency={currency} indent />
            ))}
            <PLRow label="Total operating expenses" value={-totalExp} currency={currency} strong divider />
            <tr className="border-t bg-magenta-reg/5">
              <td className="p-2 md:p-3 font-bold uppercase tracking-wide md:tracking-widest text-[9px] md:text-sm">Net profit / (loss)</td>
              <td className={cn("p-2 md:p-3 text-right num font-bold text-sm md:text-lg whitespace-nowrap", net >= 0 ? "text-success" : "text-danger")}>{formatMoney(net, currency)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-1 gap-1.5 md:gap-2">
        <StatCard label="Revenue" value={formatMoney(revenue, currency)} tone="success" />
        <StatCard label="COGS" value={formatMoney(cogs, currency)} />
        <StatCard label="Gross margin" value={revenue > 0 ? `${((gross / revenue) * 100).toFixed(1)}%` : "—"} />
        <StatCard label="Operating exp" value={formatMoney(totalExp, currency)} tone="danger" />
        <StatCard label="Net result" value={formatMoney(net, currency)} tone={net >= 0 ? "success" : "danger"} />
      </div>
    </div>
  );
}

function PLRow({ label, value, currency, strong, indent, divider }: { label: string; value: number; currency: string; strong?: boolean; indent?: boolean; divider?: boolean; }) {
  return (
    <tr className={cn(divider && "border-t")}>
      <td className={cn("p-1.5 md:p-2", strong && "font-semibold", indent && "pl-4 md:pl-6 text-ink-mute")}>{label}</td>
      <td className={cn("p-1.5 md:p-2 text-right num whitespace-nowrap", strong && "font-bold", value < 0 && !indent && "text-danger")}>{formatMoney(value, currency)}</td>
    </tr>
  );
}

function StandingOrdersView({ orders, onEdit, currency, canEdit, canDelete }: {
  orders: StandingOrder[]; onEdit: (o: StandingOrder) => void; currency: string;
  canEdit: boolean; canDelete: boolean;
}) {
  const del = useDeleteStandingOrder();
  const upsert = useUpsertStandingOrder();
  const grouped = { standing: orders.filter((o) => o.kind === "standing"), loan: orders.filter((o) => o.kind === "loan") };
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-4">
      {(["standing", "loan"] as StandingOrderKind[]).map((kind) => (
        <div key={kind} className="border rounded-md overflow-hidden">
          <div className="td-card bg-paper border-b">
            <div className="td-kicker">{kind === "loan" ? "Loans" : "Standing orders"}</div>
          </div>
          {grouped[kind].length === 0 ? (
            <div className="p-4 md:p-6 td-body text-ink-mute text-center">No {kind === "loan" ? "loans" : "standing orders"} yet.</div>
          ) : (
            <div className="divide-y">
              {grouped[kind].map((o) => (
                <div key={o.id} className="p-2 md:p-3 flex items-start gap-2 md:gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold td-body truncate">{o.name}</div>
                    <div className="td-hint truncate">{o.payee} · {o.frequency} · next {o.nextRunDate || "—"}</div>
                    {kind === "loan" && o.loanBalance != null && (
                      <div className="td-body text-magenta-reg mt-0.5 truncate">
                        Balance: {formatMoney(o.loanBalance, o.currency || currency)}
                        {o.loanRate ? ` · ${o.loanRate}% APR` : ""}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="num font-bold td-body whitespace-nowrap">{formatMoney(o.amount, o.currency || currency)}</div>
                    <div className="flex gap-1 mt-1 justify-end">
                      {canEdit && (
                        <>
                          <button onClick={() => upsert.mutate({ ...o, active: !o.active })} className={cn("chip text-[8px] md:text-[10px] uppercase border px-1 md:px-1.5", o.active ? "bg-success/10 text-success border-success/30" : "bg-ink/5 text-ink-mute border-line")}>
                            {o.active ? "Active" : "Paused"}
                          </button>
                          <button onClick={() => onEdit(o)} className="btn btn-ghost h-5 w-5 md:h-6 md:w-6 p-0" title="Edit"><Wallet className="w-2.5 h-2.5 md:w-3 md:h-3" /></button>
                        </>
                      )}
                      {canDelete && (
                        <button onClick={() => confirm(`Delete "${o.name}"?`) && del.mutate(o.id, { onSuccess: () => toast.success("Deleted") })} className="btn btn-ghost h-5 w-5 md:h-6 md:w-6 p-0 text-danger" title="Delete">
                          <Trash2 className="w-2.5 h-2.5 md:w-3 md:h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function DepositsList({ deposits, currency, canEdit, canDelete, onEdit }: {
  deposits: BankDeposit[]; currency: string;
  canEdit: boolean; canDelete: boolean; onEdit: (d: BankDeposit) => void;
}) {
  const del = useDeleteBankDeposit();
  return (
    <div className="divide-y">
      {deposits.map((d) => (
        <div key={d.id} className="py-1 md:py-2 flex items-center justify-between td-body gap-2">
          <div className="min-w-0">
            <div className="font-semibold truncate">{d.bankName || "Bank"} · {d.reference || "no ref"}</div>
            <div className="td-hint truncate">{formatDate(d.depositedAt)} · {d.createdByName || "—"}</div>
          </div>
          <div className="flex items-center gap-1 md:gap-2 shrink-0">
            <span className="num font-semibold whitespace-nowrap">{formatMoney(d.amount, currency)}</span>
            {canEdit && (
              <button onClick={() => onEdit(d)} className="btn btn-ghost h-6 w-6 md:h-7 md:w-7 p-0" title="Edit deposit">
                <Pencil className="w-3 h-3 md:w-3.5 md:h-3.5" />
              </button>
            )}
            {canDelete && (
              <button onClick={() => confirm("Delete this deposit?") && del.mutate(d.id, { onSuccess: () => toast.success("Deleted") })} className="btn btn-ghost h-6 w-6 md:h-7 md:w-7 p-0 text-danger" title="Delete">
                <Trash2 className="w-3 h-3 md:w-3.5 md:h-3.5" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Edit an existing till → bank deposit. Posting a deposit is the "create"
 *  side of the bank statement (Daily Balancing); this is the "update" side.
 *  Gated by `finance.bank.manage`. */
function BankDepositModal({ deposit, currency, actor, onClose }: {
  deposit: BankDeposit; currency: string;
  actor?: { id: string; name: string; role?: string };
  onClose: () => void;
}) {
  const update = useUpdateBankDeposit();
  const [amount, setAmount] = useState(deposit.amount);
  const [depositedAt, setDepositedAt] = useState(deposit.depositedAt);
  const [bankName, setBankName] = useState(deposit.bankName || "");
  const [reference, setReference] = useState(deposit.reference || "");
  const [notes, setNotes] = useState(deposit.notes || "");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!Number.isFinite(amount) || amount <= 0) return toast.error("Amount must be greater than 0");
    if (!depositedAt) return toast.error("Date required");
    try {
      await update.mutateAsync({
        id: deposit.id,
        amount,
        depositedAt,
        bankName: bankName.trim() || null,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
        actor,
      });
      toast.success("Bank entry updated");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink/50 flex items-center justify-center p-2 md:p-4 animate-fade-in">
      <div className="paper-card w-full max-w-md overflow-hidden max-h-[95dvh] flex flex-col">
        <div className="p-2.5 md:p-4 border-b flex items-center justify-between shrink-0">
          <div>
            <div className="td-kicker">Bank statement</div>
            <h2 className="td-title">Edit bank entry</h2>
          </div>
          <button onClick={onClose} className="btn btn-ghost h-7 w-7 md:h-9 md:w-9 p-0"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={submit} className="p-2.5 md:p-4 space-y-2 md:space-y-3 overflow-auto scroll-lined">
          <div className="grid grid-cols-2 gap-2 md:gap-3">
            <div>
              <label htmlFor="fs-edit-deposit-amount" className="td-label">Amount ({currency})</label>
              <input
                id="fs-edit-deposit-amount"
                type="number"
                min={0}
                step="0.01"
                value={amount || ""}
                onChange={(e) => setAmount(Number(e.target.value) || 0)}
                className="input input-sm mt-1 num text-right"
              />
            </div>
            <div>
              <label htmlFor="fs-edit-deposit-date" className="td-label">Date</label>
              <GlassDatePicker
                id="fs-edit-deposit-date"
                value={depositedAt}
                onChange={setDepositedAt}
                ariaLabel="Deposit date"
                className="input input-sm select-glass mt-1"
              />
            </div>
            <div className="col-span-2">
              <label htmlFor="fs-edit-deposit-bank" className="td-label">Bank / Account</label>
              <input
                id="fs-edit-deposit-bank"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                className="input input-sm mt-1"
              />
            </div>
            <div className="col-span-2">
              <label htmlFor="fs-edit-deposit-ref" className="td-label">Reference / Slip #</label>
              <input
                id="fs-edit-deposit-ref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="input input-sm mt-1 num"
              />
            </div>
            <div className="col-span-2">
              <label htmlFor="fs-edit-deposit-notes" className="td-label">Notes</label>
              <textarea
                id="fs-edit-deposit-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="input input-sm mt-1 min-h-12 md:min-h-16"
              />
            </div>
          </div>
          <div className="flex justify-end gap-1.5 md:gap-2 pt-1.5 md:pt-2 border-t">
            <button type="button" onClick={onClose} className="btn btn-outline btn-sm">Cancel</button>
            <button type="submit" disabled={update.isPending} className="btn btn-primary btn-sm">
              {update.isPending ? "Saving..." : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* Daily Balancing & Banking
 *
 * Full audit trail: Balance b/f → Current Day Transactions → Balance c/d.
 *
 *   • Balance b/f is READ-ONLY: derived once from the full cash
 *     ledger via `useLiveOpeningBalance`, then FROZEN for the modal
 *     session. It is the sum of every net cash movement strictly
 *     BEFORE today (cash payments, cash expenses, drawings and bank
 *     deposits). No stored snapshot is read, and no mid-session
 *     refetch can move it — so late settlements, back-dated entries
 *     and repeated balancing cannot make it fluctuate while balancing.
 *
 *   • Total Sales = today's cash received (sale_payments cash rows,
 *     plus legacy cash/partial sales that have no payment row).
 *     Previous-day carry-forward is NOT counted as today's sales.
 *
 *   • Drawings is READ-ONLY — sourced live from the Drawings ledger
 *     (Expenses > Drawings tab).
 *
 *   • Calculated Balance c/d is READ-ONLY, live-computed leftover cash:
 *         c/d = (b/f + Cash Sales − Cash Expenses − Drawings) − banked
 *     It is ALWAYS the sole source of the next business day's b/f.
 *
 *   • Physical Cash Count and Variance are OPTIONAL and stored
 *     SEPARATELY from the calculated figures. A till discrepancy
 *     therefore never contaminates the accounting chain.
 *
 *   • Banking is a Till → Bank transfer only. Recording a deposit
 *     credits the Cashbook and debits the Bank Statement in a single
 *     idempotent bank_deposits row — never as a sale, income or
 *     expense, and never as two independent movements that could
 *     diverge. Balancing deposits are ALWAYS dated today: a back-dated
 *     deposit would retroactively move today's b/f source, so date
 *     corrections belong in the bank-entry editor, not in this modal.
 *
 *   • Same-day re-balancing is supported: the deposit form resets
 *     after each save while the summary refreshes from the live
 *     ledger, so late transactions can be re-banked without waiting
 *     for a new business day.
 */
function DailyBalancingModal({ onClose, currency, actor }: {
  onClose: () => void; currency: string;
  actor?: { id: string; name: string; role?: string };
}) {
  const today = todayISO();
  const qc = useQueryClient();
  const create = useCreateBankDeposit();
  const persistBalancing = useUpsertDailyBalancing();
  const { data: liveLedger, isLoading: bfLoading } = useLiveOpeningBalance(today);
  const { data: mruBank } = useMostRecentBankAccount();
  const { data: todayDeposits = [] } = useBankDeposits(today, today);

  // Balance b/f — FROZEN at the first successful ledger load for this
  // modal session. The live figure is the sum of every net cash movement
  // strictly BEFORE today, so intraday sales and same-day banking can
  // never move it — but refetch timing / back-dated writes landing
  // mid-session made the on-screen number jump. Freezing keeps the
  // b/f → c/d chain the user balances against perfectly stable while
  // the modal is open. (Next open re-derives from the live ledger.)
  const [frozenBf, setFrozenBf] = useState<number | null>(null);
  useEffect(() => {
    if (frozenBf === null && !bfLoading && liveLedger) {
      setFrozenBf(liveLedger.openingBalance);
    }
  }, [liveLedger, bfLoading, frozenBf]);
  const bfReady = frozenBf !== null;
  const openingBalance = frozenBf ?? 0;

  // Today's flow stays LIVE so transactions rung up after banking are
  // immediately bankable in the same session.
  const dayFlow = liveLedger?.day ?? EMPTY_DAY_FLOW;
  const cashSales = dayFlow.cashSales;
  const cashExpenses = dayFlow.cashExpenses;
  const drawings = dayFlow.drawings;

  // Session-aware "already banked": the live ledger refetch lags a
  // just-completed deposit, so track this session's deposits locally.
  // `baseBanked` is the ledger figure at first load; the effective value
  // is base + session (floored by the live figure so deposits made on
  // another device while this modal is open are never lost). Without
  // this, two quick same-day bankings used a stale already-banked value —
  // allowing over-banking past the real till and persisting an
  // under-counted deposit_amount snapshot.
  const [sessionBanked, setSessionBanked] = useState(0);
  const baseBankedRef = useRef<number | null>(null);
  useEffect(() => {
    if (baseBankedRef.current === null && !bfLoading && liveLedger) {
      baseBankedRef.current = liveLedger.day.banked;
    }
  }, [liveLedger, bfLoading]);
  const liveBanked = dayFlow.banked;
  const baseBanked = baseBankedRef.current ?? liveBanked;
  // Already-banked accounting is session-aware (see effectiveBankedToday):
  // the live ledger refetch lags a just-completed deposit, so the modal
  // base + session value is used, floored by the live figure.
  const alreadyBankedToday = effectiveBankedToday(
    liveBanked,
    baseBanked,
    sessionBanked
  );

  const netCashFlow = openingBalance + cashSales - cashExpenses - drawings;
  const currentTillCash = netCashFlow - alreadyBankedToday;

  // Only editable inputs — the new deposit being captured now.
  // Balancing deposits are ALWAYS recorded for today: a back-dated
  // deposit would retroactively shrink today's (frozen) b/f source and
  // reintroduce the fluctuation this modal exists to eliminate.
  // Date corrections belong in the bank-entry editor, not here.
  const [depositAmount, setDepositAmount] = useState(0);
  const [bankName, setBankName] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  // Physical cash counted in the till — stored SEPARATELY from the
  // Calculated c/d. Blank = not counted (audit-safe default).
  const [physicalCashCount, setPhysicalCashCount] = useState<string>("");

  // Most-recently-used Bank/Account auto-select. Fires once when the
  // MRU query first resolves so the user isn't overridden if they type.
  // Fresh deposits invalidate the MRU cache so a newly-added account
  // becomes the default the next time the modal opens.
  const mruAppliedRef = useRef(false);
  useEffect(() => {
    if (!mruAppliedRef.current && mruBank) {
      setBankName(mruBank);
      mruAppliedRef.current = true;
    }
  }, [mruBank]);

  // Calculated Balance c/d — leftover cash AFTER this new deposit is
  // banked. This is the SOLE authoritative source of the next business
  // day's b/f (per the accounting requirement:
  //   "Next Day B/F = Previous Day Final C/D").
  // Balancing deposits are always dated today (see above), so every
  // deposit in this modal reduces today's till exactly once.
  const closingBalance = currentTillCash - depositAmount;

  // Physical count + Variance stay separate from Calculated c/d.
  const physical =
    physicalCashCount.trim() === "" ? null : Number(physicalCashCount);
  const variance =
    physical !== null && Number.isFinite(physical)
      ? physical - closingBalance
      : null;

  // Green success ribbon shown after each Complete Balancing
  const [lastCompleted, setLastCompleted] = useState<{
    cd: number; at: string; banked: number;
  } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bfReady) return toast.error("Still loading today's figures — try again in a moment");
    if (depositAmount < 0) return toast.error("Amount cannot be negative");
    if (depositAmount > currentTillCash + 0.01) {
      return toast.error(
        `Cannot deposit more than current till (${formatCurrency(currentTillCash, currency)})`
      );
    }
    try {
      let depositId: string | null = null;
      if (depositAmount > 0) {
        const deposit = await create.mutateAsync({
          amount: depositAmount,
          bankName: bankName || null,
          reference: reference || null,
          notes:
            notes ||
            `Daily balancing · b/f ${formatCurrency(openingBalance, currency)} · Drawings ${formatCurrency(drawings, currency)}`,
          depositedAt: today,
          actor,
        });
        depositId = deposit.id;
        // Account for this deposit immediately so a second same-day
        // banking in this session validates against the true till even
        // before the ledger refetch lands.
        setSessionBanked((s) => s + depositAmount);
      }

      // The snapshot's opening_balance is the FROZEN b/f, and the
      // deposit total is cumulative for the day, so re-balancing after
      // later transactions only ever extends the chain — it can never
      // rewrite it. Physical count and variance are stored SEPARATELY —
      // they never affect the calculated b/f → c/d chain.
      const totalBanked = alreadyBankedToday + depositAmount;
      await persistBalancing.mutateAsync({
        balanceDate: today,
        openingBalance,
        cashSales,
        cashExpenses,
        drawings,
        netCashFlow,
        depositAmount: totalBanked,
        closingBalance,
        physicalCashCount: physical,
        variance,
        bankDepositId: depositId,
        notes: notes || null,
        actor,
      });

      // Converge the live ledger + today's deposit list immediately so
      // the summary below reflects the just-completed banking without
      // waiting for the background poll.
      await Promise.all([
        qc.refetchQueries({ queryKey: ["live_opening_balance"] }),
        qc.refetchQueries({ queryKey: ["bank_deposits"] }),
      ]);

      toast.success(
        `Balancing recorded · Balance c/d ${formatCurrency(closingBalance, currency)}`
      );

      setLastCompleted({
        cd: closingBalance,
        at: new Date().toISOString(),
        banked: depositAmount,
      });

      // Reset ONLY the deposit form fields so intraday re-balancing works
      // seamlessly. `bankName` is preserved for the session because it is
      // already the MRU choice — the user shouldn't have to re-pick it
      // for a second same-day deposit. Physical count is reset because
      // each count is a snapshot-in-time.
      setDepositAmount(0);
      setReference("");
      setNotes("");
      setPhysicalCashCount("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  const saving = create.isPending || persistBalancing.isPending;

  return (
    <div className="balancing-sheet fixed inset-0 z-50 bg-ink/50 flex items-end md:items-center justify-center p-0 md:p-4 animate-fade-in">
      <div className="balancing-card paper-card w-full max-w-2xl overflow-hidden max-h-[95dvh] flex flex-col">
        <div className="p-2.5 md:p-4 border-b flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <div className="td-kicker truncate">
              End-of-day cashout · {formatDate(today)}
            </div>
            <h2 className="td-title">Daily Balancing &amp; Banking</h2>
          </div>
          <button onClick={onClose} className="btn btn-outline btn-sm h-7 w-7 md:h-9 md:w-9 p-0 shrink-0">
            <X className="w-3.5 h-3.5 md:w-4 md:h-4" />
          </button>
        </div>

        <form onSubmit={submit} className="overflow-auto scroll-lined p-2 md:p-3 space-y-1.5 md:space-y-2.5">
          {lastCompleted && (
            <div className="paper-card td-card !p-2 md:!p-3 bg-success/10 border border-success/30 flex items-start gap-2 md:gap-3">
              <CheckCircle2 className="w-5 h-5 text-success shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="td-body font-semibold text-success">Balancing recorded</div>
                <div className="text-[9px] md:text-[10px] text-ink-soft mt-0.5">
                  {formatDateTime(lastCompleted.at)}
                  {lastCompleted.banked > 0 && ` · banked ${formatCurrency(lastCompleted.banked, currency)}`}
                  {" · new Balance c/d "}
                  <span className="font-semibold text-ink">
                    {formatCurrency(lastCompleted.cd, currency)}
                  </span>
                </div>
                <div className="td-hint mt-1 hidden md:block">
                  If more transactions come in you can bank again below —
                  the summary refreshes automatically. No need to wait for
                  a new day.
                </div>
              </div>
            </div>
          )}

          {/* Cash Flow Summary — ALL rows read-only, auto-derived */}
          <div className="paper-card td-card !p-2 md:!p-3">
            <div className="td-flow-kicker mb-1.5 md:mb-2.5 flex items-center gap-1.5 md:gap-2">
              <Banknote className="w-3.5 h-3.5 md:w-4 md:h-4" /> Cash Flow Summary
            </div>
            <div className="space-y-0.5 md:space-y-1">
              <ReadOnlyFlowRow
                label={`Balance b/f${!bfReady ? " (loading…)" : " (frozen for this session)"}`}
                value={openingBalance}
                loading={!bfReady}
                currency={currency}
              />
              <ReadOnlyFlowRow
                label="+ Cash Sales (today)"
                value={cashSales}
                currency={currency}
                positive
              />
              <ReadOnlyFlowRow
                label="− Cash Expenses (today)"
                value={cashExpenses}
                currency={currency}
                negative
              />
              <ReadOnlyFlowRow
                label="− Drawings (auto ← ledger)"
                value={drawings}
                currency={currency}
                negative
              />
              <div className="border-t pt-1 mt-1">
                <ReadOnlyFlowRow
                  label="= Net Cash Flow"
                  value={netCashFlow}
                  currency={currency}
                  bold
                />
              </div>
              {alreadyBankedToday > 0 && (
                <>
                  <ReadOnlyFlowRow
                    label="− Already Banked Today"
                    value={alreadyBankedToday}
                    currency={currency}
                    negative
                  />
                  <div className="border-t pt-1 mt-1">
                    <ReadOnlyFlowRow
                      label="= Current cash in till"
                      value={currentTillCash}
                      currency={currency}
                      bold
                    />
                  </div>
                </>
              )}
            </div>
            <div className="td-flow-hint mt-2 md:mt-3 pt-1.5 md:pt-2 border-t hidden md:flex items-start gap-1.5">
              <Info className="w-3 h-3 shrink-0 mt-0.5" />
              <span>
                Balance b/f is LIVE-DERIVED from the full cash ledger
                (payments, cash expenses, drawings and banking). It never
                reads a stored snapshot, so late settlements and back-dated
                entries propagate automatically and repeated same-day
                balancing cannot move it.
              </span>
            </div>
          </div>

          {todayDeposits.length > 0 && (
            <div className="paper-card td-card !p-2 md:!p-3">
              <div className="td-kicker mb-1 md:mb-1.5 flex items-center gap-1.5 md:gap-2">
                <Landmark className="w-3.5 h-3.5 md:w-4 md:h-4" />
                Banked today · {todayDeposits.length}{" "}
                {todayDeposits.length === 1 ? "entry" : "entries"}
              </div>
              <div className="space-y-1">
                {todayDeposits.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between gap-2 text-[10px] md:text-xs border-t first:border-t-0 pt-1 first:pt-0"
                  >
                    <span className="truncate">
                      <span className="font-semibold num">
                        {formatCurrency(d.amount, currency)}
                      </span>
                      {d.bankName ? ` · ${d.bankName}` : ""}
                      {d.reference ? ` · ${d.reference}` : ""}
                    </span>
                    <span className="text-ink-mute shrink-0">
                      {d.createdByName || ""}
                    </span>
                  </div>
                ))}
              </div>
              <div className="td-hint mt-1.5">
                Total banked today {formatCurrency(alreadyBankedToday, currency)}.
                You can bank again after more transactions — each deposit is
                a separate ledger entry.
              </div>
            </div>
          )}

          {/* Bank Deposit — the ONLY editable section. The calculated c/d and
              the physical count sit at the foot of the same card so the whole
              till position reads as one block. */}
          <div className="paper-card td-card !p-2 md:!p-3">
            <div className="td-kicker mb-1.5 md:mb-2 flex items-center gap-1.5 md:gap-2">
              <Landmark className="w-3.5 h-3.5 md:w-4 md:h-4" /> Cash Deposit to Bank
            </div>
            <div className="space-y-1.5 md:space-y-2">
              <div className="grid grid-cols-2 gap-1.5 md:gap-3">
                <div>
                  <label htmlFor="fs-deposit-ref" className="td-label">Reference / Slip #</label>
                  <input
                    id="fs-deposit-ref"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    className="input input-sm mt-0.5 num"
                    placeholder="Slip #"
                  />
                </div>
                <div>
                  <span className="td-label">Date (today)</span>
                  <div className="input input-sm mt-0.5 num flex items-center pointer-events-none truncate">
                    {formatDate(today)}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-1.5 md:gap-3">
                <div>
                  <label htmlFor="fs-deposit-amount" className="td-label">Amount ({currency})</label>
                  <input
                    id="fs-deposit-amount"
                    type="number"
                    min={0}
                    max={Math.max(0, currentTillCash)}
                    step="0.01"
                    value={depositAmount || ""}
                    onChange={(e) => setDepositAmount(Number(e.target.value) || 0)}
                    placeholder="0"
                    className="input input-sm mt-0.5 num text-right"
                  />
                </div>
                <div>
                  <label htmlFor="fs-deposit-bank" className="td-label">
                    Bank / Account
                    {mruBank && (
                      <span className="td-hint hidden md:inline font-normal ml-1 normal-case tracking-normal">
                        — most-recently used auto-selected
                      </span>
                    )}
                  </label>
                  <input
                    id="fs-deposit-bank"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    className="input input-sm mt-0.5"
                    placeholder="Stanbic Business ##3456"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="fs-deposit-notes" className="td-label">Notes</label>
                <textarea
                  id="fs-deposit-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="input input-sm mt-0.5 min-h-10 md:min-h-14"
                  placeholder="Optional"
                />
              </div>
            </div>

            {/* Calculated Balance c/d — read-only, promoted but compact */}
            <div className={cn(
              "mt-1.5 md:mt-2 rounded-md border px-2 md:px-3 py-1.5 md:py-2",
              closingBalance >= 0 ? "bg-magenta-reg/5 border-magenta-reg/30" : "bg-danger/5 border-danger/30"
            )}>
              <div className="td-kicker">
                Calculated Balance c/d · leftover cash (carries to tomorrow's b/f)
              </div>
              <div className={cn(
                "td-value num mt-0.5 break-words",
                "text-lg md:text-3xl",
                closingBalance >= 0 ? "text-ink" : "text-danger"
              )}>
                <MoneyText value={formatCurrency(closingBalance, currency)} />
              </div>
              <div className="td-hint mt-0.5">
                = Current till {formatCurrency(currentTillCash, currency)}
                {depositAmount > 0 && ` - new deposit ${formatCurrency(depositAmount, currency)}`}
              </div>
            </div>

            {/* Physical count + variance — read-only variance, optional count */}
            <div className="mt-1.5 md:mt-2 pt-1.5 md:pt-2 border-t">
              <div className="td-kicker mb-1 md:mb-1.5 flex items-center gap-1.5 md:gap-2">
                <Scale className="w-3.5 h-3.5 md:w-4 md:h-4" /> Physical Cash Count &amp; Variance (optional)
              </div>
              <div className="grid grid-cols-2 gap-1.5 md:gap-3">
                <div>
                  <label htmlFor="fs-physical-count" className="td-label">Physical count in till ({currency})</label>
                  <input
                    id="fs-physical-count"
                    type="number"
                    min={0}
                    step="0.01"
                    value={physicalCashCount}
                    onChange={(e) => setPhysicalCashCount(e.target.value)}
                    placeholder="Leave blank to skip"
                    className="input input-sm mt-0.5 num text-right"
                  />
                </div>
                <div>
                  <span className="td-label">Variance vs Calculated c/d</span>
                  <div className={cn(
                    "input input-sm mt-0.5 num text-right tabular-nums flex items-center justify-end pointer-events-none",
                    variance === null && "text-ink-mute",
                    variance !== null && variance > 0 && "text-success",
                    variance !== null && variance < 0 && "text-danger",
                  )}>
                    {variance === null ? "—" : formatCurrency(variance, currency)}
                  </div>
                </div>
              </div>
              <div className="td-hint mt-1 md:mt-1.5 hidden md:block">
                Recorded SEPARATELY from the Calculated c/d for audit purposes.
                Positive variance = surplus cash in till; negative = shortage.
                Both are persisted in the balancing snapshot without altering
                the b/f → c/d accounting chain.
              </div>
            </div>

            <div className="td-hint mt-1.5 md:mt-2 hidden md:flex items-start gap-1.5">
              <Info className="w-3 h-3 shrink-0 mt-0.5" />
              <span>
                Banking is strictly a Till → Bank transfer — NOT a sale,
                income or expense. A single entry reduces the Cashbook by
                the banked amount and increases the Bank Statement by the
                same, in one audit-tracked movement (never duplicated).
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-1.5 md:gap-2 pt-1.5 md:pt-2 border-t">
            <button type="button" onClick={onClose} className="btn btn-outline btn-sm">
              Close
            </button>
            <button
              type="submit"
              disabled={saving || !bfReady}
              className="btn btn-primary btn-sm"
            >
              <ArrowUpRight className="w-3.5 h-3.5 md:w-4 md:h-4" />
              {saving ? "Saving..." : "Complete Balancing"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Compact read-only row used inside the Cash Flow Summary card. NO
 *  input boxes, borders or editable controls — the value is a derived
 *  ledger figure displayed as plain text with contextual coloring. */
function ReadOnlyFlowRow({ label, value, currency, positive, negative, bold, loading }: {
  label: string; value: number; currency: string;
  positive?: boolean; negative?: boolean; bold?: boolean; loading?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span className={cn("text-ink-soft td-flow-body", bold && "font-bold text-ink")}>
        {label}
      </span>
      <span className={cn(
        "num tabular-nums",
        bold ? "td-flow-value font-bold text-ink" : "td-flow-body font-semibold",
        !bold && positive && "text-success",
        !bold && negative && "text-danger"
      )}>
        {loading ? "…" : <MoneyText value={formatCurrency(value, currency)} />}
      </span>
    </div>
  );
}

function StandingOrderModal({ order, currency, onClose, createdBy }: {
  order: StandingOrder | null; currency: string; onClose: () => void; createdBy: string | null;
}) {
  const upsert = useUpsertStandingOrder();
  const [form, setForm] = useState({
    kind: (order?.kind || "standing") as StandingOrderKind,
    name: order?.name || "", payee: order?.payee || "", amount: order?.amount || 0,
    frequency: (order?.frequency || "monthly") as StandingOrderFrequency,
    nextRunDate: order?.nextRunDate || todayISO(),
    account: order?.account || "", category: order?.category || "General",
    active: order?.active !== false,
    loanPrincipal: order?.loanPrincipal || 0, loanBalance: order?.loanBalance || 0,
    loanRate: order?.loanRate || 0, loanTermMonths: order?.loanTermMonths || 12,
    notes: order?.notes || "",
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Name required");
    if (form.amount <= 0) return toast.error("Amount must be > 0");
    try {
      await upsert.mutateAsync({
        id: order?.id, kind: form.kind, name: form.name.trim(),
        payee: form.payee.trim() || null, amount: form.amount, currency,
        frequency: form.frequency, nextRunDate: form.nextRunDate,
        account: form.account.trim() || null, category: form.category.trim() || "General",
        active: form.active,
        loanPrincipal: form.kind === "loan" ? form.loanPrincipal : null,
        loanBalance: form.kind === "loan" ? form.loanBalance : null,
        loanRate: form.kind === "loan" ? form.loanRate : null,
        loanTermMonths: form.kind === "loan" ? form.loanTermMonths : null,
        notes: form.notes.trim() || null, createdBy,
      });
      toast.success(order ? "Updated" : "Created");
      onClose();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink/50 flex items-center justify-center p-2 md:p-4 animate-fade-in">
      <div className="paper-card w-full max-w-lg overflow-hidden max-h-[95dvh] flex flex-col">
        <div className="p-2.5 md:p-4 border-b flex items-center justify-between shrink-0">
          <div>
            <div className="td-kicker">{order ? "Edit" : "New"}</div>
            <h2 className="td-title">{form.kind === "loan" ? "Loan payment" : "Standing order"}</h2>
          </div>
          <button onClick={onClose} className="btn btn-ghost h-7 w-7 md:h-9 md:w-9 p-0"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={submit} className="p-2.5 md:p-4 space-y-2 md:space-y-3 overflow-auto scroll-lined">
          <div className="grid grid-cols-2 gap-2">
            {(["standing", "loan"] as StandingOrderKind[]).map((k) => (
              <button key={k} type="button" onClick={() => setForm({ ...form, kind: k })} className={cn("td-card rounded-md border text-left transition", form.kind === k ? "border-ink bg-ink text-paper" : "border-line hover:border-ink")}>
                {k === "loan" ? <ArrowDownRight className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
                <div className="td-body font-semibold mt-0.5 md:mt-1">{k === "loan" ? "Loan payment" : "Standing order"}</div>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label htmlFor="fs-order-name" className="td-label">Name</label>
              <input id="fs-order-name" required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input input-sm mt-1" placeholder={form.kind === "loan" ? "Business loan" : "Office rent"} />
            </div>
            <div>
              <label htmlFor="fs-order-payee" className="td-label">Payee</label>
              <input id="fs-order-payee" value={form.payee} onChange={(e) => setForm({ ...form, payee: e.target.value })} className="input input-sm mt-1" placeholder="Bank / landlord / vendor" />
            </div>
            <div>
              <label htmlFor="fs-order-account" className="td-label">Account / ref</label>
              <input id="fs-order-account" value={form.account} onChange={(e) => setForm({ ...form, account: e.target.value })} className="input input-sm mt-1 num" />
            </div>
            <div>
              <label htmlFor="fs-order-amount" className="td-label">Amount ({currency})</label>
              <input id="fs-order-amount" type="number" min={0} step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} className="input input-sm mt-1 num text-right" />
            </div>
            <div>
              <label htmlFor="fs-order-frequency" className="td-label">Frequency</label>
              <GlassSelect
                id="fs-order-frequency"
                value={form.frequency}
                onChange={(v) => setForm({ ...form, frequency: v as StandingOrderFrequency })}
                ariaLabel="Frequency"
                options={[
                  { value: "weekly", label: "Weekly" },
                  { value: "biweekly", label: "Bi-weekly" },
                  { value: "monthly", label: "Monthly" },
                  { value: "quarterly", label: "Quarterly" },
                  { value: "yearly", label: "Yearly" },
                ]}
                className="input input-sm select-glass mt-1"
              />
            </div>
            <div>
              <label htmlFor="fs-order-next" className="td-label">Next payment</label>
              <GlassDatePicker
                id="fs-order-next"
                value={form.nextRunDate}
                onChange={(v) => setForm({ ...form, nextRunDate: v })}
                ariaLabel="Next payment date"
                className="input input-sm select-glass mt-1"
              />
            </div>
            <div>
              <label htmlFor="fs-order-category" className="td-label">Category</label>
              <input id="fs-order-category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="input input-sm mt-1" />
            </div>
          </div>
          {form.kind === "loan" && (
            <div className="grid grid-cols-2 gap-3 border-t pt-3">
              <div><label htmlFor="fs-loan-principal" className="td-label">Loan principal</label><input id="fs-loan-principal" type="number" min={0} step="0.01" value={form.loanPrincipal} onChange={(e) => setForm({ ...form, loanPrincipal: Number(e.target.value) })} className="input input-sm mt-1 num text-right" /></div>
              <div><label htmlFor="fs-loan-balance" className="td-label">Current balance</label><input id="fs-loan-balance" type="number" min={0} step="0.01" value={form.loanBalance} onChange={(e) => setForm({ ...form, loanBalance: Number(e.target.value) })} className="input input-sm mt-1 num text-right" /></div>
              <div><label htmlFor="fs-loan-rate" className="td-label">Interest rate (% APR)</label><input id="fs-loan-rate" type="number" min={0} step="0.01" value={form.loanRate} onChange={(e) => setForm({ ...form, loanRate: Number(e.target.value) })} className="input input-sm mt-1 num text-right" /></div>
              <div><label htmlFor="fs-loan-term" className="td-label">Term (months)</label><input id="fs-loan-term" type="number" min={0} step="1" value={form.loanTermMonths} onChange={(e) => setForm({ ...form, loanTermMonths: Number(e.target.value) })} className="input input-sm mt-1 num text-right" /></div>
            </div>
          )}
          <div>
            <label htmlFor="fs-order-notes" className="td-label">Notes</label>
            <textarea id="fs-order-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input input-sm mt-1 min-h-12 md:min-h-16" />
          </div>
          <label className="td-body inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            Active
          </label>
          <div className="flex justify-end gap-1.5 md:gap-2 pt-1.5 md:pt-2 border-t">
            <button type="button" onClick={onClose} className="btn btn-outline btn-sm">Cancel</button>
            <button type="submit" disabled={upsert.isPending} className="btn btn-primary btn-sm">
              <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" />
              {upsert.isPending ? "Saving..." : order ? "Save" : "Add"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}