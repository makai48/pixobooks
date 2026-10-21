import { useMemo, useState, useEffect } from "react";
import {
  BookOpen,
  Plus,
  X,
  Users,
  ClipboardList,
  Calendar,
  FileText,
  Wallet,
  ChevronLeft,
  ChevronRight,
  Check,
  Ban,
  Printer,
  Edit3,
  Trash2,
  AlertCircle,
  Building2,
  CheckCircle2,
  ExternalLink,
  Receipt,
  Landmark,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useShopSettings } from "@/hooks/useShopSettings";
import { useSales } from "@/hooks/useSales";
import { useSuppliers } from "@/hooks/useSuppliers";
import {
  useClientAccounts,
  useUpsertClientAccount,
  useDeleteClientAccount,
  useClientServices,
  useUpsertClientService,
  useDeleteClientService,
  useClientWorkEntries,
  useUpsertClientWorkEntry,
  useValidateClientWorkEntry,
  useDeleteClientWorkEntry,
  useClientBillingPeriods,
  useClientInvoices,
  useGenerateMonthlyInvoice,
  useGenerateMonthlyInvoicesNow,
  useGenerateOutstandingInvoice,
  useCancelClientInvoice,
  useClientInvoicePayments,
  useRecordClientPayment,
  useCancelClientInvoicePayment,
} from "@/hooks/useClients";
import type { GenerateMonthlyInvoicesNowResult } from "@/hooks/useClients";
import { useItems } from "@/hooks/useItems";
import PhoneInput from "@/components/common/PhoneInput";
import {
  cn,
  formatCurrency,
  formatDate,
  todayISO,
  localISODate,
  download,
} from "@/lib/utils";
import type {
  ClientAccount,
  ClientService,
  ClientStaff,
  ClientWorkEntry,
  ClientInvoice,
  ClientInvoicePayment,
  ClientBillingPeriod,
  ClientInvoiceMode,
  PaymentMethod,
} from "@/types";
import type { LucideIcon } from "lucide-react";
import { CLIENT_INVOICE_STATUS_META, amountInWords } from "@/types";
import ImportClientBillingModal from "@/components/features/clientbilling/ClientBillingImportModal";
import {
  CLIENT_BILLING_CRON_MIGRATION_FILE,
  CLIENT_BILLING_MIGRATION_FILE,
  hasMissingBillingTables,
  isMissingBillingTable,
} from "@/lib/clientBillingSchema";

type Tab = "overview" | "clients" | "work" | "periods" | "invoices" | "payments" | "debtors" | "reports";
type Range = "day" | "week" | "month" | "year" | "custom";

