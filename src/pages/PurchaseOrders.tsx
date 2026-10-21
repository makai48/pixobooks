import { useMemo, useState } from "react";
import {
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  Edit3,
  PackageCheck,
  Eye,
  Boxes,
  Truck,
  Ruler,
} from "lucide-react";
import SubNav from "@/components/layout/SubNav";
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
import type { POStatus, PurchaseOrder } from "@/types";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

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

  return (
    <div className="p-6 space-y-4">
      <SubNav
        items={[
          { to: "/inventory", label: "Inventory & BOM", icon: Boxes },
          { to: "/purchase-orders", label: "Purchase Orders", icon: ShoppingBag },
          { to: "/suppliers", label: "Suppliers", icon: Truck },
          { to: "/settings", label: "Unit Conversions", icon: Ruler },
        ]}
      />
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Draft POs" value={String(summary.draft)} />
        <Stat label="Awaiting delivery" value={String(summary.open)} tone="cyan" />
        <Stat
          label="Value on order"
          value={formatCurrency(summary.onOrder, settings?.currency)}
          tone="magenta"
        />
      </div>

      <div className="paper-card p-4 flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search PO number or vendor"
            className="input pl-9"
          />
        </div>
        <div className="flex bg-paper border rounded-md p-0.5 overflow-auto">
          {(["all", "draft", "ordered", "received", "cancelled"] as const).map((s) => (
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
        {can("po.manage") && (
          <button
            onClick={() => {
              setEdit(null);
              setOpen(true);
            }}
            className="btn btn-primary"
          >
            <Plus className="w-4 h-4" /> New PO
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="paper-card p-10 text-center text-ink-mute">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="paper-card p-12 text-center">
          <ShoppingBag className="w-10 h-10 text-ink-mute mx-auto" />
          <div className="font-display font-bold text-lg mt-3">No purchase orders</div>
          <div className="text-ink-mute text-sm mt-1">
            Create POs for materials — when received, stock is auto-incremented.
          </div>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((po) => (
            <div key={po.id} className="paper-card p-4">
            
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-widest text-ink-mute">
                    {formatDate(po.createdAt)} · {po.createdByName}
                  </div>
                  <div className="font-display text-lg font-bold">{po.number}</div>
                  <div className="text-sm text-ink-mute truncate">{po.vendor}</div>
                </div>
                <span className={cn("chip", STATUS_COLORS[po.status])}>{po.status}</span>
              </div>
              <div className="dashed-divider my-3" />
              <div className="text-sm space-y-1 max-h-24 overflow-auto">
                {po.lines.slice(0, 3).map((l, i) => (
                  <div key={i} className="flex justify-between">
                    <span className="truncate pr-2">
                      {l.qty}× {l.name}
                    </span>
                    <span className="num text-ink-mute">
                      {formatCurrency(l.qty * l.unitCost, settings?.currency)}
                    </span>
                  </div>
                ))}
                {po.lines.length > 3 && (
                  <div className="text-xs text-ink-mute">+ {po.lines.length - 3} more</div>
                )}
              </div>
              <div className="dashed-divider my-3" />
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-ink-mute">Total</span>
                <span className="num font-bold text-lg">
                  {formatCurrency(po.total, settings?.currency)}
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={() => setViewing(po)}
                  className="btn btn-outline flex-1 h-9"
                  title="View details of ordered vs received items"
                >
                  <Eye className="w-3.5 h-3.5" /> View details
                </button>
                {(canEditAnyPO && (po.status !== "received" || isAdmin)) && (
                  <button
                    onClick={() => {
                      setEdit(po);
                      setOpen(true);
                    }}
                    className="btn btn-outline flex-1 h-9"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Edit
                  </button>
                )}
                {can("po.manage") && ["draft", "ordered"].includes(po.status) && (
                  <button
                    onClick={() => setReceiving(po)}
                    className="btn btn-primary flex-1 h-9"
                  >
                    <PackageCheck className="w-3.5 h-3.5" /> Receive
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
                    className="btn btn-ghost h-9 w-9 p-0 text-danger"
                    title="Delete PO (Admin only)"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              {po.status === "received" && po.receivedAt && (
                <div className="mt-3 text-[11px] text-success flex items-center gap-1">
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

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "cyan" | "magenta";
}) {
  return (
    <div className="paper-card p-4">
      <div className="text-[11px] uppercase tracking-widest text-ink-mute">{label}</div>
      <div
        className={cn(
          "font-display text-2xl font-bold num mt-1",
          tone === "cyan" && "text-cyan-reg",
          tone === "magenta" && "text-magenta-reg"
        )}
      >
        {value}
      </div>
    </div>
  );
}
