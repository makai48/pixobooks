import { useEffect, useMemo, useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useItems } from "@/hooks/useItems";
import { useShopSettings } from "@/hooks/useShopSettings";
import { useUpsertPO } from "@/hooks/usePurchaseOrders";
import { useUnitConversions } from "@/hooks/useUnitConversions";
import { useUoms } from "@/hooks/useUoms";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency } from "@/lib/utils";
import GlassDatePicker from "@/components/ui/GlassDatePicker";
import { relatedUoms, validateCompatibility, validateTransactionQty } from "@/lib/uom";
import type { POLine, POStatus, PurchaseOrder } from "@/types";

export default function POModal({
  po,
  onClose,
}: {
  po: PurchaseOrder | null;
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const { data: items = [] } = useItems();
  const { data: settings } = useShopSettings();
  const { data: conversions = [] } = useUnitConversions();
  const { data: uoms = [] } = useUoms();
  const upsert = useUpsertPO();

  const unitOptions = (matId: string): string[] => {
    const mat = materials.find((m) => m.id === matId);
    const purchase = mat?.purchaseUnit || mat?.baseUnit || "pc";
    const base = mat?.baseUnit || "pc";
    return Array.from(new Set([...relatedUoms(purchase, conversions, [], uoms), base]))
      .sort((a, b) => a.localeCompare(b));
  };

  const materials = useMemo(
    () => items.filter((i) => i.isMaterial && i.canPurchase !== false),
    [items]
  );
  const [vendor, setVendor] = useState("");
  const [expected, setExpected] = useState("");
  const [status, setStatus] = useState<POStatus>("draft");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<POLine[]>([]);

  useEffect(() => {
    if (po) {
      setVendor(po.vendor);
      setExpected(po.expectedDate || "");
      setStatus(po.status);
      setNotes(po.notes || "");
      setLines(po.lines);
    }
  }, [po]);

  const addLine = () => {
    const first = materials[0];
    if (!first) return toast.error("Add materials in Inventory first");
    setLines([
      ...lines,
      {
        materialId: first.id,
        name: first.name,
        qty: 1,
        unit: first.purchaseUnit || first.baseUnit,
        unitCost: first.cost,
      },
    ]);
  };

  const updateLine = (idx: number, patch: Partial<POLine>) =>
    setLines(lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const selectMat = (idx: number, matId: string) => {
    const m = materials.find((x) => x.id === matId);
    if (!m) return;
    updateLine(idx, {
      materialId: matId,
      name: m.name,
      unit: m.purchaseUnit || m.baseUnit,
      unitCost: m.cost,
    });
  };

  const subtotal = lines.reduce((s, l) => s + l.qty * l.unitCost, 0);
  const tax = settings ? subtotal * (settings.taxRate / 100) : 0;
  const total = subtotal + tax;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendor.trim()) return toast.error("Vendor is required");
    if (!lines.length) return toast.error("Add at least one line");
    // Central UOM gate: ordered unit must be family-compatible with the
    // material's base unit, and ordered qty must satisfy its rule.
    for (const l of lines) {
      const mat = materials.find((m) => m.id === l.materialId);
      const base = mat?.baseUnit || "pc";
      const unit = l.unit || mat?.purchaseUnit || base;
      const compat = validateCompatibility(unit, base, uoms);
      if (!compat.compatible) {
        return toast.error(`"${l.name}": ${compat.reason}`);
      }
      const check = validateTransactionQty(l.qty, unit, uoms, {
        itemAllowDecimalQty: mat?.allowDecimalQty,
        label: `"${l.name}" quantity`,
      });
      if (!check.ok) return toast.error(check.reason);
    }
    try {
      await upsert.mutateAsync({
        id: po?.id,
        number: po?.number,
        vendor: vendor.trim(),
        expectedDate: expected || null,
        status,
        notes: notes || null,
        lines,
        subtotal,
        tax,
        total,
        createdBy: profile?.id,
        createdByName: profile?.name,
      });
      toast.success(po ? "PO updated" : "PO created");
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
              {po ? `Edit ${po.number}` : "New purchase order"}
            </div>
            <h2 className="font-display text-xl font-bold">Order materials</h2>
          </div>
          <button onClick={onClose} className="btn btn-ghost">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={save} className="flex-1 overflow-auto p-5 space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label htmlFor="po-vendor" className="label">Vendor</label>
              <input
                id="po-vendor"
                required
                autoFocus
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                className="input mt-1"
                placeholder="Ink Supplies Ltd."
              />
            </div>
            <div>
              <label htmlFor="po-status" className="label">Status</label>
              <select
                id="po-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as POStatus)}
                className="input mt-1"
              >
                <option value="draft">Draft</option>
                <option value="ordered">Ordered</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label htmlFor="po-expected" className="label">Expected delivery</label>
              <GlassDatePicker
                id="po-expected"
                value={expected}
                onChange={setExpected}
                ariaLabel="Expected delivery"
                className="input mt-1"
                fullWidth
                placeholder="Not set"
                allowClear
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-widest text-ink-mute">
                Materials
              </div>
              <button
                type="button"
                onClick={addLine}
                disabled={materials.length === 0}
                className="btn btn-outline h-9"
              >
                <Plus className="w-4 h-4" /> Add line
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {lines.length === 0 ? (
                <div className="p-4 border border-dashed rounded-md text-sm text-ink-mute text-center">
                  Add materials to this order.
                </div>
              ) : (
                lines.map((l, idx) => {
                  const mat = materials.find((m) => m.id === l.materialId);
                  return (
                    <div
                      key={idx}
                      className="grid grid-cols-12 gap-2 items-center p-2 border rounded-md bg-white"
                    >
                      <select
                        value={l.materialId}
                        onChange={(e) => selectMat(idx, e.target.value)}
                        className="input col-span-4"
                        aria-label="Material"
                      >
                        {materials.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                      <div className="col-span-2 flex items-center gap-1">
                        <input
                          type="number"
                          min={1}
                          value={l.qty}
                          onChange={(e) => updateLine(idx, { qty: Number(e.target.value) })}
                          className="input num text-right"
                          aria-label={`Quantity for ${l.name}`}
                        />
                      </div>
                      <select
                        value={l.unit || mat?.purchaseUnit || mat?.baseUnit || "pc"}
                        onChange={(e) => updateLine(idx, { unit: e.target.value })}
                        className="input col-span-2 text-xs"
                        aria-label={`Order unit for ${l.name} (cost applies per this unit)`}
                        title="Unit this quantity and cost are quoted in"
                      >
                        {unitOptions(l.materialId).map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        step="0.001"
                        min={0}
                        value={l.unitCost}
                        onChange={(e) => updateLine(idx, { unitCost: Number(e.target.value) })}
                        className="input col-span-2 num text-right"
                        aria-label={`Unit cost for ${l.name} (per ${l.unit || "unit"})`}
                      />
                      <div className="col-span-1 text-right num text-sm font-semibold">
                        {formatCurrency(l.qty * l.unitCost, settings?.currency)}
                      </div>
                      <button
                        type="button"
                        onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                        className="col-span-1 btn btn-ghost text-danger h-8 w-8 p-0 justify-self-end"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div>
            <label htmlFor="po-notes" className="label">Notes</label>
            <textarea
              id="po-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input mt-1 h-20"
              placeholder="Delivery instructions..."
            />
          </div>

          <div className="paper-card p-4 space-y-1">
            <div className="flex justify-between text-sm">
              <span>Subtotal</span>
              <span className="num">{formatCurrency(subtotal, settings?.currency)}</span>
            </div>
            <div className="flex justify-between text-sm text-ink-mute">
              <span>Tax ({settings?.taxRate}%)</span>
              <span className="num">{formatCurrency(tax, settings?.currency)}</span>
            </div>
            <div className="dashed-divider" />
            <div className="flex justify-between items-baseline">
              <span className="font-display text-lg font-semibold">Total</span>
              <span className="num text-xl font-bold">
                {formatCurrency(total, settings?.currency)}
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <button type="button" onClick={onClose} className="btn btn-outline">
              Cancel
            </button>
            <button type="submit" disabled={upsert.isPending} className="btn btn-primary">
              {upsert.isPending ? "Saving..." : po ? "Save PO" : "Create PO"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
