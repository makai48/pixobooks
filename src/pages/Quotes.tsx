import { useMemo, useState } from "react";
import {
  Plus,
  Search,
  FileText,
  Trash2,
  Edit3,
  ArrowRight,
  Check,
  ClipboardList,
  ShoppingCart,
  LayoutDashboard,
  PauseCircle,
  Receipt,
} from "lucide-react";
import SubNav from "@/components/layout/SubNav";
import { toast } from "sonner";
import {
  useQuotes,
  useDeleteQuote,
  useUpdateQuoteStatus,
} from "@/hooks/useQuotes";
import { useShopSettings } from "@/hooks/useShopSettings";
import { useAuth } from "@/hooks/useAuth";
import { useCompleteSale } from "@/hooks/useSales";
import { useItems } from "@/hooks/useItems";
import QuoteModal from "@/components/features/quotes/QuoteModal";
import GlassSelect from "@/components/ui/GlassSelect";
import ProformaPreviewModal from "@/components/features/quotes/ProformaPreviewModal";
import type { Quote, QuoteStatus } from "@/types";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import MoneyText from "@/components/ui/MoneyText";

const STATUS_COLORS: Record<QuoteStatus, string> = {
  draft: "bg-ink/5 text-ink-soft",
  sent: "bg-cyan-reg/10 text-cyan-reg border border-cyan-reg/30",
  accepted: "bg-success/10 text-success border border-success/30",
  rejected: "bg-danger/10 text-danger border border-danger/30",
  proforma: "bg-yellow-reg/10 text-yellow-reg border border-yellow-reg/30",
  ordered: "bg-magenta-reg/10 text-magenta-reg border border-magenta-reg/30",
  converted: "bg-ink/10 text-ink border border-ink/30",
};

