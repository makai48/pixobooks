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
import GlassSelect from "@/components/ui/GlassSelect";
import MoneyText from "@/components/ui/MoneyText";
import StatCard from "@/components/ui/StatCard";
import type { POStatus, PurchaseOrder } from "@/types";
import { cn, formatCurrency, formatDate, formatMoney } from "@/lib/utils";

const STATUS_COLORS: Record<POStatus, string> = {
  draft: "bg-ink/5 text-ink-soft",
  ordered: "bg-cyan-reg/10 text-cyan-reg border border-cyan-reg/30",
  received: "bg-success/10 text-success border border-success/30",
  cancelled: "bg-danger/10 text-danger border border-danger/30",
};

const STATUS_SHORT: Record<POStatus, string> = {
  draft: "DRAFT",
  ordered: "ORDER",
  received: "RECV",
  cancelled: "CANC",
};

export default function PurchaseOrders() {
  const { can, isAdmin, isAppAdmin, profile } = useAuth();
  const isAdminUser =
    isAdmin || isAppAdmin || (profile?.role || "").toLowerCase() === "admin";
  const canDeletePO = isAdminUser;
  // Admins retain FULL CRUD across every PO regardless of status; other
  // roles keep the existing status-gated workflow.
  const canEditAnyPO = isAdminUser || can("po.manage");
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

  const openEditor = (po: PurchaseOrder) => {
    setEdit(po);
    setOpen(true);
  };

  const remove = (po: PurchaseOrder) =>
    confirm(`Delete PO ${po.number}? Only Admins/Admin can perform this action.`) &&
    del.mutate(po.id, {
      onSuccess: () => toast.success("Deleted"),
      onError: (e) =>
        toast.error(
          e instanceof Error ? e.message : "Only admins can delete purchase orders"
        ),
    });

  return (
    <div className="p-2.5 md:p-6 space-y-2 md:space-y-4">
      {/* Sticky mobile header (Stock Ledger): stats + filter + count stay
          pinned while the ledger scrolls beneath. Desktop keeps the normal
          flow. Measured ≈22% of a 640px viewport — under the 25% drawer
          threshold, so nothing collapses. */}
      <div className="space-y-2 md:space-y-4 max-md:sticky max-md:top-0 max-md:z-20 max-md:-mx-2.5 max-md:-mt-2.5 max-md:px-2.5 max-md:pt-2.5 max-md:pb-2.5 max-md:bg-paper max-md:border-b max-md:border-line">
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

      <div className="hidden md:flex items-center gap-1 overflow-x-auto scrollbar-none">
        <span className="label text-[8px] md:text-[9px] text-ink-mute mr-0.5 shrink-0">Status</span>
        {(["all", "draft", "ordered", "received", "cancelled"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={cn(
              "chip border px-2 h-6 text-[9px] md:text-[10px] whitespace-nowrap shrink-0 uppercase tracking-wide transition",
              status === s ? "bg-ink text-paper border-ink" : "border-line hover:border-ink"
            )}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="paper-card p-2.5 md:p-4 flex flex-wrap items-center gap-x-1.5 gap-y-1.5 md:gap-3">
        <div className="relative flex-1 min-w-[100px] md:min-w-0">
          <Search className="w-3.5 h-3.5 md:w-4 md:h-4 absolute left-2 md:left-3 top-1/2 -translate-y-1/2 text-ink-mute pointer-events-none" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search PO number or vendor"
            aria-label="Search purchase orders"
            className="input input-sm pl-7 md:pl-9"
          />
        </div>
        <GlassSelect
          id="po-status-filter"
          value={status}
          onChange={(v) => setStatus(v as typeof status)}
          ariaLabel="Filter by status"
          options={[
            { value: "all", label: "All statuses" },
            { value: "draft", label: "Draft" },
            { value: "ordered", label: "Ordered" },
            { value: "received", label: "Received" },
            { value: "cancelled", label: "Cancelled" },
          ]}
          className="input input-sm select-glass max-md:px-1.5 md:hidden"
        />
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
            <span className="sm:hidden">New</span>
          </button>
        )}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-[10px] md:text-xs text-ink-mute inline-flex items-center gap-1.5 md:gap-2">
          <ShoppingBag className="w-3 h-3 md:w-3.5 md:h-3.5 shrink-0" />
          {filtered.length} of {pos.length}{" "}
          <span className="md:hidden">POs · tap for details</span>
          <span className="hidden md:inline">
            purchase orders · tap any row to view details
          </span>
        </div>
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
        <>
        <div className="hidden md:grid gap-2 md:gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((po) => (
            <div key={po.id} className="paper-card p-2.5 md:p-3 flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[9px] md:text-[10px] uppercase tracking-wide text-ink-mute truncate">
                    {formatDate(po.createdAt)} · {po.createdByName}
                  </div>
                  <div className="font-display text-sm md:text-base font-bold leading-tight truncate">
                    {po.number}
                  </div>
                  <div className="text-[10px] md:text-xs text-ink-mute truncate">{po.vendor}</div>
                </div>
                <span
                  className={cn(
                    "chip text-[8px] md:text-[10px] px-1.5 md:px-2 py-px shrink-0",
                    STATUS_COLORS[po.status]
                  )}
                >
                  {po.status}
                </span>
              </div>

              <div className="dashed-divider my-1.5" />

              <div className="text-[10px] md:text-xs space-y-0.5 max-h-16 overflow-auto">
                {po.lines.slice(0, 3).map((l, i) => (
                  <div key={i} className="flex justify-between gap-2">
                    <span className="truncate">
                      {l.qty}× {l.name}
                    </span>
                    <span className="num text-ink-mute shrink-0">
                      <MoneyText value={formatCurrency(l.qty * l.unitCost, currency)} />
                    </span>
                  </div>
                ))}
                {po.lines.length > 3 && (
                  <div className="text-[10px] text-ink-mute">+ {po.lines.length - 3} more</div>
                )}
              </div>

              <div className="flex items-baseline justify-between text-[10px] md:text-[11px] text-ink-mute mt-1">
                <span className="num">
                  {po.lines.length} line{po.lines.length === 1 ? "" : "s"}
                </span>
                <span className="num font-bold text-sm md:text-base text-ink">
                  <MoneyText value={formatMoney(po.total, currency)} />
                </span>
              </div>

              <div className="mt-auto pt-2 flex items-center gap-1">
                <button
                  onClick={() => setViewing(po)}
                  className="btn btn-outline btn-sm flex-1"
                  title="View details of ordered vs received items"
                >
                  <Eye className="w-3.5 h-3.5" />
                  View
                </button>
                {canEditAnyPO && po.status !== "received" &&
                  !po.lines.some(
                    (l) => Number(l.receivedBaseQty ?? l.receivedQty ?? 0) > 0
                  ) && (
                  <button
                    onClick={() => openEditor(po)}
                    className="btn btn-outline btn-sm flex-1"
                    title="Edit PO"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Edit
                  </button>
                )}
                {can("po.manage") && ["draft", "ordered"].includes(po.status) && (
                  <button
                    onClick={() => setReceiving(po)}
                    className="btn btn-primary btn-sm flex-1"
                    title="Receive PO"
                  >
                    <PackageCheck className="w-3.5 h-3.5" />
                    Receive
                  </button>
                )}
                {canDeletePO && po.status !== "received" &&
                  !po.lines.some(
                    (l) => Number(l.receivedBaseQty ?? l.receivedQty ?? 0) > 0
                  ) && (
                  <button
                    onClick={() => remove(po)}
                    className="btn btn-ghost btn-sm w-7 px-0 text-danger shrink-0"
                    title="Delete PO (Admin only)"
                    aria-label={`Delete ${po.number}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {po.status === "received" && po.receivedAt && (
                <div className="mt-1 text-[9px] md:text-[10px] text-success flex items-center gap-1">
                  <PackageCheck className="w-3 h-3" /> Received {formatDate(po.receivedAt)}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Mobile ledger — one dense row per PO, pinned height */}
        <div className="md:hidden paper-card overflow-hidden">
          <div className="divide-y">
            {filtered.map((po) => (
              <div key={po.id} className="flex items-center h-[30px] text-[11px] leading-tight">
                <button
                  onClick={() => setViewing(po)}
                  className="flex-1 h-full flex items-center gap-1.5 px-2 min-w-0 text-left hover:bg-paper/50 transition"
                  title={`${po.number} · ${po.vendor}`}
                >
                  <span
                    className={cn(
                      "shrink-0 w-[42px] text-center rounded-full border px-1 py-px text-[8px] uppercase tracking-wide font-bold leading-none",
                      STATUS_COLORS[po.status],
                      po.status === "draft" && "border-ink/15"
                    )}
                  >
                    {STATUS_SHORT[po.status]}
                  </span>
                  <span className="flex-1 min-w-0 truncate">
                    <span className="font-semibold">{po.number}</span>
                    <span className="text-ink-mute"> · {po.vendor}</span>
                  </span>
                  <span className="num font-bold shrink-0"><MoneyText value={formatMoney(po.total, currency)} /></span>
                </button>
                {canEditAnyPO && po.status !== "received" &&
                  !po.lines.some(
                    (l) => Number(l.receivedBaseQty ?? l.receivedQty ?? 0) > 0
                  ) && (
                  <button
                    onClick={() => openEditor(po)}
                    className="w-6 h-full inline-flex items-center justify-center text-ink-mute hover:bg-ink/5 transition shrink-0"
                    title="Edit PO"
                    aria-label={`Edit ${po.number}`}
                  >
                    <Edit3 className="w-3 h-3" />
                  </button>
                )}
                {can("po.manage") && ["draft", "ordered"].includes(po.status) && (
                  <button
                    onClick={() => setReceiving(po)}
                    className="w-6 h-full inline-flex items-center justify-center text-magenta-reg hover:bg-magenta-reg/10 transition shrink-0"
                    title="Receive PO"
                    aria-label={`Receive ${po.number}`}
                  >
                    <PackageCheck className="w-3 h-3" />
                  </button>
                )}
                {canDeletePO && po.status !== "received" &&
                  !po.lines.some(
                    (l) => Number(l.receivedBaseQty ?? l.receivedQty ?? 0) > 0
                  ) && (
                  <button
                    onClick={() => remove(po)}
                    className="w-6 h-full inline-flex items-center justify-center text-danger hover:bg-danger/10 transition shrink-0"
                    title="Delete PO"
                    aria-label={`Delete ${po.number}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
        </>
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
