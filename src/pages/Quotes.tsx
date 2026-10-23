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
import ProformaPreviewModal from "@/components/features/quotes/ProformaPreviewModal";
import type { Quote, QuoteStatus } from "@/types";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

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
    <div className="p-6 space-y-4">
      <SubNav
        items={[
          { to: "/", label: "POS", icon: LayoutDashboard, end: true },
          { to: "/sales-report", label: "Report", icon: Receipt },
          { to: "/held", label: "Held Tickets", icon: PauseCircle },
          { to: "/quotes", label: "Quotes", icon: FileText },
        ]}
      />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Drafts" value={String(summary.draft)} />
        <Stat label="Sent" value={String(summary.sent)} />
        <Stat label="Accepted" value={String(summary.accepted)} tone="success" />
        <Stat label="Proformas" value={String(summary.proforma)} tone="warning" />
        <Stat
          label="Pipeline value"
          value={formatCurrency(summary.pipeline, settings?.currency)}
          tone="magenta"
        />
      </div>

      <div className="paper-card p-4 flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search number, customer or notes"
            className="input pl-9"
          />
        </div>
        <div className="flex bg-paper border rounded-md p-0.5 overflow-auto">
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
        {can("quotes.manage") && (
          <button
            onClick={() => {
              setEdit(null);
              setOpen(true);
            }}
            className="btn btn-primary"
          >
            <Plus className="w-4 h-4" /> New quote
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="paper-card p-10 text-center text-ink-mute">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="paper-card p-12 text-center">
          <FileText className="w-10 h-10 text-ink-mute mx-auto" />
          <div className="font-display font-bold text-lg mt-3">No quotes</div>
          <div className="text-ink-mute text-sm mt-1">
            Create quotes for large print jobs and convert accepted ones into
            proforma invoices or sales.
          </div>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((qu) => (
            <div key={qu.id} className="paper-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-widest text-ink-mute">
                    {formatDate(qu.createdAt)} · {qu.createdByName}
                  </div>
                  <div className="font-display text-lg font-bold">{qu.number}</div>
                  <div className="text-sm text-ink-mute truncate">
                    {qu.customerName || "Walk-in"}
                  </div>
                </div>
                <span className={cn("chip", STATUS_COLORS[qu.status])}>
                  {qu.status}
                </span>
              </div>

              <div className="dashed-divider my-3" />
              <div className="text-sm space-y-1 max-h-24 overflow-auto">
                {qu.lines.slice(0, 3).map((l) => (
                  <div key={l.itemId} className="flex justify-between">
                    <span className="truncate pr-2">
                      {l.qty}× {l.name}
                    </span>
                    <span className="num text-ink-mute">
                      {formatCurrency(l.qty * l.unitPrice, settings?.currency)}
                    </span>
                  </div>
                ))}
                {qu.lines.length > 3 && (
                  <div className="text-xs text-ink-mute">
                    + {qu.lines.length - 3} more
                  </div>
                )}
              </div>
              <div className="dashed-divider my-3" />
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-ink-mute">Total</span>
                <span className="num font-bold text-lg">
                  {formatCurrency(qu.total, settings?.currency)}
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {can("quotes.manage") &&
                  qu.status !== "converted" &&
                  qu.status !== "ordered" && (
                    <>
                      <button
                        onClick={() => {
                          setEdit(qu);
                          setOpen(true);
                        }}
                        className="btn btn-outline h-9"
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
                          className="btn btn-outline h-9"
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
                          className="btn btn-outline h-9"
                        >
                          <Check className="w-3.5 h-3.5" /> Accept
                        </button>
                      )}
                      <button
                        onClick={() => setProforma(qu)}
                        className="btn btn-outline h-9"
                        title="Preview, print or download as Proforma Invoice"
                      >
                        <ClipboardList className="w-3.5 h-3.5" /> Proforma
                      </button>
                      {["accepted", "sent", "proforma"].includes(qu.status) && (
                        <button
                          onClick={() => markOrdered(qu)}
                          className="btn btn-primary flex-1 h-9"
                          disabled={completeSale.isPending}
                          title="Mark as ordered \u2014 creates credit invoice"
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
                          className="btn btn-ghost h-9"
                          disabled={completeSale.isPending}
                        >
                          <ArrowRight className="w-3.5 h-3.5" /> Cash sale
                        </button>
                      )}
                      {canDeleteQuote && (
                        <button
                          onClick={() =>
                            confirm(
                              `Delete quote ${qu.number}? Only Admins/Owner can perform this. A permanent audit record will be kept.`
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
                          className="btn btn-ghost h-9 w-9 p-0 text-danger"
                          title="Delete quote (Admin only)"
                        >
                          <Trash2 className="w-4 h-4" />
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
                          `Delete ${qu.number}? Only Admins/Owner can perform this. A permanent audit record will be kept.`
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
                      className="btn btn-ghost h-9 w-9 p-0 text-danger ml-auto"
                      title="Delete (Admin only)"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
              </div>
            </div>
          ))}
        </div>
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
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "magenta" | "warning";
}) {
  return (
    <div className="paper-card p-4">
      <div className="text-[11px] uppercase tracking-widest text-ink-mute">
        {label}
      </div>
      <div
        className={cn(
          "font-display text-2xl font-bold num mt-1",
          tone === "success" && "text-success",
          tone === "magenta" && "text-magenta-reg",
          tone === "warning" && "text-warning"
        )}
      >
        {value}
      </div>
    </div>
  );
}
