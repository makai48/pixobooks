import { X, PackageCheck, ShoppingBag, AlertCircle } from "lucide-react";
import type { PurchaseOrder } from "@/types";
import { useShopSettings } from "@/hooks/useShopSettings";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import MoneyText from "@/components/ui/MoneyText";

/**
 * Read-only PO details modal — displays every ordered line side-by-side
 * with the actually-received quantity so recipients and admins can audit
 * discrepancies (short-shipped, over-shipped, damaged, cancelled).
 * All data is derived from the PO's `lines` JSONB; no mutations occur.
 */
export default function POViewDetailsModal({
  po,
  onClose,
}: {
  po: PurchaseOrder;
  onClose: () => void;
}) {
  const { data: settings } = useShopSettings();

  const totals = po.lines.reduce(
    (acc, l) => {
      const ordered = Number(l.qty || 0);
      // Prefer the entered (unit-based) receipt so it compares like-for-like
      // with the ordered quantity; receivedQty is the base-unit total.
      const received =
        typeof l.receivedEnteredQty === "number"
          ? l.receivedEnteredQty
          : typeof l.receivedQty === "number" && l.receivedQty >= 0
          ? l.receivedQty
          : po.status === "received"
          ? ordered
          : 0;
      acc.ordered += ordered;
      acc.received += received;
      acc.orderedValue += ordered * (l.unitCost || 0);
      acc.receivedValue += received * (l.unitCost || 0);
      if (received < ordered) acc.discrepancies += 1;
      return acc;
    },
    { ordered: 0, received: 0, orderedValue: 0, receivedValue: 0, discrepancies: 0 }
  );

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-4 animate-fade-in">
      <div className="paper-card w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col">
        <div className="p-5 border-b flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-widest text-ink-mute">
              Purchase order details
            </div>
            <h2 className="font-display text-xl font-bold truncate">
              {po.number} · {po.vendor}
            </h2>
            <div className="text-xs text-ink-mute mt-0.5">
              Created {formatDate(po.createdAt)} by {po.createdByName}
              {po.receivedAt && (
                <span className="ml-2 inline-flex items-center gap-1 text-success">
                  <PackageCheck className="w-3 h-3" /> Received{" "}
                  {formatDate(po.receivedAt)}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost h-9 w-9 p-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-auto scroll-lined">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <MiniStat
              label="Ordered qty"
              value={totals.ordered.toLocaleString()}
              icon={ShoppingBag}
            />
            <MiniStat
              label="Received qty"
              value={totals.received.toLocaleString()}
              icon={PackageCheck}
              tone={
                totals.received === totals.ordered
                  ? "success"
                  : totals.received === 0
                  ? undefined
                  : "warning"
              }
            />
            <MiniStat
              label="Ordered value"
              value={formatCurrency(totals.orderedValue, settings?.currency)}
            />
            <MiniStat
              label="Received value"
              value={formatCurrency(totals.receivedValue, settings?.currency)}
              tone={
                totals.receivedValue === totals.orderedValue ? "success" : undefined
              }
            />
          </div>

          {totals.discrepancies > 0 && po.status === "received" && (
            <div className="paper-card p-3 flex items-center gap-2 border-warning/40 bg-warning/5 text-warning">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <div className="text-xs font-semibold">
                {totals.discrepancies} line{totals.discrepancies === 1 ? "" : "s"}{" "}
                received short of the ordered quantity.
              </div>
            </div>
          )}

          <div className="paper-card overflow-hidden">
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-widest text-ink-mute bg-paper/60">
                    <th className="p-3 pl-5">Material</th>
                    <th className="p-3 text-right">Ordered</th>
                    <th className="p-3 text-right">Received</th>
                    <th className="p-3 text-right">Diff</th>
                    <th className="p-3 text-right">Unit cost</th>
                    <th className="p-3 text-right pr-5">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {po.lines.map((l, i) => {
                    const ordered = Number(l.qty || 0);
                    const received =
                      typeof l.receivedEnteredQty === "number"
                        ? l.receivedEnteredQty
                        : typeof l.receivedQty === "number" && l.receivedQty >= 0
                        ? l.receivedQty
                        : po.status === "received"
                        ? ordered
                        : 0;
                    const diff = received - ordered;
                    return (
                      <tr key={i} className="border-t">
                        <td className="p-3 pl-5">
                          <div className="font-semibold">{l.name}</div>
                          {l.unit && (
                            <div className="text-[11px] text-ink-mute">{l.unit}</div>
                          )}
                        </td>
                        <td className="p-3 text-right num">
                          {ordered.toLocaleString()}
                        </td>
                        <td className="p-3 text-right num font-semibold">
                          {po.status === "draft" || po.status === "cancelled"
                            ? "—"
                            : received.toLocaleString()}
                        </td>
                        <td
                          className={cn(
                            "p-3 text-right num",
                            diff < 0 && "text-danger font-semibold",
                            diff > 0 && "text-success font-semibold"
                          )}
                        >
                          {po.status === "draft" || po.status === "cancelled"
                            ? "—"
                            : diff === 0
                            ? "0"
                            : diff > 0
                            ? `+${diff.toLocaleString()}`
                            : diff.toLocaleString()}
                        </td>
                        <td className="p-3 text-right num text-ink-mute">
                          {formatCurrency(l.unitCost, settings?.currency)}
                        </td>
                        <td className="p-3 pr-5 text-right num font-semibold">
                          {formatCurrency(
                            ordered * (l.unitCost || 0),
                            settings?.currency
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {po.lines.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="p-6 text-center text-ink-mute text-sm"
                      >
                        No line items on this PO.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {po.notes && (
            <div className="paper-card p-3">
              <div className="text-[11px] uppercase tracking-widest text-ink-mute mb-1">
                Notes
              </div>
              <div className="text-sm whitespace-pre-wrap">{po.notes}</div>
            </div>
          )}
        </div>

        <div className="p-4 border-t flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-primary">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: "success" | "warning";
}) {
  return (
    <div className="paper-card p-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-widest text-ink-mute">
          {label}
        </div>
        {Icon && <Icon className="w-3.5 h-3.5 text-ink-mute" />}
      </div>
      <div
        className={cn(
          "font-display text-lg font-bold num mt-1",
          tone === "success" && "text-success",
          tone === "warning" && "text-warning"
        )}
      >
        <MoneyText value={value} />
      </div>
    </div>
  );
}
