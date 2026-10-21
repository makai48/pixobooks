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
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-4 animate-fade-in">
      <div className="paper-card w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col">
        <div className="p-5 border-b flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-ink-mute">
              {quote ? `Edit ${quote.number}` : "New quote"}
            </div>
            <h2 className="font-display text-xl font-bold">Quote builder</h2>
          </div>
          <button onClick={onClose} className="btn btn-ghost">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={save} className="flex-1 overflow-auto p-5 space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label htmlFor="quote-customer" className="label">Customer</label>
              <select
                id="quote-customer"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="input mt-1"
              >
                <option value="">Walk-in Customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="quote-status" className="label">Status</label>
              <select
                id="quote-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as QuoteStatus)}
                className="input mt-1"
              >
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="accepted">Accepted</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <div className="col-span-3">
              <label htmlFor="quote-valid-until" className="label">Valid until</label>
              <input
                id="quote-valid-until"
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="input mt-1 max-w-xs"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-widest text-ink-mute">
                Line items
              </div>
              <button
                type="button"
                onClick={addLine}
                className="btn btn-outline h-9"
                disabled={sellable.length === 0}
              >
                <Plus className="w-4 h-4" /> Add line
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {lines.length === 0 ? (
                <div className="p-4 border border-dashed rounded-md text-sm text-ink-mute text-center">
                  No lines yet. Click "Add line" to get started.
                </div>
              ) : (
                lines.map((l, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-12 gap-2 items-center p-2 border rounded-md bg-white"
                  >
                    <select
                      value={l.itemId}
                      onChange={(e) => selectItem(idx, e.target.value)}
                      className="input col-span-5"
                    >
                      {sellable.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      value={l.qty}
                      onChange={(e) => updateLine(idx, { qty: Number(e.target.value) })}
                      className="input col-span-2 num text-right"
                      placeholder="Qty"
                    />
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={l.unitPrice}
                      onChange={(e) => updateLine(idx, { unitPrice: Number(e.target.value) })}
                      className="input col-span-2 num text-right"
                      placeholder="Price"
                    />
                    <div className="col-span-2 text-right num text-sm font-semibold">
                      {formatCurrency(l.qty * l.unitPrice, settings?.currency)}
                    </div>
                    <button
                      type="button"
                      onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                      className="col-span-1 btn btn-ghost text-danger h-8 w-8 p-0 justify-self-end"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <label htmlFor="quote-notes" className="label">Notes / terms</label>
            <textarea
              id="quote-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input mt-1 h-20"
              placeholder="Delivery time, artwork requirements..."
            />
          </div>

          <div className="paper-card p-4 space-y-1">
            <div className="flex justify-between text-sm">
              <span>Subtotal</span>
              <span className="num">
                {formatCurrency(totals.subtotal, settings?.currency)}
              </span>
            </div>
            <div className="flex justify-between text-sm text-ink-mute">
              <span>Tax ({settings?.taxRate}%)</span>
              <span className="num">{formatCurrency(totals.tax, settings?.currency)}</span>
            </div>
            <div className="dashed-divider" />
            <div className="flex justify-between items-baseline">
              <span className="font-display text-lg font-semibold">Total</span>
              <span className="num text-xl font-bold">
                {formatCurrency(totals.total, settings?.currency)}
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <button type="button" onClick={onClose} className="btn btn-outline">
              Cancel
            </button>
            <button type="submit" disabled={upsert.isPending} className="btn btn-primary">
              {upsert.isPending ? "Saving..." : quote ? "Save quote" : "Create quote"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
