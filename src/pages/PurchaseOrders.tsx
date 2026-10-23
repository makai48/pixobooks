import { useMemo, useState } from "react";
import {
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  Edit3,
  PackageCheck,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import {
  usePurchaseOrders,
  useDeletePO,
} from "@/hooks/usePurchaseOrders";
import { useShopSettings } from "@/hooks/useShopSettings";
import { useAuth } from "@/hooks/useAuth";
import POModal from "@/components/features/po/POModal";
import ReceivePOModal from "@/components/features/po/ReceivePOModal";
import POViewDetailsModal from "@/components/features/po/POViewDetailsModal";
import StatCard from "@/components/ui/StatCard";
import type { POStatus, PurchaseOrder } from "@/types";
import { cn, formatCurrency, formatDate, formatMoney } from "@/lib/utils";

const STATUS_COLORS: Record<POStatus, string> = {
  draft: "bg-ink/5 text-ink-soft",
  ordered: "bg-cyan-reg/10 text-cyan-reg border border-cyan-reg/30",
  received: "bg-success/10 text-success border border-success/30",
  cancelled: "bg-danger/10 text-danger border border-danger/30",
};

export default function PurchaseOrders() {
  const { can, isOwner, isAppOwner, profile } = useAuth();
  const isAdmin =
    isOwner || isAppOwner || (profile?.role || "").toLowerCase() === "admin";
  const canDeletePO = isAdmin;
  // Admins retain FULL CRUD across every PO regardless of status; other
  // roles keep the existing status-gated workflow.
  const canEditAnyPO = isAdmin || can("po.manage");
  const { data: pos = [], isLoading } = usePurchaseOrders();
  const { data: settings } = useShopSettings();
  const del = useDeletePO();

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | POStatus>("all");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<PurchaseOrder | null>(null);
  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null);
  const [viewing, setViewing] = useState<PurchaseOrder | null>(null);

  const filtered = useMemo(
    () =>
      pos.filter((p) => {
        if (status !== "all" && p.status !== status) return false;
        if (q) {
          const query = q.toLowerCase();
          return (
            p.number.toLowerCase().includes(query) ||
            p.vendor.toLowerCase().includes(query)
          );
        }
        return true;
      }),
    [pos, q, status]
  );

  const summary = useMemo(() => {
    const active = pos.filter((p) => ["draft", "ordered"].includes(p.status));
    return {
      open: pos.filter((p) => p.status === "ordered").length,
      draft: pos.filter((p) => p.status === "draft").length,
      onOrder: active.reduce((s, p) => s + p.total, 0),
    };
  }, [pos]);

  const currency = settings?.currency || "USD";

  return (
    <div className="p-2.5 md:p-6 space-y-2 md:space-y-4">
      <div className="grid grid-cols-3 gap-1.5 md:gap-3">
        <StatCard label="Draft POs" value={String(summary.draft)} />
        <StatCard
          label="Awaiting delivery"
          value={String(summary.open)}
          tone="cyan"
        />
        <StatCard
          label="Value on order"
          value={formatMoney(summary.onOrder, currency)}
          fullValue={formatCurrency(summary.onOrder, currency)}
          tone="magenta"
        />
      </div>

      <div className="paper-card p-2.5 md:p-4 flex flex-col md:flex-row md:items-center gap-1.5 md:gap-3">
        <div className="relative md:flex-1">
          <Search className="w-3.5 h-3.5 md:w-4 md:h-4 absolute left-2 md:left-3 top-1/2 -translate-y-1/2 text-ink-mute pointer-events-none" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search PO number or vendor"
            className="input input-sm pl-7 md:pl-9"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex bg-paper border rounded-md p-0.5 overflow-x-auto scrollbar-none min-w-0 flex-1 md:flex-none">
            {(["all", "draft", "ordered", "received", "cancelled"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={cn(
                  "px-1.5 md:px-3 h-6 md:h-8 text-[9px] md:text-xs uppercase tracking-wide md:tracking-widest rounded whitespace-nowrap",
                  status === s ? "bg-ink text-paper" : "text-ink-mute"
                )}
              >
                {s}
              </button>
            ))}
          </div>
          {can("po.manage") && (
            <button
              onClick={() => {
                setEdit(null);
                setOpen(true);
              }}
              className="btn btn-primary btn-sm shrink-0"
            >
              <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" />
              <span className="hidden sm:inline">New PO</span>
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="paper-card p-6 md:p-10 text-center text-ink-mute text-sm">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="paper-card p-8 md:p-12 text-center">
          <ShoppingBag className="w-8 h-8 md:w-10 md:h-10 text-ink-mute mx-auto" />
          <div className="font-display font-bold text-base md:text-lg mt-2 md:mt-3">No purchase orders</div>
          <div className="text-ink-mute text-[11px] md:text-sm mt-1">
            Create POs for materials — when received, stock is auto-incremented.
          </div>
        </div>
      ) : (
        <div className="grid gap-1.5 md:gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((po) => (
            <div key={po.id} className="paper-card p-2.5 md:p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[9px] md:text-[11px] uppercase tracking-wide md:tracking-widest text-ink-mute truncate">
                    {formatDate(po.createdAt)} · {po.createdByName}
                  </div>
                  <div className="font-display text-sm md:text-lg font-bold leading-tight">{po.number}</div>
                  <div className="text-[10px] md:text-sm text-ink-mute truncate">{po.vendor}</div>
                </div>
                <span className={cn("chip text-[8px] md:text-xs px-1.5 md:px-2 py-px md:py-0.5 shrink-0", STATUS_COLORS[po.status])}>
                  {po.status}
                </span>
              </div>
              <div className="dashed-divider my-1.5 md:my-3" />
              <div className="hidden md:block text-sm space-y-1 max-h-24 overflow-auto">
                {po.lines.slice(0, 3).map((l, i) => (
                  <div key={i} className="flex justify-between">
                    <span className="truncate pr-2">
                      {l.qty}× {l.name}
                    </span>
                    <span className="num text-ink-mute">
                      {formatCurrency(l.qty * l.unitCost, currency)}
                    </span>
                  </div>
                ))}
                {po.lines.length > 3 && (
                  <div className="text-xs text-ink-mute">+ {po.lines.length - 3} more</div>
                )}
              </div>
              <div className="flex items-baseline justify-between text-[10px] md:text-xs text-ink-mute">
                <span className="num">
                  {po.lines.length} line{po.lines.length === 1 ? "" : "s"}
                </span>
                <span className="num font-bold text-sm md:text-lg text-ink">
                  {formatMoney(po.total, currency)}
                </span>
              </div>

              <div className="mt-2 md:mt-4 flex items-center gap-1 md:gap-2">
                <button
                  onClick={() => setViewing(po)}
                  className="btn btn-outline btn-sm flex-1"
                  title="View details of ordered vs received items"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">View details</span>
                </button>
                {(canEditAnyPO && (po.status !== "received" || isAdmin)) && (
                  <button
                    onClick={() => {
                      setEdit(po);
                      setOpen(true);
                    }}
                    className="btn btn-outline btn-sm flex-1"
                    title="Edit PO"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">Edit</span>
                  </button>
                )}
                {can("po.manage") && ["draft", "ordered"].includes(po.status) && (
                  <button
                    onClick={() => setReceiving(po)}
                    className="btn btn-primary btn-sm flex-1"
                    title="Receive PO"
                  >
                    <PackageCheck className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">Receive</span>
                  </button>
                )}
                {canDeletePO && (
                  <button
                    onClick={() =>
                      confirm(`Delete PO ${po.number}? Only Admins/Owner can perform this action.`) &&
                      del.mutate(po.id, {
                        onSuccess: () => toast.success("Deleted"),
                        onError: (e) =>
                          toast.error(
                            e instanceof Error
                              ? e.message
                              : "Only admins can delete purchase orders"
                          ),
                      })
                    }
                    className="btn btn-ghost btn-sm max-md:w-7 max-md:px-0 text-danger shrink-0"
                    title="Delete PO (Admin only)"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">Delete</span>
                  </button>
                )}
              </div>
              {po.status === "received" && po.receivedAt && (
                <div className="mt-1.5 md:mt-3 text-[9px] md:text-[11px] text-success flex items-center gap-1">
                  <PackageCheck className="w-3 h-3" /> Received {formatDate(po.receivedAt)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {open && <POModal po={edit} onClose={() => setOpen(false)} />}
      {receiving && (
        <ReceivePOModal po={receiving} onClose={() => setReceiving(null)} />
      )}
      {viewing && (
        <POViewDetailsModal po={viewing} onClose={() => setViewing(null)} />
      )}
    </div>
  );
}
