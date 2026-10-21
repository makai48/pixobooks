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
  Boxes,
  ShoppingBag,
  Ruler,
} from "lucide-react";
import SubNav from "@/components/layout/SubNav";
import { toast } from "sonner";
import { useSuppliers, useDeleteSupplier } from "@/hooks/useSuppliers";
import { useShopSettings } from "@/hooks/useShopSettings";
import { useAuth } from "@/hooks/useAuth";
import SupplierModal from "@/components/features/suppliers/SupplierModal";
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

  return (
    <div className="p-4 md:p-6 space-y-4">
      <SubNav
        items={[
          { to: "/inventory", label: "Inventory & BOM", icon: Boxes },
          { to: "/purchase-orders", label: "Purchase Orders", icon: ShoppingBag },
          { to: "/suppliers", label: "Suppliers", icon: Truck },
          { to: "/settings", label: "Unit Conversions", icon: Ruler },
        ]}
      />
      <div className="paper-card p-4 flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search suppliers, items, contacts..."
            className="input pl-9"
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-ink-mute">
          <Truck className="w-3.5 h-3.5" />
          {filtered.length} of {suppliers.length}
        </div>
        {canManage && (
          <button
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
            className="btn btn-primary"
          >
            <Plus className="w-4 h-4" /> New supplier
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="paper-card p-10 text-center text-ink-mute">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="paper-card p-10 text-center">
          <Truck className="w-10 h-10 mx-auto text-ink-mute" />
          <div className="font-display text-lg font-bold mt-3">No suppliers yet</div>
          <div className="text-sm text-ink-mute mt-1">
            Add your first supplier to track purchases, contacts and prices.
          </div>
          {canManage && (
            <button
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
              className="btn btn-primary mt-4"
            >
              <Plus className="w-4 h-4" /> Add supplier
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((s) => (
            <div key={s.id} className="paper-card overflow-hidden flex flex-col">
              <div className="p-4 flex items-start gap-3">
                <div className="w-14 h-14 rounded-full border-2 overflow-hidden bg-paper flex items-center justify-center shrink-0">
                  {s.avatarUrl ? (
                    <img src={s.avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <UserIcon className="w-6 h-6 text-ink-mute" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-display font-bold text-base truncate">
                    {s.name}
                  </div>
                  {s.contactPerson && (
                    <div className="text-xs text-ink-mute truncate">
                      {s.contactPerson}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 mt-1 text-[11px] text-ink-soft">
                    {s.email && (
                      <span className="inline-flex items-center gap-1 truncate max-w-[200px]">
                        <Mail className="w-3 h-3" /> {s.email}
                      </span>
                    )}
                    {s.phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="w-3 h-3" /> {s.phone}
                      </span>
                    )}
                  </div>
                  {s.location && (
                    <div className="inline-flex items-center gap-1 text-[11px] text-ink-mute mt-1">
                      <MapPin className="w-3 h-3" /> {s.location}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  {canManage && (
                    <button
                      onClick={() => {
                        setEditing(s);
                        setModalOpen(true);
                      }}
                      className="btn btn-ghost h-8 w-8 p-0"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
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
                      className="btn btn-ghost h-8 w-8 p-0 text-danger"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <div className="dashed-divider mx-4" />
              <div className="p-4">
                <div className="text-[11px] uppercase tracking-widest text-ink-mute mb-2 inline-flex items-center gap-1">
                  <Package className="w-3 h-3" /> Items supplied ({s.items.length})
                </div>
                {s.items.length === 0 ? (
                  <div className="text-xs text-ink-mute">No items linked yet.</div>
                ) : (
                  <div className="overflow-auto max-h-40">
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
                )}
                {s.notes && (
                  <div className="mt-3 text-xs text-ink-mute line-clamp-3">
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
