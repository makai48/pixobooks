import { useMemo, useState } from "react";
import {
  Plus,
  Search,
  Edit3,
  Trash2,
  Mail,
  Phone,
  Gift,
  User,
} from "lucide-react";
import { toast } from "sonner";
import {
  useCustomers,
  useDeleteCustomer,
} from "@/hooks/useCustomers";
import { useShopSettings } from "@/hooks/useShopSettings";
import { useAuth } from "@/hooks/useAuth";
import { useAdjustLoyalty } from "@/hooks/useLoyalty";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import type { Customer } from "@/types";
import CustomerModal from "@/components/features/customers/CustomerModal";
import LoyaltyDialog from "@/components/features/customers/LoyaltyDialog";

export default function Customers() {
  const { can, profile } = useAuth();
  const { data: customers = [], isLoading } = useCustomers();
  const { data: settings } = useShopSettings();
  const del = useDeleteCustomer();
  const adjust = useAdjustLoyalty();

  const [q, setQ] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editCust, setEditCust] = useState<Customer | null>(null);
  const [loyaltyFor, setLoyaltyFor] = useState<Customer | null>(null);

  const filtered = useMemo(
    () =>
      customers.filter((c) => {
        const query = q.toLowerCase();
        return (
          !query ||
          c.name.toLowerCase().includes(query) ||
          (c.email || "").toLowerCase().includes(query) ||
          (c.phone || "").toLowerCase().includes(query)
        );
      }),
    [customers, q]
  );

  const totals = useMemo(
    () => ({
      count: customers.length,
      lifetime: customers.reduce((s, c) => s + c.totalSpent, 0),
      points: customers.reduce((s, c) => s + c.loyaltyPoints, 0),
    }),
    [customers]
  );

  return (
    <div className="p-6 space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Customers" value={String(totals.count)} icon={User} />
        <Stat
          label="Lifetime revenue"
          value={formatCurrency(totals.lifetime, settings?.currency)}
        />
        <Stat
          label="Loyalty points outstanding"
          value={totals.points.toLocaleString()}
          icon={Gift}
        />
      </div>

      <div className="paper-card p-4 flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, email or phone"
            className="input pl-9"
          />
        </div>
        {can("customers.manage") && (
          <button
            onClick={() => {
              setEditCust(null);
              setModalOpen(true);
            }}
            className="btn btn-primary"
          >
            <Plus className="w-4 h-4" /> New customer
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="paper-card p-10 text-center text-ink-mute">Loading...</div>
      ) : (
        <div className="paper-card overflow-hidden">
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-widest text-ink-mute bg-paper/60">
                  <th className="p-3 pl-5">Name</th>
                  <th className="p-3">Contact</th>
                  <th className="p-3 text-right">Lifetime spend</th>
                  <th className="p-3 text-right">Loyalty pts</th>
                  <th className="p-3">Joined</th>
                  <th className="p-3 pr-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-t hover:bg-paper/40">
                    <td className="p-3 pl-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-magenta-reg/10 text-magenta-reg font-bold flex items-center justify-center overflow-hidden border">
                          {c.avatarUrl ? (
                            <img src={c.avatarUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            c.name.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div className="font-semibold">{c.name}</div>
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-col gap-0.5 text-xs">
                        {c.email && (
                          <span className="inline-flex items-center gap-1 text-ink-soft">
                            <Mail className="w-3 h-3" />
                            {c.email}
                          </span>
                        )}
                        {c.phone && (
                          <span className="inline-flex items-center gap-1 text-ink-soft">
                            <Phone className="w-3 h-3" />
                            {c.phone}
                          </span>
                        )}
                        {!c.email && !c.phone && <span className="text-ink-mute">—</span>}
                      </div>
                    </td>
                    <td className="p-3 text-right num font-semibold">
                      {formatCurrency(c.totalSpent, settings?.currency)}
                    </td>
                    <td className="p-3 text-right">
                      <span
                        className={cn(
                          "chip num",
                          c.loyaltyPoints > 0
                            ? "bg-magenta-reg/10 text-magenta-reg border border-magenta-reg/30"
                            : "bg-ink/5 text-ink-mute"
                        )}
                      >
                        {c.loyaltyPoints}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-ink-mute">{formatDate(c.createdAt)}</td>
                    <td className="p-3 pr-5 text-right">
                      <div className="flex justify-end gap-1">
                        {can("loyalty.manage") && (
                          <button
                            onClick={() => setLoyaltyFor(c)}
                            className="btn btn-ghost h-8 w-8 p-0 text-magenta-reg"
                            title="Adjust loyalty"
                          >
                            <Gift className="w-4 h-4" />
                          </button>
                        )}
                        {can("customers.manage") && (
                          <>
                            <button
                              onClick={() => {
                                setEditCust(c);
                                setModalOpen(true);
                              }}
                              className="btn btn-ghost h-8 w-8 p-0"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() =>
                                confirm(`Delete customer "${c.name}"?`) &&
                                del.mutate(c.id, {
                                  onSuccess: () => toast.success("Customer deleted"),
                                })
                              }
                              className="btn btn-ghost h-8 w-8 p-0 text-danger"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-10 text-center text-ink-mute">
                      No customers yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalOpen && (
        <CustomerModal customer={editCust} onClose={() => setModalOpen(false)} />
      )}
      {loyaltyFor && (
        <LoyaltyDialog
          customer={loyaltyFor}
          onClose={() => setLoyaltyFor(null)}
          onSave={(points, notes) => {
            adjust.mutate(
              {
                customerId: loyaltyFor.id,
                points,
                type: points >= 0 ? "adjust" : "redeem",
                notes,
                createdBy: profile?.id,
              },
              {
                onSuccess: () => {
                  toast.success("Loyalty updated");
                  setLoyaltyFor(null);
                },
              }
            );
          }}
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="paper-card p-4">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-widest text-ink-mute">{label}</div>
        {Icon && <Icon className="w-4 h-4 text-ink-mute" />}
      </div>
      <div className="font-display text-2xl font-bold num mt-1">{value}</div>
    </div>
  );
}
