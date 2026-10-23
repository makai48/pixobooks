import { useMemo, useState } from "react";
import {
  Search,
  Plus,
  Truck,
  Mail,
  Phone,
  MapPin,
  Edit2,
  Trash2,
  Package,
  User as UserIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useSuppliers, useDeleteSupplier } from "@/hooks/useSuppliers";
import { useShopSettings } from "@/hooks/useShopSettings";
import { useAuth } from "@/hooks/useAuth";
import SupplierModal from "@/components/features/suppliers/SupplierModal";
import StatCard from "@/components/ui/StatCard";
import type { SupplierRecord } from "@/types";
import { formatCurrency } from "@/lib/utils";

export default function Suppliers() {
  const { can } = useAuth();
  const { data: suppliers = [], isLoading } = useSuppliers();
  const { data: settings } = useShopSettings();
  const del = useDeleteSupplier();

  const [q, setQ] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierRecord | null>(null);

  const filtered = useMemo(() => {
    const query = q.toLowerCase();
    if (!query) return suppliers;
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(query) ||
        (s.email || "").toLowerCase().includes(query) ||
        (s.location || "").toLowerCase().includes(query) ||
        (s.contactPerson || "").toLowerCase().includes(query) ||
        (s.items || []).some((it) => it.itemName.toLowerCase().includes(query))
    );
  }, [suppliers, q]);

  const canManage = can("suppliers.manage");
  const canDelete = can("suppliers.delete");

  const totals = useMemo(
    () => ({
      items: suppliers.reduce((s, x) => s + x.items.length, 0),
      contacts: suppliers.filter((s) => s.email || s.phone || s.contactPerson).length,
    }),
    [suppliers]
  );

  return (
    <div className="p-2.5 md:p-6 space-y-2 md:space-y-4">
      <div className="grid grid-cols-3 gap-1.5 md:gap-3">
        <StatCard label="Suppliers" value={String(suppliers.length)} />
        <StatCard label="Items supplied" value={String(totals.items)} tone="cyan" />
        <StatCard label="With contacts" value={String(totals.contacts)} />
      </div>

      <div className="paper-card p-2.5 md:p-4 flex items-center gap-1.5 md:gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="w-3.5 h-3.5 md:w-4 md:h-4 absolute left-2 md:left-3 top-1/2 -translate-y-1/2 text-ink-mute pointer-events-none" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search suppliers, items, contacts..."
            className="input input-sm pl-7 md:pl-9"
          />
        </div>
        <div className="hidden sm:flex items-center gap-1 text-[10px] md:text-xs text-ink-mute shrink-0">
          <Truck className="w-3 h-3 md:w-3.5 md:h-3.5" />
          {filtered.length} of {suppliers.length}
        </div>
        {canManage && (
          <button
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
            className="btn btn-primary btn-sm shrink-0"
          >
            <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" />
            <span className="hidden sm:inline">New supplier</span>
            <span className="sm:hidden">New</span>
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="paper-card p-6 md:p-10 text-center text-ink-mute text-sm">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="paper-card p-8 md:p-10 text-center">
          <Truck className="w-8 h-8 md:w-10 md:h-10 mx-auto text-ink-mute" />
          <div className="font-display text-base md:text-lg font-bold mt-2 md:mt-3">No suppliers yet</div>
          <div className="text-[11px] md:text-sm text-ink-mute mt-1">
            Add your first supplier to track purchases, contacts and prices.
          </div>
          {canManage && (
            <button
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
              className="btn btn-primary btn-sm mt-3 md:mt-4"
            >
              <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" /> Add supplier
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-1.5 md:gap-4">
          {filtered.map((s) => (
            <div key={s.id} className="paper-card overflow-hidden flex flex-col">
              <div className="p-2.5 md:p-4 flex items-start gap-2 md:gap-3">
                <div className="w-9 h-9 md:w-14 md:h-14 rounded-full border-2 overflow-hidden bg-paper flex items-center justify-center shrink-0">
                  {s.avatarUrl ? (
                    <img src={s.avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <UserIcon className="w-4 h-4 md:w-6 md:h-6 text-ink-mute" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-display font-bold text-xs md:text-base truncate leading-tight">
                    {s.name}
                  </div>
                  {s.contactPerson && (
                    <div className="text-[9px] md:text-xs text-ink-mute truncate">
                      {s.contactPerson}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5 md:mt-1 text-[9px] md:text-[11px] text-ink-soft">
                    {s.email && (
                      <span className="inline-flex items-center gap-1 truncate max-w-[200px]">
                        <Mail className="w-2.5 h-2.5 md:w-3 md:h-3 shrink-0" /> {s.email}
                      </span>
                    )}
                    {s.phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="w-2.5 h-2.5 md:w-3 md:h-3 shrink-0" /> {s.phone}
                      </span>
                    )}
                  </div>
                  {s.location && (
                    <div className="inline-flex items-center gap-1 text-[9px] md:text-[11px] text-ink-mute mt-0.5 md:mt-1 truncate max-w-full">
                      <MapPin className="w-2.5 h-2.5 md:w-3 md:h-3 shrink-0" /> {s.location}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-0.5 md:gap-1 shrink-0">
                  {canManage && (
                    <button
                      onClick={() => {
                        setEditing(s);
                        setModalOpen(true);
                      }}
                      className="h-6 w-6 md:h-8 md:w-8 p-0 inline-flex items-center justify-center rounded text-ink-mute hover:bg-paper"
                      title="Edit supplier"
                    >
                      <Edit2 className="w-3 h-3 md:w-3.5 md:h-3.5" />
                    </button>
                  )}
                  {canDelete && (
                    <button
                      onClick={() =>
                        confirm(`Delete "${s.name}"?`) &&
                        del.mutate(s.id, {
                          onSuccess: () => toast.success("Supplier deleted"),
                        })
                      }
                      className="h-6 w-6 md:h-8 md:w-8 p-0 inline-flex items-center justify-center rounded text-danger hover:bg-danger/10"
                      title="Delete supplier"
                    >
                      <Trash2 className="w-3 h-3 md:w-3.5 md:h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <div className="dashed-divider mx-2.5 md:mx-4" />
              <div className="p-2.5 md:p-4">
                <div className="text-[9px] md:text-[11px] uppercase tracking-wide md:tracking-widest text-ink-mute mb-1 md:mb-2 inline-flex items-center gap-1">
                  <Package className="w-2.5 h-2.5 md:w-3 md:h-3" /> Items supplied ({s.items.length})
                </div>
                {s.items.length === 0 ? (
                  <div className="text-[10px] md:text-xs text-ink-mute">No items linked yet.</div>
                ) : (
                  <>
                    <div className="md:hidden text-[10px] text-ink-soft truncate">
                      {s.items
                        .slice(0, 2)
                        .map((it) => it.itemName)
                        .join(", ")}
                      {s.items.length > 2 ? ` +${s.items.length - 2}` : ""}
                    </div>
                    <div className="hidden md:block overflow-auto max-h-40">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-[10px] uppercase tracking-widest text-ink-mute">
                            <th className="pb-1">Item</th>
                            <th className="pb-1 text-right">Qty</th>
                            <th className="pb-1">UOM</th>
                            <th className="pb-1 text-right">Price</th>
                          </tr>
                        </thead>
                        <tbody>
                          {s.items.map((it, i) => (
                            <tr key={i} className="border-t border-line/50">
                              <td className="py-1 truncate max-w-[140px]">
                                {it.itemName}
                              </td>
                              <td className="py-1 num text-right">{it.qty}</td>
                              <td className="py-1 text-xs text-ink-mute">{it.unit}</td>
                              <td className="py-1 num text-right font-semibold">
                                {formatCurrency(
                                  it.unitPrice,
                                  it.currency || settings?.currency
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
                {s.notes && (
                  <div className="hidden md:block mt-3 text-xs text-ink-mute line-clamp-3">
                    {s.notes}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <SupplierModal
          supplier={editing}
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
