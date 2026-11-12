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
import GlassSelect from "@/components/ui/GlassSelect";
import AmountInput from "@/components/ui/AmountInput";
import MoneyText from "@/components/ui/MoneyText";
import VendorSelect from "@/components/features/suppliers/VendorSelect";
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
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-end md:items-center justify-center p-2 md:p-4 animate-fade-in">
      <div className="paper-card w-full max-w-2xl max-h-[94dvh] md:max-h-[92vh] overflow-hidden flex flex-col">
        <div className="px-2.5 md:px-5 py-2 md:py-4 border-b flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <div className="text-[9px] md:text-[11px] uppercase tracking-wide md:tracking-widest text-ink-mute truncate">
              {po ? `Edit ${po.number}` : "New purchase order"}
            </div>
            <h2 className="font-display text-base md:text-xl font-bold leading-tight">
              Order materials
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-sm max-md:w-7 max-md:px-0 shrink-0"
            aria-label="Close purchase order"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          id="po-form"
          onSubmit={save}
          className="flex-1 overflow-auto p-2.5 md:p-5 space-y-2 md:space-y-5"
        >
          <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 md:gap-3">
            <div className="col-span-2">
              <label htmlFor="po-vendor" className="label text-[9px] md:text-xs">Vendor</label>
              <VendorSelect
                id="po-vendor"
                value={vendor}
                onChange={setVendor}
                placeholder="Select supplier..."
                autoFocus
              />
            </div>
            <div>
              <label htmlFor="po-status" className="label text-[9px] md:text-xs">Status</label>
              <GlassSelect
                id="po-status"
                value={status}
                onChange={(v) => setStatus(v as POStatus)}
                ariaLabel="Status"
                options={[
                  { value: "draft", label: "Draft" },
                  { value: "ordered", label: "Ordered" },
                  { value: "cancelled", label: "Cancelled" },
                ]}
                className="input select-glass mt-1"
                fullWidth
              />
            </div>
            <div>
              <label htmlFor="po-expected" className="label text-[9px] md:text-xs">
                Expected delivery
              </label>
              <GlassDatePicker
                id="po-expected"
                value={expected}
                onChange={setExpected}
                ariaLabel="Expected delivery"
                className="input mt-1"
                placeholder="Not set"
                allowClear
                fullWidth
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[9px] md:text-[11px] uppercase tracking-wide md:tracking-widest text-ink-mute">
                Materials
                {lines.length > 0 && (
                  <span className="num normal-case tracking-normal"> · {lines.length} line{lines.length === 1 ? "" : "s"}</span>
                )}
              </div>
              <button
                type="button"
                onClick={addLine}
                disabled={materials.length === 0}
                className="btn btn-outline btn-sm shrink-0"
              >
                <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" /> Add line
              </button>
            </div>

            <div className="mt-1.5 md:mt-3 space-y-1 md:space-y-2">
              {lines.length === 0 ? (
                <div className="p-3 md:p-4 border border-dashed rounded-md text-[11px] md:text-sm text-ink-mute text-center">
                  Add materials to this order.
                </div>
              ) : (
                lines.map((l, idx) => {
                  const mat = materials.find((m) => m.id === l.materialId);
                  const unit = l.unit || mat?.purchaseUnit || mat?.baseUnit || "pc";
                  return (
                    <div key={idx} className="p-1.5 md:p-2 border rounded-md bg-card">
                      {/* Mobile: two pinned lines — material+remove, then qty · unit · cost · line total */}
                      <div className="md:hidden space-y-1">
                        <div className="flex items-center gap-1">
                          <GlassSelect
                            value={l.materialId}
                            onChange={(v) => selectMat(idx, v)}
                            ariaLabel="Material"
                            options={materials.map((m) => ({ value: m.id, label: m.name }))}
                            className="input select-glass input-sm flex-1 min-w-0"
                          />
                          <button
                            type="button"
                            onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                            className="btn btn-ghost btn-sm w-7 shrink-0 px-0 text-danger"
                            aria-label={`Remove ${l.name}`}
                            title="Remove line"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="flex items-center gap-1 px-0.5 text-[7px] uppercase tracking-wide text-ink-mute leading-none">
                          <span className="w-14 shrink-0 text-right">Qty</span>
                          <span className="w-[52px] shrink-0 text-center">Unit</span>
                          <span className="flex-1 text-right">Cost</span>
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
                          <GlassSelect
                            value={unit}
                            onChange={(v) => updateLine(idx, { unit: v })}
                            ariaLabel={`Order unit for ${l.name} (cost applies per this unit)`}
                            options={unitOptions(l.materialId).map((u) => ({ value: u, label: u }))}
                            className="input select-glass input-sm w-[52px] shrink-0 px-1 text-[11px]"
                          />
                          <AmountInput
                            step="0.001"
                            min={0}
                            value={l.unitCost}
                            onChange={(v) => updateLine(idx, { unitCost: v })}
                            className="input input-sm num flex-1 min-w-0 text-right"
                            ariaLabel={`Unit cost for ${l.name} (per ${unit})`}
                          />
                          <span
                            className="num w-16 shrink-0 truncate text-right text-[11px] font-semibold"
                            title={formatCurrency(l.qty * l.unitCost, settings?.currency)}
                          >
                            <MoneyText value={formatCurrency(l.qty * l.unitCost, settings?.currency)} />
                          </span>
                        </div>
                      </div>

                      {/* Desktop: one ledger row per order line */}
                      <div className="hidden md:grid grid-cols-12 gap-2 items-center">
                        <GlassSelect
                          value={l.materialId}
                          onChange={(v) => selectMat(idx, v)}
                          ariaLabel="Material"
                          options={materials.map((m) => ({ value: m.id, label: m.name }))}
                          className="input select-glass col-span-3"
                        />
                        <div className="col-span-2 flex items-center gap-1">
                          <input
                            type="number"
                            min={1}
                            step="any"
                            value={l.qty}
                            onChange={(e) => updateLine(idx, { qty: Number(e.target.value) })}
                            className="input num text-right"
                            aria-label={`Quantity for ${l.name}`}
                          />
                        </div>
                        <GlassSelect
                          value={unit}
                          onChange={(v) => updateLine(idx, { unit: v })}
                          ariaLabel={`Order unit for ${l.name} (cost applies per this unit)`}
                          options={unitOptions(l.materialId).map((u) => ({ value: u, label: u }))}
                          className="input select-glass col-span-2 text-xs"
                        />
                        <input
                          type="number"
                          step="0.001"
                          min={0}
                          value={l.unitCost}
                          onChange={(e) => updateLine(idx, { unitCost: Number(e.target.value) })}
                          className="input col-span-2 num text-right"
                          aria-label={`Unit cost for ${l.name} (per ${unit})`}
                        />
                        <div
                          className="col-span-2 text-right num text-sm font-semibold truncate"
                          title={formatCurrency(l.qty * l.unitCost, settings?.currency)}
                        >
                          <MoneyText value={formatCurrency(l.qty * l.unitCost, settings?.currency)} />
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
                  );
                })
              )}
            </div>
          </div>

          <div>
            <label htmlFor="po-notes" className="label text-[9px] md:text-xs">Notes</label>
            <textarea
              id="po-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input mt-1 h-14 md:h-20 text-[13px] md:text-sm"
              placeholder="Delivery instructions..."
            />
          </div>

          <div className="paper-card p-2 md:p-4 space-y-0.5 md:space-y-1">
            <div className="flex justify-between text-[11px] md:text-sm">
              <span>Subtotal</span>
              <span className="num"><MoneyText value={formatCurrency(subtotal, settings?.currency)} /></span>
            </div>
            <div className="flex justify-between text-[11px] md:text-sm text-ink-mute">
              <span>Tax ({settings?.taxRate}%)</span>
              <span className="num"><MoneyText value={formatCurrency(tax, settings?.currency)} /></span>
            </div>
            <div className="dashed-divider my-1 md:my-0" />
            <div className="flex justify-between items-baseline">
              <span className="font-display text-sm md:text-lg font-semibold">Total</span>
              <span className="num text-base md:text-xl font-bold">
                <MoneyText value={formatCurrency(total, settings?.currency)} />
              </span>
            </div>
          </div>
        </form>

        {/* Pinned footer — actions stay reachable while the form scrolls */}
        <div className="shrink-0 flex items-center justify-end gap-1.5 md:gap-2 px-2.5 md:px-5 py-2 md:py-3 border-t">
          <button type="button" onClick={onClose} className="btn btn-outline">
            Cancel
          </button>
          <button type="submit" form="po-form" disabled={upsert.isPending} className="btn btn-primary">
            {upsert.isPending ? "Saving..." : po ? "Save PO" : "Create PO"}
          </button>
        </div>
      </div>
    </div>
  );
}