export default function ClientBilling() {
  const { profile, can } = useAuth();
  const { data: settings } = useShopSettings();
  const currency = settings?.currency || "USD";
  const canManage = can("finance.manage") || profile?.role?.toLowerCase() === "owner";
  const canView = can("finance.view") || canManage;

  const actor = profile
    ? { id: profile.id, name: profile.name, role: profile.role }
    : undefined;

  const [tab, setTab] = useState<Tab>("overview");
  const [range, setRange] = useState<Range>("month");
  const [anchor, setAnchor] = useState<string>(todayISO());
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [clientFilter, setClientFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [clientModal, setClientModal] = useState<ClientAccount | null | "new">(null);
  const [workModal, setWorkModal] = useState<
    { entry?: ClientWorkEntry; clientId?: string } | null
  >(null);
  const [importOpen, setImportOpen] = useState(false);
  const [invoiceModal, setInvoiceModal] = useState<ClientInvoice | null>(null);
  const [paymentModal, setPaymentModal] = useState<ClientInvoice | null>(null);
  const [outstandingModal, setOutstandingModal] = useState<ClientInvoice | null>(null);
  const [generateModal, setGenerateModal] = useState<{
    client: ClientAccount;
    period: string;
  } | null>(null);
  const [generateNowOpen, setGenerateNowOpen] = useState(false);
  const [servicesFor, setServicesFor] = useState<ClientAccount | null>(null);
  const [detailFor, setDetailFor] = useState<ClientAccount | null>(null);

  const { from, to } = useMemo(() => resolveRange(range, anchor, customFrom, customTo), [
    range,
    anchor,
    customFrom,
    customTo,
  ]);

  const { data: clients = [], error: clientsError } = useClientAccounts();
  const { data: workEntries = [], error: workEntriesError } = useClientWorkEntries({
    clientId: clientFilter || undefined,
    from,
    to,
  });
  const { data: periods = [], error: periodsError } = useClientBillingPeriods(
    clientFilter || undefined
  );
  const { data: invoices = [], error: invoicesError } = useClientInvoices({
    clientId: clientFilter || undefined,
  });
  const { data: payments = [], error: paymentsError } = useClientInvoicePayments({
    clientId: clientFilter || undefined,
    from,
    to,
  });
  const billingSchemaMissing = hasMissingBillingTables([
    clientsError,
    workEntriesError,
    periodsError,
    invoicesError,
    paymentsError,
  ]);

  const billingQueryError = billingSchemaMissing
    ? null
    : [clientsError, workEntriesError, periodsError, invoicesError, paymentsError].find(
        (err) => err && !isMissingBillingTable(err)
      );

  const active = invoices.filter((i) => i.status !== "cancelled");
  const totalReceivable = active.reduce((s, i) => s + i.amountDue, 0);
  const today = todayISO();
  const overdue = active.reduce(
    (s, i) => (i.dueDate && i.dueDate < today && i.amountDue > 0 ? s + i.amountDue : s),
    0
  );
  const paidTotal = active.reduce((s, i) => s + i.amountPaid, 0);
  const billedTotal = active.reduce((s, i) => s + i.total, 0);

  const filteredInvoices =
    statusFilter === "all"
      ? invoices
      : invoices.filter((i) => i.status === statusFilter);

  if (!canView) {
    return (
      <div className="p-6 text-center text-ink-mute text-sm">
        You do not have permission to view Client Billing.
      </div>
    );
  }

  const TABS: { k: Tab; label: string; icon: LucideIcon; badge?: number }[] = [
    { k: "overview", label: "Overview", icon: BookOpen },
    { k: "clients", label: "Clients", icon: Users, badge: clients.length },
    { k: "work", label: "Daily Work", icon: ClipboardList, badge: workEntries.filter((w) => w.status === "unbilled").length },
    { k: "periods", label: "Billing Periods", icon: Calendar },
    { k: "invoices", label: "Invoices", icon: FileText, badge: filteredInvoices.length },
    { k: "payments", label: "Payments", icon: Wallet },
    { k: "debtors", label: "Debtors & Creditors", icon: Landmark },
    { k: "reports", label: "Reports", icon: Receipt },
  ];

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="paper-card p-4 flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-magenta-reg" />
          <div>
            <div className="text-[11px] uppercase tracking-widest text-ink-mute">
              Business billing workflow
            </div>
            <h1 className="font-display text-lg font-bold">Client Billing</h1>
          </div>
        </div>
        <div className="flex-1" />
        <RangeBar
          range={range}
          setRange={setRange}
          anchor={anchor}
          setAnchor={setAnchor}
          customFrom={customFrom}
          setCustomFrom={setCustomFrom}
          customTo={customTo}
          setCustomTo={setCustomTo}
        />
      </div>

      {billingSchemaMissing && (
        <div className="paper-card p-4 flex items-start gap-3 border-l-4 border-l-amber-500">
          <AlertCircle className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
          <div className="text-sm">
            <div className="font-semibold">Client billing tables are not installed.</div>
            <p className="text-ink-mute mt-1">
              This database has no <code>client_*</code> tables, so billing data cannot load.
              Apply <code>{CLIENT_BILLING_MIGRATION_FILE}</code> in the Supabase SQL editor, then{" "}
              <code>{CLIENT_BILLING_CRON_MIGRATION_FILE}</code> if you want monthly invoices
              generated automatically, and reload this page.
            </p>
          </div>
        </div>
      )}

      {billingQueryError && (
        <div className="paper-card p-4 flex items-start gap-3 border-l-4 border-l-danger">
          <AlertCircle className="w-5 h-5 shrink-0 text-danger mt-0.5" />
          <div className="text-sm">
            <div className="font-semibold">Client billing data could not load.</div>
            <p className="text-ink-mute mt-1">{describeError(billingQueryError)}</p>
            <p className="text-ink-mute mt-1">
              If this mentions "permission denied", run the GRANT statements from{" "}
              <code>{CLIENT_BILLING_MIGRATION_FILE}</code> in the Supabase SQL editor.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Outstanding AR" value={formatCurrency(totalReceivable, currency)} tone={totalReceivable > 0 ? "success" : undefined} />
        <Kpi label="Overdue" value={formatCurrency(overdue, currency)} tone={overdue > 0 ? "danger" : undefined} />
        <Kpi label="Billed" value={formatCurrency(billedTotal, currency)} />
        <Kpi label="Paid" value={formatCurrency(paidTotal, currency)} tone="success" />
      </div>

      <div className="paper-card overflow-hidden">
        <div className="border-b flex overflow-x-auto scrollbar-none">
          {TABS.map(({ k, label, icon: Icon, badge }) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={cn(
                "px-4 h-11 flex items-center gap-2 text-xs font-semibold border-b-2 transition whitespace-nowrap",
                tab === k
                  ? "border-magenta-reg text-magenta-reg"
                  : "border-transparent text-ink-mute hover:text-ink"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
              {badge != null && badge > 0 ? (
                <span className="chip bg-ink/10 text-ink text-[10px] px-1.5">{badge}</span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="p-4">
          {(tab === "clients" || tab === "work" || tab === "invoices" || tab === "payments" || tab === "periods") && (
            <div className="flex flex-wrap gap-2 mb-3 items-center">
              <div className="flex-1 min-w-[160px]">
                <select
                  value={clientFilter}
                  onChange={(e) => setClientFilter(e.target.value)}
                  className="input h-8 w-full text-xs"
                >
                  <option value="">All clients</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              {tab === "invoices" && (
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="input h-8 text-xs w-32"
                >
                  <option value="all">All statuses</option>
                  <option value="unpaid">Unpaid</option>
                  <option value="partial">Partially Paid</option>
                  <option value="paid">Paid</option>
                  <option value="overdue">Overdue</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              )}
              {canManage && tab === "invoices" && (
                <button
                  onClick={() => setGenerateNowOpen(true)}
                  className="btn btn-primary h-8 text-xs"
                >
                  <Calendar className="w-3.5 h-3.5" /> Generate monthly now
                </button>
              )}
              {canManage && tab === "clients" && (
                <>
                  <button onClick={() => setClientModal("new")} className="btn btn-primary h-8 text-xs">
                    <Plus className="w-3.5 h-3.5" /> New client
                  </button>
                  <button
                    onClick={() => setImportOpen(true)}
                    className="btn btn-outline h-8 text-xs"
                  >
                    <Download className="w-3.5 h-3.5" /> Import
                  </button>
                </>
              )}
              {canManage && tab === "work" && (
                <button
                  onClick={() => setWorkModal({ clientId: clientFilter || undefined })}
                  className="btn btn-primary h-8 text-xs"
                  disabled={clients.length === 0}
                >
                  <Plus className="w-3.5 h-3.5" /> Record work
                </button>
              )}
            </div>
          )}

          {tab === "overview" && (
            <OverviewTab
              invoices={invoices}
              payments={payments}
              clients={clients}
              currency={currency}
              onOpenInvoice={setInvoiceModal}
              onRecordPayment={setPaymentModal}
            />
          )}
          {tab === "clients" && (
            <ClientsTab
              clients={clients.filter((c) => (clientFilter ? c.id === clientFilter : true))}
              invoices={invoices}
              currency={currency}
              canManage={canManage}
              onEdit={setClientModal}
              onServices={setServicesFor}
              onDetail={setDetailFor}
            />
          )}
          {tab === "work" && (
            <WorkTab
              entries={workEntries}
              currency={currency}
              canManage={canManage}
              actor={actor}
              onEdit={(entry) => setWorkModal({ entry })}
            />
          )}
          {tab === "periods" && (
            <PeriodsTab
              periods={periods}
              workEntries={workEntries}
              clients={clients}
              clientFilter={clientFilter}
              currency={currency}
              canManage={canManage}
              onGenerate={setGenerateModal}
              onPreview={setGenerateModal}
            />
          )}
          {tab === "invoices" && (
            <InvoicesTab
              invoices={filteredInvoices}
              currency={currency}
              canManage={canManage}
              onView={setInvoiceModal}
              onPay={setPaymentModal}
              onOutstanding={setOutstandingModal}
            />
          )}
          {tab === "payments" && (
            <PaymentsTab
              payments={payments}
              invoices={invoices}
              currency={currency}
              canManage={canManage}
              actor={actor}
            />
          )}
          {tab === "debtors" && (
            <DebtorsTab invoices={invoices} currency={currency} />
          )}
          {tab === "reports" && (
            <ReportsTab
              workEntries={workEntries}
              invoices={invoices}
              payments={payments}
              clients={clients}
              currency={currency}
              range={{ from, to }}
            />
          )}
        </div>
      </div>

      {/* Modals */}
      {clientModal !== null && (
        <ClientModal
          client={clientModal === "new" ? null : clientModal}
          onClose={() => setClientModal(null)}
          actor={actor}
        />
      )}
      {workModal !== null && (
        <WorkEntryModal
          entry={workModal.entry}
          initialClientId={workModal.clientId}
          clients={clients}
          currency={currency}
          onClose={() => setWorkModal(null)}
          actor={actor}
        />
      )}
      {generateModal && (
        <GenerateInvoiceModal
          client={generateModal.client}
          period={generateModal.period}
          entries={workEntries.filter(
            (w) =>
              w.clientId === generateModal.client.id &&
              w.billingPeriod === generateModal.period &&
              w.status === "unbilled"
          )}
          currency={currency}
          onClose={() => setGenerateModal(null)}
          actor={actor}
        />
      )}
      {generateNowOpen && (
        <GenerateMonthlyNowModal
          currency={currency}
          onClose={() => setGenerateNowOpen(false)}
        />
      )}
      {invoiceModal && (
        <InvoiceViewModal
          invoice={invoiceModal}
          currency={currency}
          canManage={canManage}
          onClose={() => setInvoiceModal(null)}
          onPay={() => {
            setPaymentModal(invoiceModal);
            setInvoiceModal(null);
          }}
          onOutstanding={() => {
            setOutstandingModal(invoiceModal);
            setInvoiceModal(null);
          }}
          actor={actor}
        />
      )}
      {paymentModal && (
        <PaymentModal
          invoice={paymentModal}
          currency={currency}
          onClose={() => setPaymentModal(null)}
          actor={actor}
        />
      )}
      {outstandingModal && (
        <OutstandingInvoiceModal
          parent={outstandingModal}
          currency={currency}
          onClose={() => setOutstandingModal(null)}
          actor={actor}
        />
      )}
      {servicesFor && (
        <ServicesModal
          client={servicesFor}
          currency={currency}
          onClose={() => setServicesFor(null)}
        />
      )}
      {detailFor && (
        <ClientDetailModal
          client={detailFor}
          currency={currency}
          onClose={() => setDetailFor(null)}
          onOpenInvoice={(inv) => {
            setInvoiceModal(inv);
            setDetailFor(null);
          }}
        />
      )}
      {importOpen && (
        <ImportClientBillingModal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          actor={
            profile
              ? { id: profile.id, name: profile.name, role: profile.role }
              : undefined
          }
        />
      )}
    </div>
  );
}

/* ============================================================
 * SHARED HELPERS
 * ============================================================ */

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const e = err as { message?: unknown; details?: unknown; hint?: unknown };
    const text = [e.message, e.details, e.hint]
      .filter((v): v is string => typeof v === "string" && v.length > 0)
      .join(" — ");
    if (text) return text;
  }
  return String(err);
}

function resolveRange(
  range: Range,
  anchor: string,
  customFrom: string,
  customTo: string
): { from: string; to: string } {
  const d = new Date(anchor + "T12:00:00");
  if (range === "custom") {
    return { from: customFrom || todayISO(), to: customTo || todayISO() };
  }
  if (range === "day") {
    const iso = localISODate(d);
    return { from: iso, to: iso };
  }
  if (range === "week") {
    const dow = d.getDay();
    const start = new Date(d);
    start.setDate(d.getDate() - dow);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { from: localISODate(start), to: localISODate(end) };
  }
  if (range === "month") {
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { from: localISODate(start), to: localISODate(end) };
  }
  // year
  const start = new Date(d.getFullYear(), 0, 1);
  const end = new Date(d.getFullYear(), 11, 31);
  return { from: localISODate(start), to: localISODate(end) };
}

function shiftAnchor(anchor: string, range: Range, delta: number): string {
  const d = new Date(anchor + "T12:00:00");
  if (range === "day") d.setDate(d.getDate() + delta);
  else if (range === "week") d.setDate(d.getDate() + 7 * delta);
  else if (range === "month") d.setMonth(d.getMonth() + delta);
  else if (range === "year") d.setFullYear(d.getFullYear() + delta);
  return localISODate(d);
}

function RangeBar({
  range,
  setRange,
  anchor,
  setAnchor,
  customFrom,
  setCustomFrom,
  customTo,
  setCustomTo,
}: {
  range: Range;
  setRange: (r: Range) => void;
  anchor: string;
  setAnchor: (v: string) => void;
  customFrom: string;
  setCustomFrom: (v: string) => void;
  customTo: string;
  setCustomTo: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {(["day", "week", "month", "year"] as Range[]).map((r) => (
        <button
          key={r}
          onClick={() => setRange(r)}
          className={cn(
            "chip h-7 px-2 text-[11px] border",
            range === r ? "bg-ink text-paper border-ink" : "border-line hover:border-ink"
          )}
        >
          {r === "day" ? "Today" : r === "week" ? "Week" : r === "month" ? "Month" : "Year"}
        </button>
      ))}
      {range !== "custom" && (
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setAnchor(shiftAnchor(anchor, range, -1))}
            className="btn btn-ghost h-7 w-7 p-0"
            title="Previous"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setAnchor(todayISO())}
            className="chip h-7 px-2 text-[10px] border border-line hover:border-ink"
          >
            {new Date(anchor).toLocaleDateString(undefined, {
              month: "short",
              day: range === "day" ? "numeric" : undefined,
              year: range === "year" || range === "month" ? "numeric" : undefined,
            })}
          </button>
          <button
            onClick={() => setAnchor(shiftAnchor(anchor, range, 1))}
            className="btn btn-ghost h-7 w-7 p-0"
            title="Next"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      <button
        onClick={() => setRange("custom")}
        className={cn(
          "chip h-7 px-2 text-[11px] border",
          range === "custom" ? "bg-ink text-paper border-ink" : "border-line hover:border-ink"
        )}
      >
        Custom
      </button>
      {range === "custom" && (
        <>
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="input h-7 text-[11px] w-32"
          />
          <span className="text-ink-mute text-xs">→</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="input h-7 text-[11px] w-32"
          />
        </>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "danger";
}) {
  return (
    <div className="paper-card p-3">
      <div className="text-[10px] uppercase tracking-widest text-ink-mute">{label}</div>
      <div
        className={cn(
          "font-display text-base md:text-lg font-bold num mt-0.5 leading-tight break-words",
          tone === "success" && "text-success",
          tone === "danger" && "text-danger"
        )}
      >
        {value}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const meta = CLIENT_INVOICE_STATUS_META[status as keyof typeof CLIENT_INVOICE_STATUS_META];
  if (!meta) return <span className="chip text-[10px]">{status}</span>;
  return (
    <span className={cn("chip text-[10px] uppercase tracking-widest px-2", meta.color)}>
      {meta.label}
    </span>
  );
}

/* ============================================================
 * TABS
 * ============================================================ */

/**
 * Ordinary Debtors & Creditors — plain who-owes-who view, separate from the
 * billing workflow above. Debtors combine POS credit/partial balances with
 * unpaid client invoices; creditors read supplier-side invoice rows.
 */
function DebtorsTab({ invoices, currency }: { invoices: ClientInvoice[]; currency: string }) {
  const { data: sales = [] } = useSales(1000);
  const { data: suppliers = [] } = useSuppliers();
  const today = todayISO();
  const { data: creditorRows = [] } = useQuery({
    queryKey: ["creditor_invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("debt_invoices")
        .select("id, number, customer_name, supplier_id, total, amount_due, status, due_date, issue_date")
        .eq("party_type", "creditor")
        .neq("status", "voided")
        .order("issue_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as { id: string; number?: string; customer_name?: string; supplier_id?: string; status?: string; amount_due?: number }[];
    },
    staleTime: 60_000,
  });

  const posDebtors = useMemo(() => {
    const m = new Map<string, { name: string; phone?: string | null; outstanding: number; overdue: number; count: number; last: string }>();
    for (const s of sales) {
      if (!["credit", "partial"].includes(s.paymentStatus) || !(s.amountDue > 0)) continue;
      const key = s.customerId || s.customerName || "Walk-in";
      const cur = m.get(key) || { name: s.customerName || "Walk-in", phone: null, outstanding: 0, overdue: 0, count: 0, last: s.createdAt };
      cur.outstanding += s.amountDue;
      if (s.dueDate && s.dueDate < today) cur.overdue += s.amountDue;
      cur.count += 1;
      if (s.createdAt > cur.last) cur.last = s.createdAt;
      m.set(key, cur);
    }
    return [...m.values()].sort((a, b) => b.outstanding - a.outstanding);
  }, [sales, today]);

  const clientDebtors = useMemo(() => {
    return invoices
      .filter((i) => i.status !== "cancelled" && i.amountDue > 0)
      .map((i) => ({
        id: i.id,
        name: i.clientName || i.clientSnapshot?.name || "Client",
        number: i.number,
        outstanding: i.amountDue,
        overdue: i.dueDate && i.dueDate < today ? i.amountDue : 0,
      }))
      .sort((a, b) => b.outstanding - a.outstanding);
  }, [invoices, today]);

  const creditorTotal = creditorRows.reduce((s, r) => s + Number(r.amount_due || 0), 0);
  const posTotal = posDebtors.reduce((s, r) => s + r.outstanding, 0);
  const clientTotal = clientDebtors.reduce((s, r) => s + r.outstanding, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Kpi label="POS debtors owe" value={formatCurrency(posTotal, currency)} tone={posTotal > 0 ? "danger" : undefined} />
        <Kpi label="Clients owe (invoices)" value={formatCurrency(clientTotal, currency)} tone={clientTotal > 0 ? "danger" : undefined} />
        <Kpi label="We owe suppliers" value={formatCurrency(creditorTotal, currency)} tone={creditorTotal > 0 ? "danger" : undefined} />
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-widest text-ink-mute mb-1">Debtors — POS credit sales</div>
        {posDebtors.length === 0 ? (
          <div className="p-4 border border-dashed rounded-md text-sm text-ink-mute text-center">No outstanding POS credit.</div>
        ) : (
          <div className="overflow-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="bg-paper">
                <tr className="text-left text-[11px] uppercase tracking-widest text-ink-mute">
                  <th className="p-2 pl-3">Customer</th>
                  <th className="p-2 text-right">Sales</th>
                  <th className="p-2 text-right">Overdue</th>
                  <th className="p-2 text-right">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {posDebtors.map((d) => (
                  <tr key={d.name} className="border-t">
                    <td className="p-2 pl-3 font-semibold">{d.name}</td>
                    <td className="p-2 text-right num">{d.count}</td>
                    <td className="p-2 text-right num text-danger">{d.overdue > 0 ? formatCurrency(d.overdue, currency) : "—"}</td>
                    <td className="p-2 text-right num font-bold">{formatCurrency(d.outstanding, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-widest text-ink-mute mb-1">Debtors — unpaid client invoices</div>
        {clientDebtors.length === 0 ? (
          <div className="p-4 border border-dashed rounded-md text-sm text-ink-mute text-center">No unpaid client invoices.</div>
        ) : (
          <div className="overflow-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="bg-paper">
                <tr className="text-left text-[11px] uppercase tracking-widest text-ink-mute">
                  <th className="p-2 pl-3">Client / Invoice</th>
                  <th className="p-2 text-right">Overdue</th>
                  <th className="p-2 text-right">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {clientDebtors.map((d) => (
                  <tr key={d.id} className="border-t">
                    <td className="p-2 pl-3"><span className="font-semibold">{d.name}</span> <span className="text-ink-mute num">{d.number}</span></td>
                    <td className="p-2 text-right num text-danger">{d.overdue > 0 ? formatCurrency(d.overdue, currency) : "—"}</td>
                    <td className="p-2 text-right num font-bold">{formatCurrency(d.outstanding, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-widest text-ink-mute mb-1">Creditors — we owe suppliers</div>
        {creditorRows.length === 0 ? (
          <div className="p-4 border border-dashed rounded-md text-sm text-ink-mute text-center">
            No supplier balances recorded. Creditor invoices appear here once raised.
          </div>
        ) : (
          <div className="overflow-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="bg-paper">
                <tr className="text-left text-[11px] uppercase tracking-widest text-ink-mute">
                  <th className="p-2 pl-3">Supplier / Invoice</th>
                  <th className="p-2 text-right">Status</th>
                  <th className="p-2 text-right">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {creditorRows.map((r) => {
                  const s = suppliers.find((x) => x.id === r.supplier_id);
                  return (
                    <tr key={r.id} className="border-t">
                      <td className="p-2 pl-3"><span className="font-semibold">{s?.name || r.customer_name || "Supplier"}</span> <span className="text-ink-mute num">{r.number}</span></td>
                      <td className="p-2 text-right text-ink-mute">{r.status}</td>
                      <td className="p-2 text-right num font-bold">{formatCurrency(Number(r.amount_due || 0), currency)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function OverviewTab({
  invoices,
  payments: _payments,
  clients,
  currency,
  onOpenInvoice,
  onRecordPayment: _onRecordPayment,
}: {
  invoices: ClientInvoice[];
  payments: unknown[];
  clients: ClientAccount[];
  currency: string;
  onOpenInvoice: (inv: ClientInvoice) => void;
  onRecordPayment: (inv: ClientInvoice) => void;
}) {
  const active = invoices.filter((i) => i.status !== "cancelled");
  const byClient = new Map<string, number>();
  for (const inv of active) {
    byClient.set(inv.clientId, (byClient.get(inv.clientId) || 0) + inv.amountDue);
  }
  const topClients = Array.from(byClient.entries())
    .map(([id, amt]) => ({
      id,
      name: clients.find((c) => c.id === id)?.name || "Unknown",
      amount: amt,
    }))
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  const recent = [...active].sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1)).slice(0, 6);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="paper-card p-3">
        <div className="text-[10px] uppercase tracking-widest text-ink-mute mb-2">
          Top outstanding clients
        </div>
        {topClients.length === 0 ? (
          <div className="text-xs text-ink-mute p-4 text-center">
            No outstanding client balances.
          </div>
        ) : (
          <div className="space-y-2">
            {topClients.map((c) => {
              const max = topClients[0].amount || 1;
              return (
                <div key={c.id}>
                  <div className="flex justify-between text-xs mb-0.5">
                    <span className="font-semibold truncate pr-2">{c.name}</span>
                    <span className="num">{formatCurrency(c.amount, currency)}</span>
                  </div>
                  <div className="h-1.5 rounded bg-ink/5 overflow-hidden">
                    <div
                      className="h-full bg-magenta-reg"
                      style={{ width: `${(c.amount / max) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="paper-card p-3">
        <div className="text-[10px] uppercase tracking-widest text-ink-mute mb-2">
          Recent invoices
        </div>
        {recent.length === 0 ? (
          <div className="text-xs text-ink-mute p-4 text-center">No invoices yet.</div>
        ) : (
          <div className="divide-y">
            {recent.map((inv) => (
              <button
                key={inv.id}
                onClick={() => onOpenInvoice(inv)}
                className="w-full py-2 flex items-center gap-2 hover:bg-paper/40 px-2 -mx-2 rounded transition"
              >
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">{inv.number}</span>
                    <StatusPill status={inv.status} />
                  </div>
                  <div className="text-[10px] text-ink-mute truncate">
                    {inv.clientName} · {inv.billingPeriodLabel || inv.invoiceType}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="num text-xs font-semibold">
                    {formatCurrency(inv.total, currency)}
                  </div>
                  <div className="text-[10px] num text-danger">
                    Due {formatCurrency(inv.amountDue, currency)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ClientsTab({
  clients,
  invoices,
  currency,
  canManage,
  onEdit,
  onServices,
  onDetail,
}: {
  clients: ClientAccount[];
  invoices: ClientInvoice[];
  currency: string;
  canManage: boolean;
  onEdit: (c: ClientAccount) => void;
  onServices: (c: ClientAccount) => void;
  onDetail: (c: ClientAccount) => void;
}) {
  if (clients.length === 0) {
    return (
      <div className="text-center py-8 text-ink-mute text-sm">
        No clients yet. Click "New client" to add your first business client.
      </div>
    );
  }
  return (
    <div className="overflow-auto max-h-[60vh] scroll-lined">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-paper">
          <tr className="text-left text-[10px] uppercase tracking-widest text-ink-mute">
            <th className="p-2 pl-3">Client</th>
            <th className="p-2">Contact</th>
            <th className="p-2">Mode</th>
            <th className="p-2 text-right">Outstanding</th>
            <th className="p-2 text-right pr-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {clients.map((c) => {
            const outstanding = invoices
              .filter((i) => i.clientId === c.id && i.status !== "cancelled")
              .reduce((s, i) => s + i.amountDue, 0);
            return (
              <tr key={c.id} className="border-t hover:bg-paper/40">
                <td className="p-2 pl-3">
                  <button onClick={() => onDetail(c)} className="text-left hover:underline">
                    <div className="font-semibold">{c.name}</div>
                    <div className="text-[10px] text-ink-mute">
                      {c.branch || c.address || "—"}
                    </div>
                  </button>
                </td>
                <td className="p-2 text-ink-mute">
                  <div>{c.phone || "—"}</div>
                  <div className="text-[10px]">{c.email || ""}</div>
                </td>
                <td className="p-2">
                  <span className="chip text-[10px] uppercase">
                    {c.invoiceGenerationMode}
                  </span>
                </td>
                <td className="p-2 text-right num font-semibold">
                  {formatCurrency(outstanding, currency)}
                </td>
                <td className="p-2 pr-3 text-right">
                  <div className="inline-flex gap-1">
                    <button
                      onClick={() => onDetail(c)}
                      className="btn btn-ghost h-7 w-7 p-0"
                      title="Statement"
                    >
                      <FileText className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => onServices(c)}
                      className="btn btn-ghost h-7 w-7 p-0"
                      title="Services"
                    >
                      <ClipboardList className="w-3 h-3" />
                    </button>
                    {canManage && (
                      <button
                        onClick={() => onEdit(c)}
                        className="btn btn-ghost h-7 w-7 p-0"
                        title="Edit"
                      >
                        <Edit3 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function WorkTab({
  entries,
  currency,
  canManage,
  actor,
  onEdit,
}: {
  entries: ClientWorkEntry[];
  currency: string;
  canManage: boolean;
  actor?: { id: string; name: string; role?: string };
  onEdit: (entry: ClientWorkEntry) => void;
}) {
  const validate = useValidateClientWorkEntry();
  const del = useDeleteClientWorkEntry();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    const s = new Set(selected);
    if (s.has(id)) {
      s.delete(id);
    } else {
      s.add(id);
    }
    setSelected(s);
  };

  const bulkValidate = async (v: boolean) => {
    if (selected.size === 0) return;
    try {
      await validate.mutateAsync({ ids: Array.from(selected), validated: v, actor });
      toast.success(v ? "Validated" : "Un-validated");
      setSelected(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Validation failed");
    }
  };

  if (entries.length === 0) {
    return (
      <div className="text-center py-8 text-ink-mute text-sm">
        No work entries in this range.
      </div>
    );
  }

  return (
    <div>
      {canManage && selected.size > 0 && (
        <div className="paper-card p-2 mb-2 flex items-center gap-2 bg-magenta-reg/5">
          <span className="text-xs font-semibold">{selected.size} selected</span>
          <div className="flex-1" />
          <button onClick={() => bulkValidate(true)} className="btn btn-primary h-7 text-xs">
            <Check className="w-3 h-3" /> Validate
          </button>
          <button onClick={() => bulkValidate(false)} className="btn btn-outline h-7 text-xs">
            <Ban className="w-3 h-3" /> Un-validate
          </button>
        </div>
      )}
      <div className="overflow-auto max-h-[55vh] scroll-lined">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-paper">
            <tr className="text-left text-[10px] uppercase tracking-widest text-ink-mute">
              <th className="p-2 pl-3 w-8" />
              <th className="p-2">Date</th>
              <th className="p-2">Client</th>
              <th className="p-2">Officer</th>
              <th className="p-2">Service</th>
              <th className="p-2 text-right">Qty</th>
              <th className="p-2 text-right">Unit price</th>
              <th className="p-2 text-right">Amount</th>
              <th className="p-2">Status</th>
              <th className="p-2 pr-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-t hover:bg-paper/40">
                <td className="p-2 pl-3">
                  <input
                    type="checkbox"
                    disabled={e.status !== "unbilled"}
                    checked={selected.has(e.id)}
                    onChange={() => toggle(e.id)}
                  />
                </td>
                <td className="p-2 text-ink-mute">{formatDate(e.workDate)}</td>
                <td className="p-2">{e.clientName}</td>
                <td className="p-2">{e.officer || "—"}</td>
                <td className="p-2">
                  <div>{e.serviceName}</div>
                  {e.description && (
                    <div className="text-[10px] text-ink-mute">{e.description}</div>
                  )}
                </td>
                <td className="p-2 text-right num">
                  {e.quantity}
                  {e.unit ? ` ${e.unit}` : ""}
                </td>
                <td className="p-2 text-right num">{formatCurrency(e.unitPrice, currency)}</td>
                <td className="p-2 text-right num font-semibold">
                  {formatCurrency(e.amount, currency)}
                </td>
                <td className="p-2">
                  <div className="flex flex-col gap-0.5">
                    <span
                      className={cn(
                        "chip text-[9px] uppercase",
                        e.status === "billed"
                          ? "bg-success/10 text-success border border-success/30"
                          : e.status === "voided"
                          ? "bg-ink/5 text-ink-mute border border-line"
                          : "bg-cyan-reg/10 text-cyan-reg border border-cyan-reg/30"
                      )}
                    >
                      {e.status}
                    </span>
                    {e.validated && (
                      <span className="chip text-[9px] uppercase bg-magenta-reg/10 text-magenta-reg border border-magenta-reg/30">
                        Validated
                      </span>
                    )}
                  </div>
                </td>
                <td className="p-2 pr-3 text-right">
                  {canManage && e.status === "unbilled" && (
                    <div className="inline-flex gap-1">
                      <button
                        onClick={() => onEdit(e)}
                        className="btn btn-ghost h-6 w-6 p-0"
                        title="Edit"
                      >
                        <Edit3 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => {
                          if (!confirm("Delete this work entry?")) return;
                          del
                            .mutateAsync({ id: e.id, actor })
                            .then(() => toast.success("Deleted"))
                            .catch((err) => toast.error(err.message));
                        }}
                        className="btn btn-ghost h-6 w-6 p-0 text-danger"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PeriodsTab({
  periods,
  workEntries,
  clients,
  clientFilter,
  currency,
  canManage,
  onGenerate,
  onPreview,
}: {
  periods: ClientBillingPeriod[];
  workEntries: ClientWorkEntry[];
  clients: ClientAccount[];
  clientFilter: string;
  currency: string;
  canManage: boolean;
  onGenerate: (input: { client: ClientAccount; period: string }) => void;
  onPreview: (input: { client: ClientAccount; period: string }) => void;
}) {
  // Aggregate periods from work entries (client × billing_period)
  const derived = new Map<
    string,
    {
      clientId: string;
      clientName: string;
      period: string;
      count: number;
      total: number;
      validatedCount: number;
      unbilledCount: number;
    }
  >();
  for (const w of workEntries) {
    if (!w.billingPeriod) continue;
    if (clientFilter && w.clientId !== clientFilter) continue;
    const key = `${w.clientId}|${w.billingPeriod}`;
    const cur = derived.get(key) || {
      clientId: w.clientId,
      clientName: w.clientName,
      period: w.billingPeriod,
      count: 0,
      total: 0,
      validatedCount: 0,
      unbilledCount: 0,
    };
    cur.count += 1;
    cur.total += w.amount;
    if (w.validated) cur.validatedCount += 1;
    if (w.status === "unbilled") cur.unbilledCount += 1;
    derived.set(key, cur);
  }
  const rows = Array.from(derived.values()).sort(
    (a, b) =>
      b.period.localeCompare(a.period) || a.clientName.localeCompare(b.clientName)
  );

  if (rows.length === 0) {
    return (
      <div className="text-center py-8 text-ink-mute text-sm">
        No billing periods yet — record and validate work entries first.
      </div>
    );
  }

  return (
    <div className="overflow-auto max-h-[60vh] scroll-lined">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-paper">
          <tr className="text-left text-[10px] uppercase tracking-widest text-ink-mute">
            <th className="p-2 pl-3">Client</th>
            <th className="p-2">Period</th>
            <th className="p-2 text-right">Entries</th>
            <th className="p-2 text-right">Validated</th>
            <th className="p-2 text-right">Unbilled</th>
            <th className="p-2 text-right">Amount</th>
            <th className="p-2">Status</th>
            <th className="p-2 pr-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const dbRow = periods.find(
              (p) => p.clientId === r.clientId && p.periodStart === `${r.period}-01`
            );
            const label = new Date(r.period + "-01T12:00:00").toLocaleDateString(undefined, {
              month: "long",
              year: "numeric",
            });
            const client = clients.find((c) => c.id === r.clientId);
            const canBill = r.unbilledCount > 0 && r.validatedCount > 0 && !dbRow?.invoiceId;
            return (
              <tr key={`${r.clientId}|${r.period}`} className="border-t hover:bg-paper/40">
                <td className="p-2 pl-3 font-semibold">{r.clientName}</td>
                <td className="p-2">{label}</td>
                <td className="p-2 text-right num">{r.count}</td>
                <td className="p-2 text-right num">{r.validatedCount}</td>
                <td className="p-2 text-right num">{r.unbilledCount}</td>
                <td className="p-2 text-right num font-semibold">
                  {formatCurrency(r.total, currency)}
                </td>
                <td className="p-2">
                  {dbRow?.invoiceId ? (
                    <span className="chip text-[9px] uppercase bg-success/10 text-success border border-success/30">
                      Invoiced · {dbRow.invoiceNumber}
                    </span>
                  ) : r.validatedCount === r.count ? (
                    <span className="chip text-[9px] uppercase bg-cyan-reg/10 text-cyan-reg border border-cyan-reg/30">
                      Ready
                    </span>
                  ) : (
                    <span className="chip text-[9px] uppercase bg-yellow-reg/10 text-yellow-reg border border-yellow-reg/30">
                      Open
                    </span>
                  )}
                </td>
                <td className="p-2 pr-3 text-right">
                  <div className="inline-flex gap-1">
                    {client && !dbRow?.invoiceId && (
                      <button
                        onClick={() => onPreview({ client, period: r.period })}
                        className="btn btn-outline h-7 text-[10px] px-2"
                        title="Open the current draft bill"
                      >
                        Draft
                      </button>
                    )}
                    {canManage && canBill && client && (
                      <button
                        onClick={() => onGenerate({ client, period: r.period })}
                        className="btn btn-primary h-7 text-[10px] px-2"
                      >
                        Generate invoice
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function InvoicesTab({
  invoices,
  currency,
  canManage,
  onView,
  onPay,
  onOutstanding,
}: {
  invoices: ClientInvoice[];
  currency: string;
  canManage: boolean;
  onView: (inv: ClientInvoice) => void;
  onPay: (inv: ClientInvoice) => void;
  onOutstanding: (inv: ClientInvoice) => void;
}) {
  if (invoices.length === 0) {
    return (
      <div className="text-center py-8 text-ink-mute text-sm">No invoices yet.</div>
    );
  }
  return (
    <div className="overflow-auto max-h-[60vh] scroll-lined">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-paper">
          <tr className="text-left text-[10px] uppercase tracking-widest text-ink-mute">
            <th className="p-2 pl-3">Number</th>
            <th className="p-2">Client</th>
            <th className="p-2">Type</th>
            <th className="p-2">Period</th>
            <th className="p-2">Issue</th>
            <th className="p-2">Due</th>
            <th className="p-2 text-right">Total</th>
            <th className="p-2 text-right">Paid</th>
            <th className="p-2 text-right">Balance</th>
            <th className="p-2">Status</th>
            <th className="p-2 pr-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => (
            <tr key={inv.id} className="border-t hover:bg-paper/40">
              <td className="p-2 pl-3 font-mono">
                <button onClick={() => onView(inv)} className="hover:underline">
                  {inv.number}
                </button>
              </td>
              <td className="p-2">{inv.clientName}</td>
              <td className="p-2">
                <span className="chip text-[9px] uppercase">{inv.invoiceType}</span>
              </td>
              <td className="p-2 text-ink-mute">{inv.billingPeriodLabel || "—"}</td>
              <td className="p-2">{formatDate(inv.issueDate)}</td>
              <td className="p-2 text-ink-mute">{inv.dueDate ? formatDate(inv.dueDate) : "—"}</td>
              <td className="p-2 text-right num font-semibold">
                {formatCurrency(inv.total, currency)}
              </td>
              <td className="p-2 text-right num text-success">
                {formatCurrency(inv.amountPaid, currency)}
              </td>
              <td className="p-2 text-right num text-danger">
                {formatCurrency(inv.amountDue, currency)}
              </td>
              <td className="p-2">
                <StatusPill status={inv.status} />
              </td>
              <td className="p-2 pr-3 text-right">
                <div className="inline-flex gap-1">
                  <button
                    onClick={() => onView(inv)}
                    className="btn btn-ghost h-6 w-6 p-0"
                    title="View"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </button>
                  {canManage && inv.amountDue > 0 && inv.status !== "cancelled" && (
                    <button
                      onClick={() => onPay(inv)}
                      className="btn btn-primary h-6 px-1.5 text-[9px]"
                      title="Record payment"
                    >
                      Pay
                    </button>
                  )}
                  {canManage &&
                    inv.status !== "cancelled" &&
                    inv.amountDue > 0 &&
                    inv.invoiceType === "monthly" && (
                      <button
                        onClick={() => onOutstanding(inv)}
                        className="btn btn-outline h-6 px-1.5 text-[9px]"
                        title="Generate outstanding invoice"
                      >
                        Bal
                      </button>
                    )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PaymentsTab({
  payments,
  invoices,
  currency,
  canManage,
  actor,
}: {
  payments: ClientInvoicePayment[];
  invoices: ClientInvoice[];
  currency: string;
  canManage: boolean;
  actor?: { id: string; name: string; role?: string };
}) {
  const cancel = useCancelClientInvoicePayment();
  if (payments.length === 0) {
    return (
      <div className="text-center py-8 text-ink-mute text-sm">
        No payments recorded in this range.
      </div>
    );
  }
  return (
    <div className="overflow-auto max-h-[60vh] scroll-lined">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-paper">
          <tr className="text-left text-[10px] uppercase tracking-widest text-ink-mute">
            <th className="p-2 pl-3">Receipt #</th>
            <th className="p-2">Date</th>
            <th className="p-2">Invoice</th>
            <th className="p-2">Method</th>
            <th className="p-2">Reference</th>
            <th className="p-2">Received by</th>
            <th className="p-2 text-right">Amount</th>
            <th className="p-2 pr-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => {
            const inv = invoices.find((i) => i.id === p.invoiceId);
            return (
              <tr key={p.id} className={cn("border-t hover:bg-paper/40", p.cancelled && "opacity-50 line-through")}>
                <td className="p-2 pl-3 font-mono">{p.number}</td>
                <td className="p-2">{formatDate(p.paymentDate)}</td>
                <td className="p-2 font-mono">{inv?.number || "—"}</td>
                <td className="p-2 uppercase text-[10px]">{p.paymentMethod}</td>
                <td className="p-2 text-ink-mute">{p.reference || "—"}</td>
                <td className="p-2">{p.receivedByName || "—"}</td>
                <td className="p-2 text-right num font-semibold text-success">
                  {formatCurrency(p.amount, currency)}
                </td>
                <td className="p-2 pr-3 text-right">
                  {canManage && !p.cancelled && (
                    <button
                      onClick={() => {
                        const reason = prompt("Cancellation reason:");
                        if (reason === null) return;
                        cancel
                          .mutateAsync({ id: p.id, reason: reason || undefined, actor })
                          .then(() => toast.success("Payment cancelled"))
                          .catch((err) => toast.error(err.message));
                      }}
                      className="btn btn-ghost h-6 w-6 p-0 text-danger"
                      title="Cancel"
                    >
                      <Ban className="w-3 h-3" />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ReportsTab({
  workEntries,
  invoices,
  payments: _payments,
  clients: _clients,
  currency,
  range,
}: {
  workEntries: ClientWorkEntry[];
  invoices: ClientInvoice[];
  payments: unknown[];
  clients: ClientAccount[];
  currency: string;
  range: { from: string; to: string };
}) {
  const [openOfficer, setOpenOfficer] = useState<string | null>(null);

  const exportBilling = () => {
    const rows = [
      ["Client", "Period", "Officer", "Service", "Qty", "Unit", "Unit Price", "Discount", "Amount"],
      ...workEntries.map((w) => [
        w.clientName,
        w.billingPeriod || "",
        w.officer || "",
        w.serviceName,
        String(w.quantity),
        w.unit || "",
        String(w.unitPrice),
        String(w.discount),
        String(w.amount),
      ]),
    ];
    download(
      `client-billing-${range.from}-to-${range.to}.csv`,
      rows.map((r) => r.map((x) => `"${x}"`).join(",")).join("\n")
    );
  };
  const exportAR = () => {
    const rows = [
      ["Client", "Invoice", "Date", "Due", "Total", "Paid", "Outstanding", "Status"],
      ...invoices.map((i) => [
        i.clientName,
        i.number,
        i.issueDate,
        i.dueDate || "",
        String(i.total),
        String(i.amountPaid),
        String(i.amountDue),
        i.status,
      ]),
    ];
    download(
      `accounts-receivable-${range.from}-to-${range.to}.csv`,
      rows.map((r) => r.map((x) => `"${x}"`).join(",")).join("\n")
    );
  };
  const officerUsage = useMemo(() => {
    const map = new Map<string, { officer: string; qty: number; amount: number; count: number }>();
    for (const w of workEntries) {
      const key = w.officer || "—";
      const cur = map.get(key) || { officer: key, qty: 0, amount: 0, count: 0 };
      cur.qty += w.quantity;
      cur.amount += w.amount;
      cur.count += 1;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [workEntries]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ReportCard title="Client Billing Report" description="All work entries in range" onExport={exportBilling} />
        <ReportCard title="Accounts Receivable" description="Invoice balances outstanding" onExport={exportAR} />
      </div>
      <div className="paper-card p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] uppercase tracking-widest text-ink-mute">
            Officer / staff usage
          </div>
          <div className="text-[10px] text-ink-mute">
            Click a row for full transaction breakdown
          </div>
        </div>
        {officerUsage.length === 0 ? (
          <div className="text-xs text-ink-mute p-4 text-center">No usage data in range.</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-widest text-ink-mute border-b">
                <th className="p-2 pl-3">Officer</th>
                <th className="p-2 text-right">Entries</th>
                <th className="p-2 text-right">Quantity</th>
                <th className="p-2 pr-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {officerUsage.map((r) => (
                <tr
                  key={r.officer}
                  className="border-t cursor-pointer hover:bg-paper/40 transition"
                  onClick={() => setOpenOfficer(r.officer)}
                >
                  <td className="p-2 pl-3 font-semibold">
                    <span className="inline-flex items-center gap-1.5">
                      {r.officer}
                      <ExternalLink className="w-3 h-3 text-ink-mute" />
                    </span>
                  </td>
                  <td className="p-2 text-right num">{r.count}</td>
                  <td className="p-2 text-right num">{r.qty}</td>
                  <td className="p-2 pr-3 text-right num font-semibold">
                    {formatCurrency(r.amount, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {openOfficer && (
        <OfficerBreakdownModal
          officer={openOfficer}
          entries={workEntries}
          currency={currency}
          range={range}
          onClose={() => setOpenOfficer(null)}
        />
      )}
    </div>
  );
}

function OfficerBreakdownModal({
  officer,
  entries,
  currency,
  range,
  onClose,
}: {
  officer: string;
  entries: ClientWorkEntry[];
  currency: string;
  range: { from: string; to: string };
  onClose: () => void;
}) {
  const filtered = entries.filter((e) => (e.officer || "—") === officer);
  const total = filtered.reduce((s, e) => s + e.amount, 0);
  const qty = filtered.reduce((s, e) => s + e.quantity, 0);
  const count = filtered.length;

  const byClient = useMemo(() => {
    const m = new Map<string, ClientWorkEntry[]>();
    for (const e of filtered) {
      const k = e.clientName;
      const list = m.get(k);
      if (list) list.push(e);
      else m.set(k, [e]);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const doExport = () => {
    const rows = [
      ["Client", "Date", "Service", "Description", "Qty", "Unit", "Unit Price", "Discount", "Amount"],
      ...filtered.map((e) => [
        e.clientName,
        e.workDate,
        e.serviceName,
        e.description || "",
        String(e.quantity),
        e.unit || "",
        String(e.unitPrice),
        String(e.discount),
        String(e.amount),
      ]),
    ];
    download(
      `officer-${officer}-${range.from}-to-${range.to}.csv`,
      rows.map((r) => r.map((x) => `"${x}"`).join(",")).join("\n")
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink/50 flex items-center justify-center p-4 animate-fade-in">
      <div className="paper-card w-full max-w-3xl overflow-hidden max-h-[95dvh] flex flex-col">
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-ink-mute">
              Officer breakdown · {formatDate(range.from)} → {formatDate(range.to)}
            </div>
            <h2 className="font-display text-lg font-bold">{officer}</h2>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={doExport} className="btn btn-outline h-8 text-xs">
              CSV
            </button>
            <button onClick={onClose} className="btn btn-ghost h-9 w-9 p-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="overflow-auto p-4 space-y-4 scroll-lined">
          <div className="grid grid-cols-3 gap-3">
            <Kpi label="Entries" value={String(count)} />
            <Kpi label="Total quantity" value={String(qty)} />
            <Kpi
              label="Total amount"
              value={formatCurrency(total, currency)}
              tone={total > 0 ? "success" : undefined}
            />
          </div>

          {byClient.length === 0 ? (
            <div className="text-center py-8 text-ink-mute text-sm">
              No transactions for this officer in the selected range.
            </div>
          ) : (
            byClient.map(([clientName, rows]) => {
              const subtotal = rows.reduce((s, r) => s + r.amount, 0);
              const subQty = rows.reduce((s, r) => s + r.quantity, 0);
              return (
                <div key={clientName} className="border rounded-md overflow-hidden">
                  <div className="p-2 pl-3 bg-paper flex items-center justify-between border-b">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-3.5 h-3.5 text-ink-mute" />
                      <span className="text-sm font-bold">{clientName}</span>
                      <span className="chip text-[9px] uppercase">
                        {rows.length} {rows.length === 1 ? "entry" : "entries"}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="num text-sm font-bold">
                        {formatCurrency(subtotal, currency)}
                      </div>
                      <div className="text-[9px] text-ink-mute num">{subQty} qty</div>
                    </div>
                  </div>
                  <table className="w-full text-xs">
                    <thead className="bg-paper/50">
                      <tr className="text-left text-[10px] uppercase tracking-widest text-ink-mute">
                        <th className="p-2 pl-3">Date</th>
                        <th className="p-2">Service</th>
                        <th className="p-2 text-right">Qty</th>
                        <th className="p-2 text-right">Unit price</th>
                        <th className="p-2 text-right">Discount</th>
                        <th className="p-2 pr-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows
                        .sort((a, b) => a.workDate.localeCompare(b.workDate))
                        .map((e) => (
                          <tr key={e.id} className="border-t">
                            <td className="p-2 pl-3 text-ink-mute">
                              {formatDate(e.workDate)}
                            </td>
                            <td className="p-2">
                              <div>{e.serviceName}</div>
                              {e.description && (
                                <div className="text-[10px] text-ink-mute">
                                  {e.description}
                                </div>
                              )}
                            </td>
                            <td className="p-2 text-right num">
                              {e.quantity} {e.unit || ""}
                            </td>
                            <td className="p-2 text-right num">
                              {formatCurrency(e.unitPrice, currency)}
                            </td>
                            <td className="p-2 text-right num">
                              {e.discount > 0
                                ? formatCurrency(e.discount, currency)
                                : "—"}
                            </td>
                            <td className="p-2 pr-3 text-right num font-semibold">
                              {formatCurrency(e.amount, currency)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              );
            })
          )}
        </div>

        <div className="p-3 border-t flex justify-end">
          <button onClick={onClose} className="btn btn-outline">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function ReportCard({
  title,
  description,
  onExport,
}: {
  title: string;
  description: string;
  onExport: () => void;
}) {
  return (
    <div className="paper-card p-3 flex items-center gap-3">
      <div className="w-10 h-10 rounded-full bg-magenta-reg/10 text-magenta-reg flex items-center justify-center shrink-0">
        <Receipt className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-[10px] text-ink-mute">{description}</div>
      </div>
      <button onClick={onExport} className="btn btn-outline h-7 text-xs">
        CSV
      </button>
    </div>
  );
}

/* ============================================================
 * MODALS
 * ============================================================ */

function ClientModal({
  client,
  onClose,
  actor,
}: {
  client: ClientAccount | null;
  onClose: () => void;
  actor?: { id: string; name: string; role?: string };
}) {
  const upsert = useUpsertClientAccount();
  const del = useDeleteClientAccount();
  const [form, setForm] = useState({
    name: client?.name || "",
    address: client?.address || "",
    branch: client?.branch || "",
    poBox: client?.poBox || "",
    phone: client?.phone || "",
    email: client?.email || "",
    tin: client?.tin || "",
    vat: client?.vat || "",
    active: client?.active !== false,
    invoiceGenerationMode: client?.invoiceGenerationMode || "manual",
    notes: client?.notes || "",
    contactPerson: client?.contactPersons?.[0] || { name: "", title: "", phone: "", email: "" },
    staff: (client?.staff || []) as ClientStaff[],
    paymentDetails: client?.paymentDetails || {
      bankName: "",
      accountName: "",
      accountNumber: "",
      branch: "",
      momo: "",
      instructions: "",
    },
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Client name required");
    try {
      await upsert.mutateAsync({
        id: client?.id,
        name: form.name.trim(),
        address: form.address || null,
        branch: form.branch || null,
        poBox: form.poBox || null,
        phone: form.phone || null,
        email: form.email || null,
        tin: form.tin || null,
        vat: form.vat || null,
        active: form.active,
        invoiceGenerationMode: form.invoiceGenerationMode as ClientInvoiceMode,
        notes: form.notes || null,
        contactPersons: form.contactPerson.name ? [form.contactPerson] : [],
        staff: form.staff.filter((s) => s.name.trim()),
        paymentDetails: form.paymentDetails,
        actor,
      });
      toast.success(client ? "Updated" : "Created");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink/50 flex items-center justify-center p-4 animate-fade-in">
      <div className="paper-card w-full max-w-2xl overflow-hidden max-h-[95dvh] flex flex-col">
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-ink-mute">
              {client ? "Edit" : "New"}
            </div>
            <h2 className="font-display text-lg font-bold">
              {client ? client.name : "New client"}
            </h2>
          </div>
          <button onClick={onClose} className="btn btn-ghost h-9 w-9 p-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={submit} className="overflow-auto p-4 space-y-4 scroll-lined">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label htmlFor="cb-client-name" className="label">Client / Company name *</label>
              <input
                id="cb-client-name"
                required
                autoFocus
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input mt-1"
              />
            </div>
            <div>
              <label htmlFor="cb-branch" className="label">Branch / Location</label>
              <input
                id="cb-branch"
                value={form.branch}
                onChange={(e) => setForm({ ...form, branch: e.target.value })}
                className="input mt-1"
              />
            </div>
            <div>
              <label htmlFor="cb-pobox" className="label">P.O. Box</label>
              <input
                id="cb-pobox"
                value={form.poBox}
                onChange={(e) => setForm({ ...form, poBox: e.target.value })}
                className="input mt-1"
              />
            </div>
            <div className="col-span-2">
              <label htmlFor="cb-address" className="label">Address</label>
              <input
                id="cb-address"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="input mt-1"
              />
            </div>
            <div>
              <PhoneInput
                id="cb-phone"
                label="Phone"
                value={form.phone}
                onChange={(phone) => setForm({ ...form, phone })}
              />
            </div>
            <div>
              <label htmlFor="cb-email" className="label">Email</label>
              <input
                id="cb-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="input mt-1"
              />
            </div>
            <div>
              <label htmlFor="cb-tin" className="label">TIN</label>
              <input
                id="cb-tin"
                value={form.tin}
                onChange={(e) => setForm({ ...form, tin: e.target.value })}
                className="input mt-1 num"
              />
            </div>
            <div>
              <label htmlFor="cb-vat" className="label">VAT</label>
              <input
                id="cb-vat"
                value={form.vat}
                onChange={(e) => setForm({ ...form, vat: e.target.value })}
                className="input mt-1"
              />
            </div>
            <div>
              <label htmlFor="cb-invoice-mode" className="label">Invoice mode</label>
              <select
                id="cb-invoice-mode"
                value={form.invoiceGenerationMode}
                onChange={(e) =>
                  setForm({ ...form, invoiceGenerationMode: e.target.value as ClientInvoiceMode })
                }
                className="input mt-1"
              >
                <option value="manual">Manual</option>
                <option value="automatic">Automatic (month-end)</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                />
                Active
              </label>
            </div>
          </div>

          <fieldset className="border-t pt-3">
            <legend className="text-[10px] uppercase tracking-widest text-ink-mute px-1">
              Primary contact
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="cb-contact-name" className="label">Name</label>
                <input
                  id="cb-contact-name"
                  value={form.contactPerson.name}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      contactPerson: { ...form.contactPerson, name: e.target.value },
                    })
                  }
                  className="input mt-1"
                />
              </div>
              <div>
                <label htmlFor="cb-contact-title" className="label">Title</label>
                <input
                  id="cb-contact-title"
                  value={form.contactPerson.title}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      contactPerson: { ...form.contactPerson, title: e.target.value },
                    })
                  }
                  className="input mt-1"
                />
              </div>
              <div>
                <PhoneInput
                  id="cb-contact-phone"
                  label="Phone"
                  value={form.contactPerson.phone || ""}
                  onChange={(phone) =>
                    setForm({
                      ...form,
                      contactPerson: { ...form.contactPerson, phone },
                    })
                  }
                />
              </div>
              <div>
                <label htmlFor="cb-contact-email" className="label">Email</label>
                <input
                  id="cb-contact-email"
                  value={form.contactPerson.email}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      contactPerson: { ...form.contactPerson, email: e.target.value },
                    })
                  }
                  className="input mt-1"
                />
              </div>
            </div>
          </fieldset>

          <fieldset className="border-t pt-3">
            <legend className="text-[10px] uppercase tracking-widest text-ink-mute px-1">
              Staff / Officers (autocomplete in work entries)
            </legend>
            <div className="space-y-2">
              {form.staff.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={s.name}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        staff: form.staff.map((x, j) =>
                          j === i ? { ...x, name: e.target.value } : x
                        ),
                      })
                    }
                    className="input h-8 flex-1 text-xs"
                    placeholder="Staff name"
                  />
                  <input
                    value={s.title || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        staff: form.staff.map((x, j) =>
                          j === i ? { ...x, title: e.target.value } : x
                        ),
                      })
                    }
                    className="input h-8 w-32 text-xs"
                    placeholder="Title (opt)"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        staff: form.staff.filter((_, j) => j !== i),
                      })
                    }
                    className="btn btn-ghost h-8 w-8 p-0 text-danger"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setForm({ ...form, staff: [...form.staff, { name: "" }] })
                }
                className="btn btn-outline h-8 text-xs w-full"
              >
                <Plus className="w-3 h-3" /> Add staff
              </button>
              <div className="text-[10px] text-ink-mute">
                Staff added here auto-suggest in the Work Entry officer field.
                New officer names typed on a Work Entry are also saved back here.
              </div>
            </div>
          </fieldset>

          <fieldset className="border-t pt-3">
            <legend className="text-[10px] uppercase tracking-widest text-ink-mute px-1">
              Payment details (appear on every invoice)
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="cb-bank-name" className="label">Bank name</label>
                <input
                  id="cb-bank-name"
                  value={form.paymentDetails.bankName || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      paymentDetails: { ...form.paymentDetails, bankName: e.target.value },
                    })
                  }
                  className="input mt-1"
                />
              </div>
              <div>
                <label htmlFor="cb-account-name" className="label">Account name</label>
                <input
                  id="cb-account-name"
                  value={form.paymentDetails.accountName || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      paymentDetails: { ...form.paymentDetails, accountName: e.target.value },
                    })
                  }
                  className="input mt-1"
                />
              </div>
              <div>
                <label htmlFor="cb-account-number" className="label">Account number</label>
                <input
                  id="cb-account-number"
                  value={form.paymentDetails.accountNumber || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      paymentDetails: { ...form.paymentDetails, accountNumber: e.target.value },
                    })
                  }
                  className="input mt-1 num"
                />
              </div>
              <div>
                <label htmlFor="cb-bank-branch" className="label">Bank branch</label>
                <input
                  id="cb-bank-branch"
                  value={form.paymentDetails.branch || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      paymentDetails: { ...form.paymentDetails, branch: e.target.value },
                    })
                  }
                  className="input mt-1"
                />
              </div>
              <div className="col-span-2">
                <label htmlFor="cb-momo" className="label">Mobile Money / MOMO</label>
                <input
                  id="cb-momo"
                  value={form.paymentDetails.momo || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      paymentDetails: { ...form.paymentDetails, momo: e.target.value },
                    })
                  }
                  className="input mt-1"
                />
              </div>
              <div className="col-span-2">
                <label htmlFor="cb-instructions" className="label">Instructions</label>
                <textarea
                  id="cb-instructions"
                  value={form.paymentDetails.instructions || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      paymentDetails: {
                        ...form.paymentDetails,
                        instructions: e.target.value,
                      },
                    })
                  }
                  className="input mt-1 h-16"
                />
              </div>
            </div>
          </fieldset>

          <div>
            <label htmlFor="cb-internal-notes" className="label">Internal notes</label>
            <textarea
              id="cb-internal-notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="input mt-1 h-16"
            />
          </div>

          <div className="flex justify-between gap-2 pt-2 border-t">
            {client && (
              <button
                type="button"
                onClick={() => {
                  if (!confirm(`Delete ${client.name}? Their invoices remain intact.`)) return;
                  del
                    .mutateAsync({ id: client.id, actor })
                    .then(() => {
                      toast.success("Deleted");
                      onClose();
                    })
                    .catch((err) => toast.error(err.message));
                }}
                className="btn btn-ghost text-danger"
              >
                Delete client
              </button>
            )}
            <div className="flex gap-2 ml-auto">
              <button type="button" onClick={onClose} className="btn btn-outline">
                Cancel
              </button>
              <button type="submit" disabled={upsert.isPending} className="btn btn-primary">
                {upsert.isPending ? "Saving..." : client ? "Save" : "Create"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function ServicesModal({
  client,
  currency,
  onClose,
}: {
  client: ClientAccount;
  currency: string;
  onClose: () => void;
}) {
  const { data: services = [] } = useClientServices(client.id);
  const upsert = useUpsertClientService();
  const del = useDeleteClientService();
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("pc");
  const [price, setPrice] = useState(0);

  const add = async () => {
    if (!name.trim()) return toast.error("Name required");
    try {
      await upsert.mutateAsync({
        clientId: client.id,
        name: name.trim(),
        unit,
        unitPrice: price,
        active: true,
      });
      setName("");
      setPrice(0);
      toast.success("Added");
    } catch (err) {
      toast.error(describeError(err));
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink/50 flex items-center justify-center p-4 animate-fade-in">
      <div className="paper-card w-full max-w-lg overflow-hidden max-h-[95dvh] flex flex-col">
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-ink-mute">
              {client.name}
            </div>
            <h2 className="font-display text-lg font-bold">Services &amp; prices</h2>
          </div>
          <button onClick={onClose} className="btn btn-ghost h-9 w-9 p-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-3 overflow-auto scroll-lined">
          <div className="paper-card p-3">
            <div className="grid grid-cols-6 gap-2 items-end">
              <div className="col-span-3">
                <label htmlFor="cb-service-name" className="label">Service name</label>
                <input
                  id="cb-service-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input mt-1"
                  placeholder="Passport photo"
                />
              </div>
              <div>
                <label htmlFor="cb-service-unit" className="label">Unit</label>
                <input id="cb-service-unit" value={unit} onChange={(e) => setUnit(e.target.value)} className="input mt-1" />
              </div>
              <div>
                <label htmlFor="cb-service-price" className="label">Price</label>
                <input
                  id="cb-service-price"
                  type="number"
                  min={0}
                  value={price || ""}
                  onChange={(e) => setPrice(Number(e.target.value) || 0)}
                  className="input mt-1 num text-right"
                  placeholder="0"
                />
              </div>
              <button onClick={add} className="btn btn-primary h-9">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="divide-y">
            {services.length === 0 ? (
              <div className="text-xs text-ink-mute text-center py-6">No services yet.</div>
            ) : (
              services.map((s) => (
                <ServiceRow key={s.id} service={s} currency={currency} onUpdate={upsert} onDelete={del} />
              ))
            )}
          </div>
        </div>
        <div className="p-3 border-t flex justify-end">
          <button onClick={onClose} className="btn btn-outline">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function ServiceRow({
  service,
  currency,
  onUpdate,
  onDelete,
}: {
  service: ClientService;
  currency: string;
  onUpdate: ReturnType<typeof useUpsertClientService>;
  onDelete: ReturnType<typeof useDeleteClientService>;
}) {
  const [price, setPrice] = useState(service.unitPrice);
  const save = async () => {
    if (price === service.unitPrice) return;
    try {
      await onUpdate.mutateAsync({ ...service, unitPrice: price });
      toast.success("Updated");
    } catch (err) {
      toast.error(describeError(err));
    }
  };
  return (
    <div className="flex items-center gap-2 py-2">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate">{service.name}</div>
        <div className="text-[10px] text-ink-mute">Unit: {service.unit}</div>
      </div>
      <input
        type="number"
        min={0}
        value={price || ""}
        onChange={(e) => setPrice(Number(e.target.value) || 0)}
        onBlur={save}
        className="input h-8 w-24 num text-right"
        placeholder="0"
      />
      <span className="text-[10px] text-ink-mute w-12">{currency}</span>
      <button
        onClick={() => {
          if (!confirm("Delete this service?")) return;
          onDelete
            .mutateAsync(service.id)
            .then(() => toast.success("Deleted"))
            .catch((err) => toast.error(err.message));
        }}
        className="btn btn-ghost h-7 w-7 p-0 text-danger"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}

function WorkEntryModal({
  entry,
  initialClientId,
  clients,
  currency,
  onClose,
  actor,
}: {
  entry?: ClientWorkEntry;
  initialClientId?: string;
  clients: ClientAccount[];
  currency: string;
  onClose: () => void;
  actor?: { id: string; name: string; role?: string };
}) {
  const [clientId, setClientId] = useState(
    entry?.clientId || initialClientId || clients[0]?.id || ""
  );
  const { data: services = [] } = useClientServices(clientId || undefined);
  const { data: items = [] } = useItems();
  const upsert = useUpsertClientWorkEntry();
  const upsertClient = useUpsertClientAccount();

  const client = clients.find((c) => c.id === clientId);
  const staff = client?.staff || [];
  // Sellable inventory (excludes pure raw materials and channel-hidden items).
  const sellableItems = items.filter((i) => i.itemType !== "material" && i.canSell !== false);

  const initialServiceKey = entry
    ? entry.serviceId
      ? `service:${entry.serviceId}`
      : entry.serviceName
      ? "custom"
      : ""
    : "";

  const [form, setForm] = useState({
    workDate: entry?.workDate || todayISO(),
    officer: entry?.officer || "",
    serviceKey: initialServiceKey,
    serviceName: entry?.serviceName || "",
    description: entry?.description || "",
    quantity: entry?.quantity || 1,
    unit: entry?.unit || "pc",
    unitPrice: entry?.unitPrice || 0,
    discount: entry?.discount || 0,
    documentRef: entry?.documentRef || "",
  });

  const [newStaffPending, setNewStaffPending] = useState(false);

  // Reset the service selection whenever the client changes (except
  // when we are editing an existing entry — that keeps its saved link).
  useEffect(() => {
    if (entry) return;
    setForm((f) => ({
      ...f,
      serviceKey: "",
      serviceName: "",
      unit: "pc",
      unitPrice: 0,
    }));
  }, [clientId, entry]);

  const isCustomService = form.serviceKey === "custom";
  const noSelection = form.serviceKey === "";

  const handleServiceChange = (value: string) => {
    if (value === "") {
      setForm((f) => ({ ...f, serviceKey: "", serviceName: "" }));
      return;
    }
    if (value === "custom") {
      setForm((f) => ({
        ...f,
        serviceKey: value,
        serviceName: "",
        unit: "pc",
        unitPrice: 0,
      }));
      return;
    }
    if (value.startsWith("service:")) {
      const id = value.replace("service:", "");
      const s = services.find((x) => x.id === id);
      if (s) {
        setForm((f) => ({
          ...f,
          serviceKey: value,
          serviceName: s.name,
          unit: s.unit || "pc",
          unitPrice: s.unitPrice,
        }));
      }
      return;
    }
    if (value.startsWith("item:")) {
      const id = value.replace("item:", "");
      const i = items.find((x) => x.id === id);
      if (i) {
        setForm((f) => ({
          ...f,
          serviceKey: value,
          serviceName: i.name,
          unit: i.saleUnit || i.baseUnit || "pc",
          unitPrice: i.price,
        }));
      }
    }
  };

  const amount = Math.max(0, form.quantity * form.unitPrice - form.discount);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId || !client) return toast.error("Client required");
    if (!form.officer.trim()) return toast.error("Officer / staff required");
    if (!form.serviceName.trim())
      return toast.error("Product / service required");
    if (form.quantity <= 0) return toast.error("Qty must be > 0");

    const serviceId = form.serviceKey.startsWith("service:")
      ? form.serviceKey.replace("service:", "")
      : null;

    try {
      await upsert.mutateAsync({
        id: entry?.id,
        clientId,
        clientName: client.name,
        workDate: form.workDate,
        officer: form.officer.trim(),
        serviceId,
        serviceName: form.serviceName.trim(),
        description: form.description || null,
        quantity: form.quantity,
        unit: form.unit,
        unitPrice: form.unitPrice,
        discount: form.discount,
        documentRef: form.documentRef || null,
        actor,
      });

      // Auto-add brand-new officer names to the client's staff roster
      // so they auto-suggest next time. Non-fatal on failure.
      const officerNorm = form.officer.trim().toLowerCase();
      const alreadyOnFile = staff.some(
        (s) => s.name.trim().toLowerCase() === officerNorm
      );
      if (officerNorm && !alreadyOnFile) {
        setNewStaffPending(true);
        try {
          await upsertClient.mutateAsync({
            ...client,
            staff: [...staff, { name: form.officer.trim() }],
            actor,
          });
        } catch {
          // silent — the work entry is already recorded
        } finally {
          setNewStaffPending(false);
        }
      }

      toast.success(entry ? "Updated" : "Recorded");
      onClose();
    } catch (err) {
      toast.error(describeError(err));
    }
  };

  const staffListId = `officer-staff-${clientId || "none"}`;

  return (
    <div className="fixed inset-0 z-50 bg-ink/50 flex items-center justify-center p-4 animate-fade-in">
      <div className="paper-card w-full max-w-xl overflow-hidden max-h-[95dvh] flex flex-col">
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-ink-mute">
              {entry ? "Edit" : "New"}
            </div>
            <h2 className="font-display text-lg font-bold">Client work entry</h2>
          </div>
          <button onClick={onClose} className="btn btn-ghost h-9 w-9 p-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={submit} className="overflow-auto p-4 space-y-3 scroll-lined">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label htmlFor="cb-work-client" className="label">Client *</label>
              <select
                id="cb-work-client"
                required
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="input mt-1"
                disabled={!!entry}
              >
                <option value="">Select client...</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="cb-work-date" className="label">Date *</label>
              <input
                id="cb-work-date"
                type="date"
                required
                value={form.workDate}
                onChange={(e) => setForm({ ...form, workDate: e.target.value })}
                className="input mt-1"
              />
            </div>
            <div>
              <label htmlFor="cb-work-officer" className="label">Officer / Staff *</label>
              <input
                id="cb-work-officer"
                required
                list={staffListId}
                value={form.officer}
                onChange={(e) => setForm({ ...form, officer: e.target.value })}
                className="input mt-1"
                placeholder="Pick or type a name"
              />
              <datalist id={staffListId}>
                {staff.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.title || ""}
                  </option>
                ))}
              </datalist>
              <div className="text-[9px] text-ink-mute mt-0.5">
                {staff.length > 0
                  ? `${staff.length} staff on file · new names save automatically`
                  : "Type a name — it will be added to this client's staff list"}
              </div>
            </div>
            <div className="col-span-2">
              <label htmlFor="cb-work-service" className="label">Product / Service *</label>
              <select
                id="cb-work-service"
                required
                value={form.serviceKey}
                onChange={(e) => handleServiceChange(e.target.value)}
                className="input mt-1"
              >
                <option value="">Select product or service...</option>
                {services.length > 0 && (
                  <optgroup label={`${client?.name || "Client"} services`}>
                    {services.map((s) => (
                      <option key={s.id} value={`service:${s.id}`}>
                        {s.name} · {formatCurrency(s.unitPrice, currency)}/{s.unit}
                      </option>
                    ))}
                  </optgroup>
                )}
                {sellableItems.length > 0 && (
                  <optgroup label="Inventory products">
                    {sellableItems.map((i) => (
                      <option key={i.id} value={`item:${i.id}`}>
                        {i.name} · {formatCurrency(i.price, currency)}/
                        {i.saleUnit || i.baseUnit || "pc"}
                      </option>
                    ))}
                  </optgroup>
                )}
                <option value="custom">＋ Custom product / service...</option>
              </select>
              {isCustomService && (
                <input
                  autoFocus
                  required
                  value={form.serviceName}
                  onChange={(e) =>
                    setForm({ ...form, serviceName: e.target.value })
                  }
                  className="input mt-2"
                  placeholder="Custom product / service name"
                  aria-label="Custom product or service name"
                />
              )}
              {!isCustomService && !noSelection && (
                <div className="text-[9px] text-ink-mute mt-0.5">
                  Unit &amp; price auto-filled from selection. Adjust below if needed.
                </div>
              )}
            </div>
            <div className="col-span-2">
              <label htmlFor="cb-work-description" className="label">Description</label>
              <input
                id="cb-work-description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="input mt-1"
              />
            </div>
            <div>
              <label htmlFor="cb-work-qty" className="label">Quantity *</label>
              <input
                id="cb-work-qty"
                type="number"
                required
                min={0}
                step="any"
                value={form.quantity || ""}
                onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) || 0 })}
                className="input mt-1 num text-right"
                placeholder="0"
              />
            </div>
            <div>
              <label htmlFor="cb-work-unit" className="label">Unit</label>
              <input
                id="cb-work-unit"
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                className="input mt-1"
              />
            </div>
            <div>
              <label htmlFor="cb-work-price" className="label">Unit price *</label>
              <input
                id="cb-work-price"
                type="number"
                required
                min={0}
                step="0.01"
                value={form.unitPrice || ""}
                onChange={(e) => setForm({ ...form, unitPrice: Number(e.target.value) || 0 })}
                className="input mt-1 num text-right"
                placeholder="0"
              />
            </div>
            <div>
              <label htmlFor="cb-work-discount" className="label">Discount</label>
              <input
                id="cb-work-discount"
                type="number"
                min={0}
                step="0.01"
                value={form.discount || ""}
                onChange={(e) => setForm({ ...form, discount: Number(e.target.value) || 0 })}
                className="input mt-1 num text-right"
                placeholder="0"
              />
            </div>
            <div className="col-span-2">
              <label htmlFor="cb-work-docref" className="label">Document reference</label>
              <input
                id="cb-work-docref"
                value={form.documentRef}
                onChange={(e) => setForm({ ...form, documentRef: e.target.value })}
                className="input mt-1"
                placeholder="e.g. bank instruction #"
              />
            </div>
          </div>

          <div className="paper-card p-3 bg-magenta-reg/5 border border-magenta-reg/20">
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold">Line total</span>
              <span className="font-display text-lg font-bold num">
                {formatCurrency(amount, currency)}
              </span>
            </div>
            <div className="text-[10px] text-ink-mute mt-1">
              (Quantity × Unit price) − Discount
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <button type="button" onClick={onClose} className="btn btn-outline">
              Cancel
            </button>
            <button
              type="submit"
              disabled={upsert.isPending || newStaffPending}
              className="btn btn-primary"
            >
              {upsert.isPending || newStaffPending
                ? "Saving..."
                : entry
                ? "Save"
                : "Record"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function GenerateMonthlyNowModal({
  currency,
  onClose,
}: {
  currency: string;
  onClose: () => void;
}) {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const defaultPeriod = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
  const [period, setPeriod] = useState(defaultPeriod);
  const generate = useGenerateMonthlyInvoicesNow();
  const [result, setResult] = useState<GenerateMonthlyInvoicesNowResult | null>(null);

  const label = period
    ? new Date(period + "-01T12:00:00").toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      })
    : "";

  const submit = async () => {
    if (!/^\d{4}-\d{2}$/.test(period)) {
      toast.error("Choose a valid month");
      return;
    }
    try {
      const res = await generate.mutateAsync({ period });
      setResult(res);
      const failed = res.errors?.length ?? 0;
      if (failed > 0 && res.generated === 0) {
        toast.error(
          `${failed} client${failed === 1 ? "" : "s"} could not be billed for ${res.periodLabel}. See details below.`
        );
      } else if (res.generated > 0) {
        toast.success(
          `Generated ${res.generated} invoice${res.generated === 1 ? "" : "s"} for ${res.periodLabel}` +
            (res.skipped > 0 ? ` · ${res.skipped} skipped` : "")
        );
      } else if (res.skipped > 0) {
        toast.info(
          `Nothing new to bill for ${res.periodLabel} — ${res.skipped} client${
            res.skipped === 1 ? " was" : "s were"
          } already invoiced or had no validated work.`
        );
      } else if ((res.existingInvoices ?? 0) > 0) {
        const n = res.existingInvoices ?? 0;
        toast.info(
          `${res.periodLabel} is already invoiced — ${n} existing invoice${
            n === 1 ? "" : "s"
          }. Nothing new to generate.`
        );
      } else if ((res.periodUnvalidated ?? 0) > 0) {
        toast.info(
          `No invoices generated for ${res.periodLabel} — ${res.periodUnvalidated} unbilled entr${
            res.periodUnvalidated === 1 ? "y is" : "ies are"
          } not validated yet. Review the draft under Billing Periods.`
        );
      } else if ((res.periodUnbilled ?? 0) > 0) {
        toast.info(
          `${res.periodUnbilled} unbilled entr${
            res.periodUnbilled === 1 ? "y" : "ies"
          } for ${res.periodLabel} belong to manual-billing or inactive clients. Review them under Billing Periods → Draft.`
        );
      } else {
        toast.info(`No work entries for ${res.periodLabel}.`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink/50 flex items-center justify-center p-4 animate-fade-in">
      <div className="paper-card w-full max-w-lg overflow-hidden max-h-[95dvh] flex flex-col">
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-ink-mute">
              Automatic monthly billing
            </div>
            <h2 className="font-display text-lg font-bold">Generate monthly invoices</h2>
          </div>
          <button onClick={onClose} className="btn btn-ghost h-9 w-9 p-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-auto p-4 space-y-3 scroll-lined">
          <p className="text-xs text-ink-mute">
            This runs the same server-side job that fires automatically at the start of each
            month. It bills every <strong>automatic</strong> client that has validated,
            unbilled work in the selected month. Manual clients are never touched.
          </p>
          <div>
            <label className="text-[11px] uppercase tracking-widest text-ink-mute">Month</label>
            <input
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="input h-9 w-full text-sm mt-1"
            />
            {label && <div className="text-[11px] text-ink-mute mt-1">Billing period: {label}</div>}
          </div>

          {result && (
            <div className="paper-card p-3 space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-success" />
                <span className="font-semibold">{result.periodLabel}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>Generated: <strong>{result.generated}</strong></div>
                <div>Skipped: <strong>{result.skipped}</strong></div>
              </div>
              {result.invoices.length > 0 && (
                <div className="space-y-1">
                  {result.invoices.map((i) => (
                    <div key={i.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{i.client}</span>
                      <span className="font-mono text-[11px]">{i.number}</span>
                      <span>{formatCurrency(i.total, currency)}</span>
                    </div>
                  ))}
                </div>
              )}
              {result.skippedClients.length > 0 && (
                <div className="text-ink-mute space-y-0.5">
                  {result.skippedClients.map((s, idx) => (
                    <div key={idx}>Skipped {s.client}: {s.reason}</div>
                  ))}
                </div>
              )}
              {result.errors.length > 0 && (
                <div className="text-danger-reg space-y-0.5">
                  {result.errors.map((e, idx) => (
                    <div key={idx}>Failed {e.client}: {e.message}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="p-4 border-t flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-outline h-9 text-xs">
            Close
          </button>
          <button
            onClick={submit}
            className="btn btn-primary h-9 text-xs"
            disabled={generate.isPending}
          >
            {generate.isPending ? "Generating…" : "Generate now"}
          </button>
        </div>
      </div>
    </div>
  );
}

function GenerateInvoiceModal({
  client,
  period,
  entries,
  currency,
  onClose,
  actor,
}: {
  client: ClientAccount;
  period: string;
  entries: ClientWorkEntry[];
  currency: string;
  onClose: () => void;
  actor?: { id: string; name: string; role?: string };
}) {
  const validated = entries.filter((e) => e.validated);
  const unvalidated = entries.filter((e) => !e.validated);
  const generate = useGenerateMonthlyInvoice();
  const validate = useValidateClientWorkEntry();
  const total = validated.reduce((s, e) => s + e.amount, 0);
  const label = new Date(period + "-01T12:00:00").toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const [dueDate, setDueDate] = useState<string>("");
  const [otherCharges, setOtherCharges] = useState(0);
  const [notes, setNotes] = useState("");

  const submit = async () => {
    if (validated.length === 0) return toast.error("No validated work entries to bill");
    try {
      const inv = await generate.mutateAsync({
        client,
        billingPeriod: period,
        dueDate: dueDate || null,
        otherCharges,
        notes: notes || null,
        actor,
      });
      toast.success(`Invoice ${inv.number} generated`);
      onClose();
    } catch (err) {
      toast.error(describeError(err));
    }
  };

  const validateAll = async () => {
    try {
      await validate.mutateAsync({
        ids: unvalidated.map((e) => e.id),
        validated: true,
        actor,
      });
      toast.success("Validated all pending entries");
    } catch (err) {
      toast.error(describeError(err));
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink/50 flex items-center justify-center p-4 animate-fade-in">
      <div className="paper-card w-full max-w-2xl overflow-hidden max-h-[95dvh] flex flex-col">
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-ink-mute">
              {client.name}
            </div>
            <h2 className="font-display text-lg font-bold">Review {label} bill</h2>
          </div>
          <button onClick={onClose} className="btn btn-ghost h-9 w-9 p-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-auto p-4 space-y-3 scroll-lined">
          {unvalidated.length > 0 && (
            <div className="paper-card p-3 bg-yellow-reg/5 border border-yellow-reg/30 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-yellow-reg shrink-0 mt-0.5" />
              <div className="flex-1 text-xs">
                <div className="font-semibold">
                  {unvalidated.length} work entries not yet validated
                </div>
                <div className="text-ink-mute mt-0.5">
                  Only validated entries will be included on this invoice.
                </div>
              </div>
              <button onClick={validateAll} className="btn btn-outline h-7 text-[10px]">
                Validate all
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="cb-gen-duedate" className="label">Due date (optional)</label>
              <input
                id="cb-gen-duedate"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="input mt-1"
              />
            </div>
            <div>
              <label htmlFor="cb-gen-charges" className="label">Other charges</label>
              <input
                id="cb-gen-charges"
                type="number"
                min={0}
                step="0.01"
                value={otherCharges || ""}
                onChange={(e) => setOtherCharges(Number(e.target.value) || 0)}
                className="input mt-1 num text-right"
                placeholder="0"
              />
            </div>
            <div className="col-span-2">
              <label htmlFor="cb-gen-notes" className="label">Notes</label>
              <textarea
                id="cb-gen-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="input mt-1 h-16"
              />
            </div>
          </div>

          <div className="border rounded-md overflow-hidden">
            <div className="p-2 bg-paper text-[10px] uppercase tracking-widest text-ink-mute border-b">
              Preview · {validated.length} validated entries
            </div>
            <div className="max-h-64 overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-paper">
                  <tr className="text-left text-[10px] uppercase tracking-widest text-ink-mute">
                    <th className="p-2">Date</th>
                    <th className="p-2">Officer</th>
                    <th className="p-2">Service</th>
                    <th className="p-2 text-right">Qty</th>
                    <th className="p-2 text-right">Unit</th>
                    <th className="p-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {validated.map((e) => (
                    <tr key={e.id} className="border-t">
                      <td className="p-2 text-ink-mute">{formatDate(e.workDate)}</td>
                      <td className="p-2">{e.officer || "—"}</td>
                      <td className="p-2">{e.serviceName}</td>
                      <td className="p-2 text-right num">{e.quantity}</td>
                      <td className="p-2 text-right num">
                        {formatCurrency(e.unitPrice, currency)}
                      </td>
                      <td className="p-2 text-right num font-semibold">
                        {formatCurrency(e.amount, currency)}
                      </td>
                    </tr>
                  ))}
                  {validated.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-ink-mute">
                        No validated entries — validate some first.
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot className="bg-paper/60">
                  <tr className="border-t font-bold">
                    <td colSpan={5} className="p-2 text-right">
                      Grand total
                    </td>
                    <td className="p-2 text-right num">
                      {formatCurrency(total + otherCharges, currency)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
        <div className="p-3 border-t flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-outline">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={generate.isPending || validated.length === 0}
            className="btn btn-primary"
          >
            {generate.isPending ? "Generating..." : "Finalize invoice"}
          </button>
        </div>
      </div>
    </div>
  );
}

function InvoiceViewModal({
  invoice,
  currency,
  canManage,
  onClose,
  onPay,
  onOutstanding,
  actor,
}: {
  invoice: ClientInvoice;
  currency: string;
  canManage: boolean;
  onClose: () => void;
  onPay: () => void;
  onOutstanding: () => void;
  actor?: { id: string; name: string; role?: string };
}) {
  const { data: settings } = useShopSettings();
  const cancel = useCancelClientInvoice();
  const { data: payments = [] } = useClientInvoicePayments({ invoiceId: invoice.id });

  const client = invoice.clientSnapshot || {};
  const words = amountInWords(invoice.total, currency);

  const doPrint = () => window.print();
  const doExport = async () => {
    if (!settings) return toast.error("Shop settings are still loading — try again.");
    try {
      const { downloadClientInvoicePdf } = await import("@/lib/clientInvoicePdf");
      await downloadClientInvoicePdf(invoice, settings, payments, currency);
      toast.success("Invoice PDF downloaded");
    } catch (err) {
      toast.error(describeError(err));
    }
  };
  const doCancel = () => {
    const reason = prompt("Cancellation reason:");
    if (reason === null) return;
    cancel
      .mutateAsync({ id: invoice.id, reason: reason || undefined, actor })
      .then(() => {
        toast.success("Invoice cancelled");
        onClose();
      })
      .catch((err) => toast.error(err.message));
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink/50 flex items-center justify-center p-4 animate-fade-in">
      <div className="paper-card w-full max-w-3xl overflow-hidden max-h-[95dvh] flex flex-col">
        <div className="p-4 border-b flex items-center justify-between no-print">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-ink-mute">
              Invoice · {invoice.invoiceType}
            </div>
            <h2 className="font-display text-lg font-bold">{invoice.number}</h2>
          </div>
          <div className="flex items-center gap-1">
            <StatusPill status={invoice.status} />
            <button onClick={doPrint} className="btn btn-ghost h-9 w-9 p-0" title="Print">
              <Printer className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="btn btn-ghost h-9 w-9 p-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="overflow-auto p-4 md:p-6 scroll-lined" id="client-invoice-print">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="font-display text-xl font-bold">{settings?.shopName || "Shop"}</div>
              <div className="text-xs text-ink-mute mt-1">{settings?.address || ""}</div>
              <div className="text-xs text-ink-mute">
                {settings?.phone || ""} · {settings?.email || ""}
              </div>
            </div>
            <div className="text-right">
              <div className="font-display text-2xl font-bold text-magenta-reg">INVOICE</div>
              <div className="font-mono text-sm mt-1">{invoice.number}</div>
              <div className="text-[10px] text-ink-mute">
                Issued {formatDate(invoice.issueDate)}
              </div>
              {invoice.dueDate && (
                <div className="text-[10px] text-ink-mute">Due {formatDate(invoice.dueDate)}</div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="paper-card p-3">
              <div className="text-[10px] uppercase tracking-widest text-ink-mute mb-1">
                Bill to
              </div>
              <div className="text-sm font-bold">{client.name || invoice.clientName}</div>
              {client.branch && (
                <div className="text-xs text-ink-mute">{client.branch}</div>
              )}
              {client.address && (
                <div className="text-xs text-ink-mute">{client.address}</div>
              )}
              {client.poBox && (
                <div className="text-xs text-ink-mute">{client.poBox}</div>
              )}
              {client.phone && (
                <div className="text-xs text-ink-mute">{client.phone}</div>
              )}
              {client.email && (
                <div className="text-xs text-ink-mute">{client.email}</div>
              )}
              {client.tin && (
                <div className="text-xs text-ink-mute">TIN: {client.tin}</div>
              )}
            </div>
            <div className="paper-card p-3">
              <div className="text-[10px] uppercase tracking-widest text-ink-mute mb-1">
                Billing period
              </div>
              <div className="text-sm font-bold">{invoice.billingPeriodLabel || "—"}</div>
              {invoice.parentInvoiceId && (
                <div className="text-[10px] text-ink-mute mt-1">
                  Outstanding from prior invoice
                </div>
              )}
              <div className="mt-2 text-[10px] uppercase tracking-widest text-ink-mute">
                Prepared by
              </div>
              <div className="text-xs">{invoice.createdByName || "—"}</div>
            </div>
          </div>

          <div className="border rounded-md overflow-hidden mb-4">
            <table className="w-full text-xs">
              <thead className="bg-paper">
                <tr className="text-left text-[10px] uppercase tracking-widest text-ink-mute">
                  <th className="p-2 pl-3">S/N</th>
                  <th className="p-2">Staff / Officer</th>
                  <th className="p-2">Service</th>
                  <th className="p-2 text-right">Qty</th>
                  <th className="p-2 text-right">Unit price</th>
                  <th className="p-2 text-right pr-3">Amount</th>
                </tr>
              </thead>
              <tbody>
                {(invoice.breakdown.length > 0
                  ? invoice.breakdown.map((b, idx) => ({
                      sn: idx + 1,
                      officer: b.officer,
                      service: b.serviceName,
                      qty: b.qty,
                      unit: b.unit,
                      unitPrice: b.unitPrice,
                      amount: b.amount,
                    }))
                  : invoice.lines.map((l, idx) => ({
                      sn: idx + 1,
                      officer: l.officer || "—",
                      service: l.serviceName,
                      qty: l.qty,
                      unit: l.unit,
                      unitPrice: l.unitPrice,
                      amount: l.amount,
                    }))
                ).map((r) => (
                  <tr key={r.sn} className="border-t">
                    <td className="p-2 pl-3">{r.sn}</td>
                    <td className="p-2">{r.officer}</td>
                    <td className="p-2">{r.service}</td>
                    <td className="p-2 text-right num">
                      {r.qty} {r.unit || ""}
                    </td>
                    <td className="p-2 text-right num">
                      {formatCurrency(r.unitPrice, currency)}
                    </td>
                    <td className="p-2 pr-3 text-right num font-semibold">
                      {formatCurrency(r.amount, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-paper/60">
                <tr className="border-t">
                  <td colSpan={5} className="p-2 pl-3 text-right text-xs">
                    Subtotal
                  </td>
                  <td className="p-2 pr-3 text-right num">
                    {formatCurrency(invoice.subtotal, currency)}
                  </td>
                </tr>
                {invoice.discount > 0 && (
                  <tr>
                    <td colSpan={5} className="p-2 pl-3 text-right text-xs">
                      Discount
                    </td>
                    <td className="p-2 pr-3 text-right num text-danger">
                      −{formatCurrency(invoice.discount, currency)}
                    </td>
                  </tr>
                )}
                {invoice.otherCharges > 0 && (
                  <tr>
                    <td colSpan={5} className="p-2 pl-3 text-right text-xs">
                      Other charges
                    </td>
                    <td className="p-2 pr-3 text-right num">
                      {formatCurrency(invoice.otherCharges, currency)}
                    </td>
                  </tr>
                )}
                {invoice.tax > 0 && (
                  <tr>
                    <td colSpan={5} className="p-2 pl-3 text-right text-xs">
                      Tax
                    </td>
                    <td className="p-2 pr-3 text-right num">
                      {formatCurrency(invoice.tax, currency)}
                    </td>
                  </tr>
                )}
                <tr className="border-t bg-magenta-reg/5 font-bold">
                  <td colSpan={5} className="p-3 pl-3 text-right">
                    GRAND TOTAL
                  </td>
                  <td className="p-3 pr-3 text-right num text-magenta-reg">
                    {formatCurrency(invoice.total, currency)}
                  </td>
                </tr>
                {invoice.amountPaid > 0 && (
                  <>
                    <tr>
                      <td colSpan={5} className="p-2 pl-3 text-right text-xs">
                        Amount paid
                      </td>
                      <td className="p-2 pr-3 text-right num text-success">
                        {formatCurrency(invoice.amountPaid, currency)}
                      </td>
                    </tr>
                    <tr className="font-bold border-t">
                      <td colSpan={5} className="p-2 pl-3 text-right">
                        Outstanding balance
                      </td>
                      <td className="p-2 pr-3 text-right num text-danger">
                        {formatCurrency(invoice.amountDue, currency)}
                      </td>
                    </tr>
                  </>
                )}
              </tfoot>
            </table>
          </div>

          <div className="paper-card p-3 mb-4">
            <div className="text-[10px] uppercase tracking-widest text-ink-mute mb-1">
              Amount in words
            </div>
            <div className="text-sm italic font-semibold">{words}</div>
          </div>

          {invoice.paymentDetails && (
            <div className="paper-card p-3 mb-4">
              <div className="text-[10px] uppercase tracking-widest text-ink-mute mb-2">
                Payment details
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {invoice.paymentDetails.bankName && (
                  <div>
                    <span className="text-ink-mute">Bank:</span>{" "}
                    <span className="font-semibold">{invoice.paymentDetails.bankName}</span>
                  </div>
                )}
                {invoice.paymentDetails.accountName && (
                  <div>
                    <span className="text-ink-mute">Account name:</span>{" "}
                    <span className="font-semibold">{invoice.paymentDetails.accountName}</span>
                  </div>
                )}
                {invoice.paymentDetails.accountNumber && (
                  <div>
                    <span className="text-ink-mute">Account number:</span>{" "}
                    <span className="font-semibold num">
                      {invoice.paymentDetails.accountNumber}
                    </span>
                  </div>
                )}
                {invoice.paymentDetails.branch && (
                  <div>
                    <span className="text-ink-mute">Branch:</span>{" "}
                    <span className="font-semibold">{invoice.paymentDetails.branch}</span>
                  </div>
                )}
                {invoice.paymentDetails.momo && (
                  <div className="col-span-2">
                    <span className="text-ink-mute">Mobile Money:</span>{" "}
                    <span className="font-semibold">{invoice.paymentDetails.momo}</span>
                  </div>
                )}
                {invoice.paymentDetails.instructions && (
                  <div className="col-span-2 text-ink-mute mt-1">
                    {invoice.paymentDetails.instructions}
                  </div>
                )}
              </div>
            </div>
          )}

          {invoice.notes && (
            <div className="text-xs text-ink-mute">{invoice.notes}</div>
          )}

          {payments.length > 0 && (
            <div className="border-t mt-4 pt-3">
              <div className="text-[10px] uppercase tracking-widest text-ink-mute mb-2">
                Payment history
              </div>
              <div className="divide-y text-xs">
                {payments.map((p) => (
                  <div
                    key={p.id}
                    className={cn(
                      "py-1.5 flex justify-between",
                      p.cancelled && "line-through opacity-50"
                    )}
                  >
                    <div>
                      <span className="font-mono">{p.number}</span>{" "}
                      <span className="text-ink-mute">
                        · {formatDate(p.paymentDate)} · {p.paymentMethod}
                      </span>
                    </div>
                    <span className="num font-semibold">
                      {formatCurrency(p.amount, currency)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {invoice.status === "paid" && (
            <div className="mt-4 paper-card p-3 bg-success/10 border border-success/30 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-success" />
              <div className="text-xs">
                <div className="font-semibold text-success">Fully paid — receipt issued</div>
                <div className="text-ink-mute">
                  This invoice's balance has been cleared.
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-3 border-t flex flex-wrap justify-end gap-2 no-print">
          {canManage && invoice.status !== "cancelled" && invoice.amountPaid === 0 && (
            <button onClick={doCancel} className="btn btn-ghost text-danger">
              Cancel invoice
            </button>
          )}
          {canManage &&
            invoice.status !== "cancelled" &&
            invoice.amountDue > 0 &&
            invoice.invoiceType === "monthly" && (
              <button onClick={onOutstanding} className="btn btn-outline">
                Generate outstanding invoice
              </button>
            )}
          <button onClick={doExport} className="btn btn-outline">
            Download
          </button>
          {canManage && invoice.amountDue > 0 && invoice.status !== "cancelled" && (
            <button onClick={onPay} className="btn btn-primary">
              Record payment
            </button>
          )}
          <button onClick={onClose} className="btn btn-outline">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function PaymentModal({
  invoice,
  currency,
  onClose,
  actor,
}: {
  invoice: ClientInvoice;
  currency: string;
  onClose: () => void;
  actor?: { id: string; name: string; role?: string };
}) {
  const record = useRecordClientPayment();
  const [amount, setAmount] = useState(invoice.amountDue);
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amount <= 0) return toast.error("Amount must be > 0");
    if (amount > invoice.amountDue + 0.01)
      return toast.error("Cannot exceed outstanding balance");
    try {
      const result = await record.mutateAsync({
        invoiceId: invoice.id,
        paymentDate,
        amount,
        paymentMethod: method,
        reference: reference || null,
        notes: notes || null,
        actor,
      });
      if (result.fullyPaid) {
        toast.success(
          `Fully paid — receipt ${result.payment.number} issued`
        );
      } else {
        toast.success(
          `Payment recorded · new balance ${formatCurrency(result.newDue, currency)}`
        );
      }
      onClose();
    } catch (err) {
      toast.error(describeError(err));
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink/50 flex items-center justify-center p-4 animate-fade-in">
      <div className="paper-card w-full max-w-md overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-ink-mute">
              Invoice {invoice.number}
            </div>
            <h2 className="font-display text-lg font-bold">Record payment</h2>
          </div>
          <button onClick={onClose} className="btn btn-ghost h-9 w-9 p-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={submit} className="p-4 space-y-3">
          <div className="paper-card p-3 bg-paper/60">
            <div className="flex justify-between text-xs">
              <span className="text-ink-mute">Invoice total</span>
              <span className="num font-semibold">
                {formatCurrency(invoice.total, currency)}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-ink-mute">Previously paid</span>
              <span className="num text-success">
                {formatCurrency(invoice.amountPaid, currency)}
              </span>
            </div>
            <div className="flex justify-between text-sm font-bold border-t mt-1 pt-1">
              <span>Outstanding</span>
              <span className="num text-danger">
                {formatCurrency(invoice.amountDue, currency)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="cb-pay-amount" className="label">Amount *</label>
              <input
                id="cb-pay-amount"
                type="number"
                required
                min={0}
                max={invoice.amountDue}
                step="0.01"
                value={amount || ""}
                onChange={(e) => setAmount(Number(e.target.value) || 0)}
                className="input mt-1 num text-right"
                placeholder="0"
              />
            </div>
            <div>
              <label htmlFor="cb-pay-date" className="label">Date *</label>
              <input
                id="cb-pay-date"
                type="date"
                required
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="input mt-1"
              />
            </div>
            <div>
              <label htmlFor="cb-pay-method" className="label">Method</label>
              <select
                id="cb-pay-method"
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                className="input mt-1"
              >
                <option value="cash">Cash</option>
                <option value="transfer">Bank transfer</option>
                <option value="card">Card</option>
              </select>
            </div>
            <div>
              <label htmlFor="cb-pay-ref" className="label">Reference</label>
              <input
                id="cb-pay-ref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="input mt-1"
              />
            </div>
            <div className="col-span-2">
              <label htmlFor="cb-pay-notes" className="label">Notes</label>
              <textarea
                id="cb-pay-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="input mt-1 h-16"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <button type="button" onClick={onClose} className="btn btn-outline">
              Cancel
            </button>
            <button type="submit" disabled={record.isPending} className="btn btn-primary">
              {record.isPending ? "Saving..." : "Record payment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function OutstandingInvoiceModal({
  parent,
  currency,
  onClose,
  actor,
}: {
  parent: ClientInvoice;
  currency: string;
  onClose: () => void;
  actor?: { id: string; name: string; role?: string };
}) {
  const generate = useGenerateOutstandingInvoice();
  const [amount, setAmount] = useState(parent.amountDue);
  const [dueDate, setDueDate] = useState<string>("");
  const [notes, setNotes] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amount <= 0) return toast.error("Amount must be > 0");
    try {
      const inv = await generate.mutateAsync({
        parentInvoiceId: parent.id,
        amount,
        dueDate: dueDate || null,
        notes: notes || null,
        actor,
      });
      toast.success(`Outstanding invoice ${inv.number} generated`);
      onClose();
    } catch (err) {
      toast.error(describeError(err));
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink/50 flex items-center justify-center p-4 animate-fade-in">
      <div className="paper-card w-full max-w-md overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-ink-mute">
              From invoice {parent.number}
            </div>
            <h2 className="font-display text-lg font-bold">Outstanding balance invoice</h2>
          </div>
          <button onClick={onClose} className="btn btn-ghost h-9 w-9 p-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={submit} className="p-4 space-y-3">
          <div className="paper-card p-3 bg-cyan-reg/5 border border-cyan-reg/30 text-xs">
            This creates a NEW independent invoice referencing invoice{" "}
            <span className="font-mono">{parent.number}</span>. The original invoice remains
            unchanged.
          </div>

          <div>
            <label htmlFor="cb-out-amount" className="label">Amount to bill *</label>
            <input
              id="cb-out-amount"
              type="number"
              required
              min={0}
              max={parent.amountDue}
              step="0.01"
              value={amount || ""}
              onChange={(e) => setAmount(Number(e.target.value) || 0)}
              className="input mt-1 num text-right"
              placeholder="0"
            />
            <div className="text-[10px] text-ink-mute mt-1">
              Original outstanding: {formatCurrency(parent.amountDue, currency)}
            </div>
          </div>

          <div>
            <label htmlFor="cb-out-duedate" className="label">Due date</label>
            <input
              id="cb-out-duedate"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="input mt-1"
            />
          </div>

          <div>
            <label htmlFor="cb-out-notes" className="label">Notes</label>
            <textarea
              id="cb-out-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input mt-1 h-16"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <button type="button" onClick={onClose} className="btn btn-outline">
              Cancel
            </button>
            <button type="submit" disabled={generate.isPending} className="btn btn-primary">
              {generate.isPending ? "Generating..." : "Generate"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ClientDetailModal({
  client,
  currency,
  onClose,
  onOpenInvoice,
}: {
  client: ClientAccount;
  currency: string;
  onClose: () => void;
  onOpenInvoice: (inv: ClientInvoice) => void;
}) {
  const { data: invoices = [] } = useClientInvoices({ clientId: client.id });
  const { data: payments = [] } = useClientInvoicePayments({ clientId: client.id });
  const active = invoices.filter((i) => i.status !== "cancelled");
  const outstanding = active.reduce((s, i) => s + i.amountDue, 0);
  const paid = active.reduce((s, i) => s + i.amountPaid, 0);
  const billed = active.reduce((s, i) => s + i.total, 0);

  return (
    <div className="fixed inset-0 z-50 bg-ink/50 flex items-center justify-center p-4 animate-fade-in">
      <div className="paper-card w-full max-w-3xl overflow-hidden max-h-[95dvh] flex flex-col">
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-ink-mute">
              Client statement
            </div>
            <h2 className="font-display text-lg font-bold flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              {client.name}
            </h2>
          </div>
          <button onClick={onClose} className="btn btn-ghost h-9 w-9 p-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-auto p-4 space-y-3 scroll-lined">
          <div className="grid grid-cols-3 gap-3">
            <Kpi label="Total billed" value={formatCurrency(billed, currency)} />
            <Kpi label="Total paid" value={formatCurrency(paid, currency)} tone="success" />
            <Kpi
              label="Outstanding"
              value={formatCurrency(outstanding, currency)}
              tone={outstanding > 0 ? "danger" : undefined}
            />
          </div>

          <div className="border rounded-md overflow-hidden">
            <div className="p-2 bg-paper text-[10px] uppercase tracking-widest text-ink-mute border-b">
              Complete account history
            </div>
            <div className="max-h-80 overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-paper sticky top-0">
                  <tr className="text-left text-[10px] uppercase tracking-widest text-ink-mute">
                    <th className="p-2 pl-3">Date</th>
                    <th className="p-2">Type</th>
                    <th className="p-2">Reference</th>
                    <th className="p-2 text-right">Debit</th>
                    <th className="p-2 text-right">Credit</th>
                    <th className="p-2 pr-3 text-right">Running</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    type Row = {
                      date: string;
                      kind: string;
                      ref: string;
                      debit: number;
                      credit: number;
                      inv?: ClientInvoice;
                    };
                    const rows: Row[] = [
                      ...active.map(
                        (i): Row => ({
                          date: i.issueDate,
                          kind: i.invoiceType,
                          ref: i.number,
                          debit: i.total,
                          credit: 0,
                          inv: i,
                        })
                      ),
                      ...payments
                        .filter((p) => !p.cancelled)
                        .map(
                          (p): Row => ({
                            date: p.paymentDate,
                            kind: "payment",
                            ref: p.number,
                            debit: 0,
                            credit: Number(p.amount),
                          })
                        ),
                    ].sort((a, b) => a.date.localeCompare(b.date));
                    let running = 0;
                    return rows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-ink-mute">
                          No activity.
                        </td>
                      </tr>
                    ) : (
                      rows.map((r, idx) => {
                        running += r.debit - r.credit;
                        return (
                          <tr key={idx} className="border-t hover:bg-paper/40">
                            <td className="p-2 pl-3 text-ink-mute">{formatDate(r.date)}</td>
                            <td className="p-2">
                              <span className="chip text-[9px] uppercase">{r.kind}</span>
                            </td>
                            <td className="p-2 font-mono">
                              {r.inv ? (
                                <button
                                  onClick={() => r.inv && onOpenInvoice(r.inv)}
                                  className="hover:underline"
                                >
                                  {r.ref}
                                </button>
                              ) : (
                                r.ref
                              )}
                            </td>
                            <td className="p-2 text-right num">
                              {r.debit > 0 ? formatCurrency(r.debit, currency) : "—"}
                            </td>
                            <td className="p-2 text-right num text-success">
                              {r.credit > 0 ? formatCurrency(r.credit, currency) : "—"}
                            </td>
                            <td className="p-2 pr-3 text-right num font-semibold">
                              {formatCurrency(running, currency)}
                            </td>
                          </tr>
                        );
                      })
                    );
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="p-3 border-t flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-outline">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