export default function Quotes() {
  const { can, profile, isOwner, isAppOwner } = useAuth();
  const canDeleteQuote =
    isOwner || isAppOwner || (profile?.role || "").toLowerCase() === "admin";
  const { data: quotes = [], isLoading } = useQuotes();
  const { data: settings } = useShopSettings();
  const { data: items = [] } = useItems();
  const del = useDeleteQuote();
  const updStatus = useUpdateQuoteStatus();
  const completeSale = useCompleteSale();

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | QuoteStatus>("all");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Quote | null>(null);
  const [proforma, setProforma] = useState<Quote | null>(null);

  const filtered = useMemo(
    () =>
      quotes.filter((qu) => {
        if (status !== "all" && qu.status !== status) return false;
        if (q) {
          const query = q.toLowerCase();
          return (
            qu.number.toLowerCase().includes(query) ||
            (qu.customerName || "").toLowerCase().includes(query) ||
            (qu.notes || "").toLowerCase().includes(query)
          );
        }
        return true;
      }),
    [quotes, q, status]
  );

  const summary = useMemo(() => {
    const active = quotes.filter((q) => ["draft", "sent"].includes(q.status));
    const pipeline = active.reduce((s, x) => s + x.total, 0);
    return {
      draft: quotes.filter((q) => q.status === "draft").length,
      sent: quotes.filter((q) => q.status === "sent").length,
      accepted: quotes.filter((q) => q.status === "accepted").length,
      proforma: quotes.filter((q) => q.status === "proforma").length,
      ordered: quotes.filter((q) => q.status === "ordered").length,
      pipeline,
    };
  }, [quotes]);

  /** Convert a quote (typically one already in the proforma stage) into
   *  a real credit sale. This is the ONLY path that produces a credit
   *  transaction. Marks the quote as `ordered`. */
  const markOrdered = async (quote: Quote) => {
    if (!settings) return;
    if (
      !confirm(
        `Mark ${quote.number} as Ordered? This creates a real credit invoice and reserves stock.`
      )
    )
      return;
    try {
      const sale = await completeSale.mutateAsync({
        lines: quote.lines,
        customerId: quote.customerId || null,
        customerName: quote.customerName || "Walk-in Customer",
        orderDiscountPct: 0,
        paymentMethod: quote.customerId ? "credit" : "cash",
        cashierId: profile?.id || null,
        cashierName: profile?.name || "Unknown",
        items,
        settings,
      });
      updStatus.mutate({ id: quote.id, status: "ordered", convertedSaleId: sale.id });
      toast.success(`Ordered. Invoice ${sale.number} generated.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Order failed");
    }
  };

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
      <div className="grid grid-cols-3 md:grid-cols-5 gap-1.5 md:gap-3">
        <Stat label="Drafts" value={String(summary.draft)} />
        <Stat label="Sent" value={String(summary.sent)} />
        <Stat label="Accepted" value={String(summary.accepted)} tone="success" />
        <Stat label="Proformas" value={String(summary.proforma)} tone="warning" />
        <Stat
          label="Pipeline value"
          value={formatCurrency(summary.pipeline, settings?.currency)}
          fullValue={formatCurrency(summary.pipeline, settings?.currency)}
          tone="magenta"
        />
      </div>

      <div className="paper-card p-2.5 md:p-4 flex flex-wrap items-center gap-x-1.5 gap-y-1.5 md:gap-3">
        <div className="relative flex-1 min-w-[130px]">
          <Search className="w-3.5 h-3.5 md:w-4 md:h-4 absolute left-2 md:left-3 top-1/2 -translate-y-1/2 text-ink-mute pointer-events-none" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search number, customer or notes"
            className="input input-sm pl-7 md:pl-9"
          />
        </div>
        <GlassSelect
          id="quote-status-filter"
          value={status}
          onChange={(v) => setStatus(v as typeof status)}
          ariaLabel="Filter by status"
          options={[
            { value: "all", label: "All statuses" },
            { value: "draft", label: "Draft" },
            { value: "sent", label: "Sent" },
            { value: "accepted", label: "Accepted" },
            { value: "rejected", label: "Rejected" },
            { value: "proforma", label: "Proforma" },
            { value: "ordered", label: "Ordered" },
            { value: "converted", label: "Converted" },
          ]}
          className="input input-sm select-glass min-w-0 max-md:px-1.5 md:hidden"
        />
        <div className="hidden md:flex bg-paper border rounded-md p-0.5 overflow-auto">
          {(
            [
              "all",
              "draft",
              "sent",
              "accepted",
              "rejected",
              "proforma",
              "ordered",
              "converted",
            ] as const
          ).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={cn(
                "px-3 h-8 text-xs uppercase tracking-widest rounded whitespace-nowrap",
                status === s ? "bg-ink text-paper" : "text-ink-mute"
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="hidden sm:flex items-center gap-1 text-[10px] md:text-xs text-ink-mute shrink-0">
          <FileText className="w-3 h-3 md:w-3.5 md:h-3.5" />
          {filtered.length} of {quotes.length}
        </div>
        {can("quotes.manage") && (
          <button
            onClick={() => {
              setEdit(null);
              setOpen(true);
            }}
            className="btn btn-primary btn-sm shrink-0"
          >
            <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" />
            <span className="hidden sm:inline">New quote</span>
            <span className="sm:hidden">New</span>
          </button>
        )}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-[10px] md:text-xs text-ink-mute inline-flex items-center gap-1.5 md:gap-2">
          <FileText className="w-3 h-3 md:w-3.5 md:h-3.5 shrink-0" />
          {filtered.length} of {quotes.length}{" "}
          <span className="md:hidden">quotes · tap for details</span>
          <span className="hidden md:inline">
            quotes · tap any card to manage
          </span>
        </div>
      </div>

      {isLoading ? (
        <div className="paper-card p-6 md:p-10 text-center text-ink-mute text-sm">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="paper-card p-8 md:p-12 text-center">
          <FileText className="w-8 h-8 md:w-10 md:h-10 text-ink-mute mx-auto" />
          <div className="font-display font-bold text-base md:text-lg mt-2 md:mt-3">No quotes</div>
          <div className="text-ink-mute text-[11px] md:text-sm mt-1">
             Create quotes for large jobs and convert accepted ones into
            proforma invoices or sales.
          </div>
        </div>
      ) : (
        <>
        <div className="hidden md:grid gap-2 md:gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((qu) => (
            <div key={qu.id} className="paper-card p-2.5 md:p-4 flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[9px] md:text-[11px] uppercase tracking-wide md:tracking-widest text-ink-mute truncate">
                    {formatDate(qu.createdAt)} · {qu.createdByName}
                  </div>
                  <div className="font-display text-sm md:text-lg font-bold leading-tight truncate">{qu.number}</div>
                  <div className="text-[10px] md:text-sm text-ink-mute truncate">
                    {qu.customerName || "Walk-in"}
                  </div>
                </div>
                <span className={cn("chip text-[8px] md:text-[10px] px-1.5 md:px-2 py-px shrink-0", STATUS_COLORS[qu.status])}>
                  {qu.status}
                </span>
              </div>

              <div className="dashed-divider my-1.5 md:my-3" />
              <div className="text-[10px] md:text-sm space-y-0.5 md:space-y-1 max-h-16 md:max-h-24 overflow-auto">
                {qu.lines.slice(0, 3).map((l) => (
                  <div key={l.itemId} className="flex justify-between gap-2">
                    <span className="truncate pr-2">
                      {l.qty}× {l.name}
                    </span>
                    <span className="num text-ink-mute shrink-0">
                      <MoneyText value={formatCurrency(l.qty * l.unitPrice, settings?.currency)} />
                    </span>
                  </div>
                ))}
                {qu.lines.length > 3 && (
                  <div className="text-[10px] text-ink-mute">
                    + {qu.lines.length - 3} more
                  </div>
                )}
              </div>
              <div className="dashed-divider my-1.5 md:my-3" />
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] md:text-xs text-ink-mute">Total</span>
                <span className="num font-bold text-sm md:text-lg">
                  <MoneyText value={formatCurrency(qu.total, settings?.currency)} />
                </span>
              </div>

              <div className="mt-auto pt-2 flex flex-wrap gap-1">
                {can("quotes.manage") &&
                  qu.status !== "converted" &&
                  qu.status !== "ordered" && (
                    <>
                      <button
                        onClick={() => {
                          setEdit(qu);
                          setOpen(true);
                        }}
                        className="btn btn-outline btn-sm flex-1"
                      >
                        <Edit3 className="w-3.5 h-3.5" /> Edit
                      </button>
                      {qu.status === "draft" && (
                        <button
                          onClick={() =>
                            updStatus.mutate(
                              { id: qu.id, status: "sent" },
                              { onSuccess: () => toast.success("Marked sent") }
                            )
                          }
                          className="btn btn-outline btn-sm flex-1"
                        >
                          Send
                        </button>
                      )}
                      {qu.status === "sent" && (
                        <button
                          onClick={() =>
                            updStatus.mutate(
                              { id: qu.id, status: "accepted" },
                              { onSuccess: () => toast.success("Accepted") }
                            )
                          }
                          className="btn btn-outline btn-sm flex-1"
                        >
                          <Check className="w-3.5 h-3.5" /> Accept
                        </button>
                      )}
                      <button
                        onClick={() => setProforma(qu)}
                        className="btn btn-outline btn-sm flex-1"
                        title="Preview, print or download as Proforma Invoice"
                      >
                        <ClipboardList className="w-3.5 h-3.5" /> Proforma
                      </button>
                      {["accepted", "sent", "proforma"].includes(qu.status) && (
                        <button
                          onClick={() => markOrdered(qu)}
                          className="btn btn-primary btn-sm flex-1"
                          disabled={completeSale.isPending}
                          title="Mark as ordered — creates credit invoice"
                        >
                          <ShoppingCart className="w-3.5 h-3.5" /> Order
                        </button>
                      )}
                      {qu.status !== "proforma" && qu.status === "accepted" && (
                        <button
                          onClick={() => {
                            if (!settings) return;
                            if (!confirm(`Convert quote ${qu.number} directly into a cash sale?`)) return;
                            completeSale.mutate(
                              {
                                lines: qu.lines,
                                customerId: qu.customerId || null,
                                customerName:
                                  qu.customerName || "Walk-in Customer",
                                orderDiscountPct: 0,
                                paymentMethod: "cash",
                                cashierId: profile?.id || null,
                                cashierName: profile?.name || "Unknown",
                                items,
                                settings,
                              },
                              {
                                onSuccess: (sale) => {
                                  updStatus.mutate({
                                    id: qu.id,
                                    status: "converted",
                                    convertedSaleId: sale.id,
                                  });
                                  toast.success(
                                    `Converted to sale ${sale.number}`
                                  );
                                },
                                onError: (e) =>
                                  toast.error(
                                    e instanceof Error
                                      ? e.message
                                      : "Convert failed"
                                  ),
                              }
                            );
                          }}
                          className="btn btn-ghost btn-sm flex-1"
                          disabled={completeSale.isPending}
                        >
                          <ArrowRight className="w-3.5 h-3.5" /> Cash sale
                        </button>
                      )}
                      {canDeleteQuote && (
                        <button
                          onClick={() =>
                            confirm(
                              `Delete quote ${qu.number}? Only Admins/Admin can perform this. A permanent audit record will be kept.`
                            ) &&
                            del.mutate(qu.id, {
                              onSuccess: () =>
                                toast.success("Quote deleted (audit logged)"),
                              onError: (e) =>
                                toast.error(
                                  e instanceof Error
                                    ? e.message
                                    : "Only admins can delete quotes"
                                ),
                            })
                          }
                          className="btn btn-ghost btn-sm w-7 md:w-9 px-0 md:p-0 text-danger shrink-0"
                          title="Delete quote (Admin only)"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </>
                  )}

                {/* Ordered / Converted read-only summary */}
                {(qu.status === "ordered" || qu.status === "converted") &&
                  canDeleteQuote && (
                    <button
                      onClick={() =>
                        confirm(
                          `Delete ${qu.number}? Only Admins/Admin can perform this. A permanent audit record will be kept.`
                        ) &&
                        del.mutate(qu.id, {
                          onSuccess: () =>
                            toast.success("Deleted (audit logged)"),
                          onError: (e) =>
                            toast.error(
                              e instanceof Error
                                ? e.message
                                : "Only admins can delete quotes"
                            ),
                        })
                      }
                      className="btn btn-ghost btn-sm w-7 md:w-9 px-0 md:p-0 text-danger ml-auto"
                      title="Delete (Admin only)"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
              </div>
            </div>
          ))}
        </div>

        {/* Mobile ledger — one dense row per quote, pinned height */}
        <div className="md:hidden paper-card overflow-hidden">
          <div className="divide-y">
            {filtered.map((qu) => (
              <div key={qu.id} className="flex items-center h-[30px] text-[11px] leading-tight">
                <button
                  onClick={() => {
                    if (!can("quotes.manage")) return;
                    setEdit(qu);
                    setOpen(true);
                  }}
                  className="flex-1 h-full flex items-center gap-1.5 px-2 min-w-0 text-left hover:bg-paper/50 transition"
                  title={`${qu.number} · ${qu.customerName || "Walk-in"}`}
                >
                  <span
                    className={cn(
                      "shrink-0 w-[42px] text-center rounded-full border px-1 py-px text-[8px] uppercase tracking-wide font-bold leading-none truncate",
                      STATUS_COLORS[qu.status]
                    )}
                  >
                    {qu.status}
                  </span>
                  <span className="flex-1 min-w-0 truncate">
                    <span className="font-semibold">{qu.number}</span>
                    <span className="text-ink-mute"> · {qu.customerName || "Walk-in"}</span>
                  </span>
                  <span className="num font-bold shrink-0">
                    <MoneyText value={formatCurrency(qu.total, settings?.currency)} />
                  </span>
                </button>
              </div>
            ))}
          </div>
        </div>
        </>
      )}

      {open && <QuoteModal quote={edit} onClose={() => setOpen(false)} />}
      {proforma && (
        <ProformaPreviewModal
          quote={proforma}
          onClose={() => setProforma(null)}
        />
      )}
    </div>
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
  tone?: "success" | "magenta" | "warning";
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
            : "text-[12px] md:text-2xl",
          tone === "success" && "text-success",
          tone === "magenta" && "text-magenta-reg",
          tone === "warning" && "text-warning"
        )}
      >
        {showFull && fullValue ? <MoneyText value={fullValue} /> : <MoneyText value={value} />}
      </div>
    </div>
  );
}
