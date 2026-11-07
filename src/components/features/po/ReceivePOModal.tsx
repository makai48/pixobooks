import { useMemo, useState } from "react";
import { X, PackageCheck, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useReceivePO } from "@/hooks/usePurchaseOrders";
import { useShopSettings } from "@/hooks/useShopSettings";
import { useItems } from "@/hooks/useItems";
import { useUnitConversions } from "@/hooks/useUnitConversions";
import { useUoms } from "@/hooks/useUoms";
import { formatCurrency } from "@/lib/utils";
import GlassSelect from "@/components/ui/GlassSelect";
import { convertQuantity, relatedUoms, validateTransactionQty } from "@/lib/uom";
import type { POLine, PurchaseOrder } from "@/types";

type Props = {
  po: PurchaseOrder;
  onClose: () => void;
};

/**
 * Recipient-facing modal for confirming a PO is received.
 *
 * For every ordered line the recipient enters the ACTUAL quantity that
 * arrived. That received qty (never the original ordered qty) is what
 * gets added to on-hand stock. Both values are persisted on the PO for
 * audit/reference.
 */
export default function ReceivePOModal({ po, onClose }: Props) {
  const { data: settings } = useShopSettings();
  const { data: items = [] } = useItems();
  const { data: conversions = [] } = useUnitConversions();
  const { data: uoms = [] } = useUoms();
  const receive = useReceivePO();
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  // Seed each line with the quantity REMAINING to receive, typed in the
  // receiving unit. Partially received lines keep their earlier receipts:
  // the field shows what is still outstanding, and submit adds to the
  // cumulative totals instead of overwriting them.
  const [lines, setLines] = useState<POLine[]>(
    po.lines.map((l) => {
      const it = l.materialId ? itemsById.get(l.materialId) : undefined;
      const already = Number(l.receivedEnteredQty ?? 0);
      const remaining = Math.max(0, Number(l.qty || 0) - already);
      const seeded: POLine = {
        ...l,
        receivedQty: remaining,
        unit: l.unit || l.receivedUnit || it?.purchaseUnit || it?.baseUnit || "pc",
      };
      return seeded;
    })
  );

  const setReceived = (idx: number, value: number) =>
    setLines((rows) =>
      rows.map((r, i) =>
        i === idx ? { ...r, receivedQty: Math.max(0, Number(value) || 0) } : r
      )
    );

  const setUnit = (idx: number, unit: string) =>
    setLines((rows) => rows.map((r, i) => (i === idx ? { ...r, unit } : r)));

  const unitOptionsFor = (l: POLine): string[] => {
    const it = l.materialId ? itemsById.get(l.materialId) : undefined;
    const ordered = l.unit || it?.purchaseUnit || it?.baseUnit || "pc";
    const base = it?.baseUnit || l.unit || "pc";
    const related = new Set([...relatedUoms(ordered, conversions, [], uoms), base]);
    return Array.from(related).sort((a, b) => a.localeCompare(b));
  };

  const hasDiscrepancy = lines.some(
    (l) => Number(l.receivedEnteredQty ?? 0) + Number(l.receivedQty || 0) < Number(l.qty || 0)
  );
  const zeroReceipts = lines.every((l) => Number(l.receivedQty || 0) === 0);

  const confirm = async () => {
    if (zeroReceipts) {
      return toast.error(
        "Enter received quantity for at least one line before confirming receipt."
      );
    }
    // Central UOM gate: validate in receiving units, persist CUMULATIVE base
    // totals so a second delivery only posts the new delta.
    const converted: POLine[] = [];
    for (const l of lines) {
      const it = l.materialId ? itemsById.get(l.materialId) : undefined;
      const recvUnit = l.unit || it?.purchaseUnit || it?.baseUnit || "pc";
      const baseUnit = it?.baseUnit || recvUnit;
      const enteredNow = Number(l.receivedQty || 0);
      const alreadyEntered = Number(l.receivedEnteredQty ?? 0);
      if (enteredNow > 0) {
        const check = validateTransactionQty(enteredNow, recvUnit, uoms, {
          itemAllowDecimalQty: it?.allowDecimalQty,
          label: `${l.name} received qty`,
        });
        if (!check.ok) return toast.error(check.reason);
      }
      const baseNow =
        convertQuantity(enteredNow, recvUnit, baseUnit, conversions)?.value ?? enteredNow;
      const cumulativeBase = Number(l.receivedBaseQty ?? 0) + baseNow;
      const orderedBase =
        convertQuantity(Number(l.qty || 0), recvUnit, baseUnit, conversions)?.value ??
        Number(l.qty || 0);
      // Movement-level unit cost (§10-13): total paid this delivery ÷ the base
      // quantity it bought. Stored verbatim so history never changes meaning.
      const lineTotal = enteredNow * Number(l.unitCost || 0);
      converted.push({
        ...l,
        unit: recvUnit,
        receivedEnteredQty: alreadyEntered + enteredNow,
        receivedUnit: recvUnit,
        receivedBaseQty: cumulativeBase,
        receivedQty: cumulativeBase,
        orderedBaseQty: orderedBase,
        derivedUnitCost: baseNow > 0 ? lineTotal / baseNow : null,
      });
    }
    try {
      await receive.mutateAsync({ id: po.id, lines: converted });
      const fully = converted.every(
        (l) => Number(l.receivedBaseQty ?? 0) >= Number(l.orderedBaseQty ?? 0)
      );
      toast.success(
        fully
          ? `PO ${po.number} fully received. Stock updated.`
          : `Partial receipt recorded for ${po.number}. Receive the balance later.`
      );
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Receive failed");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-4 animate-fade-in">
      <div className="paper-card w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="p-5 border-b flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-widest text-ink-mute">
              Receive delivery
            </div>
            <h2 className="font-display text-xl font-bold truncate">
              {po.number} · {po.vendor}
            </h2>
          </div>
          <button onClick={onClose} className="btn btn-ghost h-9 w-9 p-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3 overflow-auto scroll-lined">
          <p className="text-xs text-ink-mute">
            Enter the quantity arriving in this delivery, in its receiving
            unit. Quantities convert into base units automatically. Leaving a
            line below its remaining quantity records a partial receipt — the
            balance can be received later.
          </p>

          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-paper/60">
                <tr className="text-left text-[10px] uppercase tracking-widest text-ink-mute">
                  <th className="p-2 pl-3">Material</th>
                  <th className="p-2 text-right w-20">Ordered</th>
                  <th className="p-2 text-right w-28">Receive now</th>
                  <th className="p-2 text-right w-24">Unit cost</th>
                  <th className="p-2 text-right w-16">Δ</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, idx) => {
                  const ordered = Number(l.qty || 0);
                  const already = Number(l.receivedEnteredQty ?? 0);
                  const remaining = Math.max(0, ordered - already);
                  const received = Number(l.receivedQty || 0);
                  const diff = received - remaining;
                  return (
                    <tr key={idx} className="border-t">
                      <td className="p-2 pl-3">
                        <div className="font-semibold truncate">{l.name}</div>
                        {l.unit && (
                          <div className="text-[10px] text-ink-mute uppercase tracking-widest">
                            {l.unit}
                          </div>
                        )}
                      </td>
                      <td className="p-2 text-right num text-ink-mute">
                        {ordered.toLocaleString()}
                        {already > 0 && (
                          <div className="text-[9px] text-success font-semibold">
                            {already.toLocaleString()} received
                          </div>
                        )}
                        {already > 0 && (
                          <div className="text-[9px] text-ink-mute">
                            {remaining.toLocaleString()} left
                          </div>
                        )}
                      </td>
                      <td className="p-2 text-right">
                        <input
                          type="number"
                          min={0}
                          step="0.001"
                          value={received}
                          onChange={(e) => setReceived(idx, Number(e.target.value))}
                          className="input h-8 num text-right w-24 ml-auto"
                        />
                        <GlassSelect
                          value={l.unit || ""}
                          onChange={(v) => setUnit(idx, v)}
                          ariaLabel="Receiving unit"
                          options={unitOptionsFor(l).map((u) => ({ value: u, label: u }))}
                          className="input select-glass h-7 text-[11px] w-24 ml-auto mt-1"
                        />
                      </td>
                      <td className="p-2 text-right num text-ink-mute">
                        {formatCurrency(l.unitCost, settings?.currency)}
                      </td>
                      <td
                        className={
                          "p-2 text-right num text-[11px] " +
                          (diff === 0
                            ? "text-ink-mute"
                            : diff > 0
                            ? "text-success"
                            : "text-danger")
                        }
                      >
                        {diff > 0 ? "+" : ""}
                        {diff}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {hasDiscrepancy && (
            <div className="flex items-start gap-2 p-3 rounded-md border border-warning/30 bg-warning/5 text-xs">
              <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <div>
                One or more received quantities differ from the ordered
                quantities. Only the received figures shown above will be added
                to stock. This discrepancy is stored on the PO for reference.
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t bg-card flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-outline">
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={receive.isPending}
            className="btn btn-primary"
          >
            <PackageCheck className="w-4 h-4" />
            {receive.isPending ? "Receiving..." : "Confirm receipt & update stock"}
          </button>
        </div>
      </div>
    </div>
  );
}
