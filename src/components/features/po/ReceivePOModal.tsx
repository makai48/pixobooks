import { useMemo, useState } from "react";
import { X, PackageCheck, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useReceivePO } from "@/hooks/usePurchaseOrders";
import { useShopSettings } from "@/hooks/useShopSettings";
import { useItems } from "@/hooks/useItems";
import { useUnitConversions } from "@/hooks/useUnitConversions";
import { useUoms } from "@/hooks/useUoms";
import { formatCurrency } from "@/lib/utils";
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

  // Seed each line with receivedQty === ordered qty; recipient overrides.
  // `unit` is the RECEIVING unit (defaults to the item's purchase UOM);
  // stock math converts it into base units via the central engine.
  const [lines, setLines] = useState<POLine[]>(
    po.lines.map((l) => {
      const seeded: POLine = {
        ...l,
        receivedQty:
          typeof l.receivedQty === "number" && l.receivedQty >= 0
            ? l.receivedQty
            : Number(l.qty || 0),
      };
      if (!seeded.unit) {
        const it = l.materialId ? itemsById.get(l.materialId) : undefined;
        seeded.unit = it?.purchaseUnit || it?.baseUnit || "pc";
      }
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
    (l) => Number(l.receivedQty || 0) !== Number(l.qty || 0)
  );
  const zeroReceipts = lines.every((l) => Number(l.receivedQty || 0) === 0);

  const confirm = async () => {
    if (zeroReceipts) {
      return toast.error(
        "Enter received quantity for at least one line before confirming receipt."
      );
    }
    // Central UOM gate: validate in receiving units, persist base units.
    const converted: POLine[] = [];
    for (const l of lines) {
      const it = l.materialId ? itemsById.get(l.materialId) : undefined;
      const recvUnit = l.unit || it?.purchaseUnit || it?.baseUnit || "pc";
      const baseUnit = it?.baseUnit || recvUnit;
      const entered = Number(l.receivedQty || 0);
      if (entered > 0) {
        const check = validateTransactionQty(entered, recvUnit, uoms, {
          itemAllowDecimalQty: it?.allowDecimalQty,
          label: `${l.name} received qty`,
        });
        if (!check.ok) return toast.error(check.reason);
      }
      const baseQty =
        convertQuantity(entered, recvUnit, baseUnit, conversions)?.value ?? entered;
      // Movement-level unit cost (§10-13): total paid ÷ converted base qty.
      // Stored verbatim on the line so history never changes meaning (§21).
      const lineTotal = entered * Number(l.unitCost || 0);
      converted.push({
        ...l,
        unit: recvUnit,
        receivedEnteredQty: entered,
        receivedUnit: recvUnit,
        receivedQty: baseQty,
        derivedUnitCost: baseQty > 0 ? lineTotal / baseQty : null,
      });
    }
    try {
      await receive.mutateAsync({ id: po.id, lines: converted });
      toast.success(`PO ${po.number} received. Stock updated.`);
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
            Enter the actual quantity received for each item in its receiving
            unit. Quantities convert into base units automatically when stock
            balances are updated.
          </p>

          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-paper/60">
                <tr className="text-left text-[10px] uppercase tracking-widest text-ink-mute">
                  <th className="p-2 pl-3">Material</th>
                  <th className="p-2 text-right w-20">Ordered</th>
                  <th className="p-2 text-right w-28">Received</th>
                  <th className="p-2 text-right w-24">Unit cost</th>
                  <th className="p-2 text-right w-16">Δ</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, idx) => {
                  const ordered = Number(l.qty || 0);
                  const received = Number(l.receivedQty || 0);
                  const diff = received - ordered;
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
                        <select
                          value={l.unit || ""}
                          onChange={(e) => setUnit(idx, e.target.value)}
                          className="input h-7 text-[11px] w-24 ml-auto mt-1"
                          title="Receiving unit — converted to base on save"
                        >
                          {unitOptionsFor(l).map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
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
