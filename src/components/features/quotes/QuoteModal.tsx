import { useEffect, useMemo, useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useItems } from "@/hooks/useItems";
import { useCustomers } from "@/hooks/useCustomers";
import { useShopSettings } from "@/hooks/useShopSettings";
import { useUpsertQuote } from "@/hooks/useQuotes";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency } from "@/lib/utils";
import { computeTotals } from "@/lib/pos";
import GlassDatePicker from "@/components/ui/GlassDatePicker";
import GlassSelect from "@/components/ui/GlassSelect";
import MoneyText from "@/components/ui/MoneyText";
import type { Quote, QuoteStatus, SaleLine } from "@/types";

export default function QuoteModal({
  quote,
  onClose,
}: {
  quote: Quote | null;
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const { data: items = [] } = useItems();
  const { data: customers = [] } = useCustomers();
  const { data: settings } = useShopSettings();
  const upsert = useUpsertQuote();

  const sellable = useMemo(
    () => items.filter((i) => !i.isMaterial && i.canSell !== false),
    [items]
  );
  const [customerId, setCustomerId] = useState<string>("");
  const [lines, setLines] = useState<SaleLine[]>([]);
  const [status, setStatus] = useState<QuoteStatus>("draft");
  const [validUntil, setValidUntil] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  useEffect(() => {
    if (quote) {
      setCustomerId(quote.customerId || "");
      setLines(quote.lines);
      setStatus(quote.status);
      setValidUntil(quote.validUntil || "");
      setNotes(quote.notes || "");
    }
  }, [quote]);

  const addLine = () => {
    const first = sellable[0];
    if (!first) return toast.error("Add products in Inventory first");
    setLines([
      ...lines,
      { itemId: first.id, name: first.name, qty: 1, unitPrice: first.price, discountPct: 0 },
    ]);
  };

  const updateLine = (idx: number, patch: Partial<SaleLine>) => {
    setLines(lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const selectItem = (idx: number, itemId: string) => {
    const it = sellable.find((i) => i.id === itemId);
    if (!it) return;
    updateLine(idx, { itemId, name: it.name, unitPrice: it.price });
  };

  const totals = settings
    ? computeTotals(lines, 0, settings)
    : { subtotal: 0, tax: 0, total: 0, lineDiscountTotal: 0, orderDiscountValue: 0 };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lines.length) return toast.error("Add at least one line item");
    const cust = customers.find((c) => c.id === customerId);
    try {
      await upsert.mutateAsync({
        id: quote?.id,
        number: quote?.number,
        customerId: cust?.id || null,
        customerName: cust?.name || null,
        lines,
        subtotal: totals.subtotal,
        tax: totals.tax,
        total: totals.total,
        status,
        validUntil: validUntil || null,
        notes: notes || null,
        createdBy: profile?.id,
        createdByName: profile?.name,
      });
      toast.success(quote ? "Quote updated" : "Quote created");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-end md:items-center justify-center p-2 md:p-4 animate-fade-in">
      <div className="paper-card w-full max-w-2xl max-h-[94dvh] md:max-h-[92vh] overflow-hidden flex flex-col">
        <div className="px-2.5 md:px-5 py-2 md:py-4 border-b flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <div className="text-[9px] md:text-[11px] uppercase tracking-wide md:tracking-widest text-ink-mute truncate">
              {quote ? `Edit ${quote.number}` : "New quote"}
            </div>
            <h2 className="font-display text-base md:text-xl font-bold leading-tight">
              Quote builder
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-sm max-md:w-7 max-md:px-0 shrink-0"
            aria-label="Close quote builder"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          id="quote-form"
          onSubmit={save}
          className="flex-1 overflow-auto p-2.5 md:p-5 space-y-2 md:space-y-5"
        >
          <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 md:gap-3">
            <div className="col-span-2">
              <label htmlFor="quote-customer" className="label text-[9px] md:text-xs">Customer</label>
              <GlassSelect
                id="quote-customer"
                value={customerId}
                onChange={setCustomerId}
                ariaLabel="Customer"
                options={[
                  { value: "", label: "Walk-in Customer" },
                  ...customers.map((c) => ({ value: c.id, label: c.name })),
                ]}
                className="input select-glass mt-1"
              />
            </div>
            <div>
              <label htmlFor="quote-status" className="label text-[9px] md:text-xs">Status</label>
              <GlassSelect
                id="quote-status"
                value={status}
                onChange={(v) => setStatus(v as QuoteStatus)}
                ariaLabel="Status"
                options={[
                  { value: "draft", label: "Draft" },
                  { value: "sent", label: "Sent" },
                  { value: "accepted", label: "Accepted" },
                  { value: "rejected", label: "Rejected" },
                ]}
                className="input select-glass mt-1"
              />
            </div>
            <div className="col-span-3">
              <label htmlFor="quote-valid-until" className="label text-[9px] md:text-xs">Valid until</label>
              <GlassDatePicker
                id="quote-valid-until"
                value={validUntil}
                onChange={setValidUntil}
                ariaLabel="Valid until"
                className="input mt-1 max-w-xs"
                placeholder="No expiry"
                allowClear
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[9px] md:text-[11px] uppercase tracking-wide md:tracking-widest text-ink-mute">
                Line items
              </div>
              <button
                type="button"
                onClick={addLine}
                className="btn btn-outline btn-sm shrink-0"
                disabled={sellable.length === 0}
              >
                <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" /> Add line
              </button>
            </div>
            <div className="mt-1.5 md:mt-3 space-y-1 md:space-y-2">
              {lines.length === 0 ? (
                <div className="p-3 md:p-4 border border-dashed rounded-md text-[11px] md:text-sm text-ink-mute text-center">
                  No lines yet. Click "Add line" to get started.
                </div>
              ) : (
                lines.map((l, idx) => (
                  <div
                    key={idx}
                    className="p-1.5 md:p-2 border rounded-md bg-white"
                  >
                    {/* Mobile: two pinned lines — item+remove, then qty · price · line total */}
                    <div className="md:hidden space-y-1">
                      <div className="flex items-center gap-1">
                        <GlassSelect
                          value={l.itemId}
                          onChange={(v) => selectItem(idx, v)}
                          ariaLabel="Quote item"
                          options={sellable.map((s) => ({ value: s.id, label: s.name }))}
                          className="input select-glass input-sm flex-1 min-w-0"
                        />
                        <button
                          type="button"
                          onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                          className="btn btn-ghost btn-sm w-7 md:h-8 md:w-8 shrink-0 px-0 text-danger"
                          aria-label={`Remove ${l.name}`}
                          title="Remove line"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="flex items-center gap-1 px-0.5 text-[7px] uppercase tracking-wide text-ink-mute leading-none">
                        <span className="w-14 shrink-0 text-right">Qty</span>
                        <span className="flex-1 text-right">Price</span>
                        <span className="w-16 shrink-0 text-right">Line</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={1}
                          step="any"
                          value={l.qty}
                          onChange={(e) => updateLine(idx, { qty: Number(e.target.value) })}
                          className="input input-sm num w-14 shrink-0 text-right"
                          aria-label={`Quantity for ${l.name}`}
                        />
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          value={l.unitPrice}
                          onChange={(e) => updateLine(idx, { unitPrice: Number(e.target.value) })}
                          className="input input-sm num flex-1 min-w-0 text-right"
                          aria-label={`Unit price for ${l.name}`}
                        />
                        <span
                          className="num w-16 shrink-0 truncate text-right text-[11px] font-semibold"
                          title={formatCurrency(l.qty * l.unitPrice, settings?.currency)}
                        >
                          <MoneyText value={formatCurrency(l.qty * l.unitPrice, settings?.currency)} />
                        </span>
                      </div>
                    </div>

                    {/* Desktop: one ledger row per quote line */}
                    <div className="hidden md:grid grid-cols-12 gap-2 items-center">
                      <GlassSelect
                        value={l.itemId}
                        onChange={(v) => selectItem(idx, v)}
                        ariaLabel="Quote item"
                        options={sellable.map((s) => ({ value: s.id, label: s.name }))}
                        className="input select-glass col-span-5"
                      />
                      <input
                        type="number"
                        min={1}
                        step="any"
                        value={l.qty}
                        onChange={(e) => updateLine(idx, { qty: Number(e.target.value) })}
                        className="input col-span-2 num text-right"
                        placeholder="Qty"
                        aria-label={`Quantity for ${l.name}`}
                      />
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={l.unitPrice}
                        onChange={(e) => updateLine(idx, { unitPrice: Number(e.target.value) })}
                        className="input col-span-2 num text-right"
                        placeholder="Price"
                        aria-label={`Unit price for ${l.name}`}
                      />
                      <div className="col-span-2 text-right num text-sm font-semibold truncate">
                        <MoneyText value={formatCurrency(l.qty * l.unitPrice, settings?.currency)} />
                      </div>
                      <button
                        type="button"
                        onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                        className="col-span-1 btn btn-ghost text-danger h-8 w-8 p-0 justify-self-end"
                        aria-label={`Remove ${l.name}`}
                        title="Remove line"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <label htmlFor="quote-notes" className="label text-[9px] md:text-xs">Notes / terms</label>
            <textarea
              id="quote-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input mt-1 h-14 md:h-20 text-[13px] md:text-sm"
              placeholder="Delivery time, artwork requirements..."
            />
          </div>

          <div className="paper-card p-2 md:p-4 space-y-0.5 md:space-y-1">
            <div className="flex justify-between text-[11px] md:text-sm">
              <span>Subtotal</span>
              <span className="num">
                <MoneyText value={formatCurrency(totals.subtotal, settings?.currency)} />
              </span>
            </div>
            <div className="flex justify-between text-[11px] md:text-sm text-ink-mute">
              <span>Tax ({settings?.taxRate}%)</span>
              <span className="num"><MoneyText value={formatCurrency(totals.tax, settings?.currency)} /></span>
            </div>
            <div className="dashed-divider my-1 md:my-0" />
            <div className="flex justify-between items-baseline">
              <span className="font-display text-sm md:text-lg font-semibold">Total</span>
              <span className="num text-base md:text-xl font-bold">
                <MoneyText value={formatCurrency(totals.total, settings?.currency)} />
              </span>
            </div>
          </div>
        </form>

        {/* Pinned footer — actions stay reachable while the form scrolls */}
        <div className="shrink-0 flex items-center justify-end gap-1.5 md:gap-2 px-2.5 md:px-5 py-2 md:py-3 border-t">
          <button type="button" onClick={onClose} className="btn btn-outline">
            Cancel
          </button>
          <button type="submit" form="quote-form" disabled={upsert.isPending} className="btn btn-primary">
            {upsert.isPending ? "Saving..." : quote ? "Save quote" : "Create quote"}
          </button>
        </div>
      </div>
    </div>
  );
}
