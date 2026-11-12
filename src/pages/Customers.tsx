import { useMemo, useState } from "react";
import {
  Plus,
  Search,
  Edit3,
  Trash2,
  Mail,
  Phone,
  Gift,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  useCustomers,
  useDeleteCustomer,
} from "@/hooks/useCustomers";
import { useShopSettings } from "@/hooks/useShopSettings";
import { useAuth } from "@/hooks/useAuth";
import { useAdjustLoyalty } from "@/hooks/useLoyalty";
import { cn, formatCurrency, formatDate, formatMoney } from "@/lib/utils";
import type { Customer } from "@/types";
import CustomerModal from "@/components/features/customers/CustomerModal";
import LoyaltyDialog from "@/components/features/customers/LoyaltyDialog";
import StatCard from "@/components/ui/StatCard";
import "./customers.css";

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

  const currency = settings?.currency || "USD";
  const canManage = can("customers.manage");
  const canLoyalty = can("loyalty.manage");

  const openCustomer = (c: Customer) => {
    if (canManage) {
      setEditCust(c);
      setModalOpen(true);
    } else if (canLoyalty) {
      setLoyaltyFor(c);
    }
  };

  return (
    <div className="customer-page p-2.5 md:p-6 space-y-2 md:space-y-4">
      <div className="grid grid-cols-3 gap-1.5 md:gap-3">
        <StatCard label="Customers" value={String(totals.count)} />
        <StatCard
          label="Lifetime revenue"
          value={formatMoney(totals.lifetime, currency)}
          fullValue={formatCurrency(totals.lifetime, currency)}
        />
        <StatCard
          label="Loyalty outstanding"
          value={totals.points.toLocaleString()}
        />
      </div>

      <div className="paper-card p-2.5 md:p-4 flex items-center gap-1.5 md:gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="w-3.5 h-3.5 md:w-4 md:h-4 absolute left-2 md:left-3 top-1/2 -translate-y-1/2 text-ink-mute pointer-events-none" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, email or phone"
            className="input input-sm pl-7 md:pl-9"
          />
        </div>
        <div className="hidden md:flex items-center gap-1 text-[10px] md:text-xs text-ink-mute shrink-0">
          <Users className="w-3 h-3 md:w-3.5 md:h-3.5" />
          {filtered.length} of {customers.length}
        </div>
        {canManage && (
          <button
            onClick={() => {
              setEditCust(null);
              setModalOpen(true);
            }}
            className="btn btn-primary btn-sm shrink-0 max-md:w-7 max-md:px-0"
            title="New customer"
          >
            <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" />
            <span className="hidden sm:inline">New customer</span>
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 text-[9px] text-ink-mute md:hidden">
        <span className="inline-flex items-center gap-1">
          <Users className="h-3 w-3 md:h-3.5 md:w-3.5" />
          {filtered.length} of {customers.length} customers
        </span>
        <span className="md:hidden">tap a row to open</span>
      </div>

      <div className="paper-card overflow-hidden">
        {isLoading ? (
          <div className="p-6 md:p-10 text-center text-ink-mute text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 md:p-12 text-center text-ink-mute">
            <Users className="w-8 h-8 mx-auto text-ink-mute" />
            <div className="mt-2 text-sm">
              {customers.length === 0 ? "No customers yet." : "No customers match this search."}
            </div>
          </div>
        ) : (
          <div className="divide-y">
            {filtered.map((c) => {
              const initials = c.name.trim().charAt(0).toUpperCase() || "?";
              return (
                <div
                  key={c.id}
                  className="flex items-center h-[44px] md:h-[38px] hover:bg-paper/50 transition text-[11px] leading-tight"
                >
                  <button
                    onClick={() => openCustomer(c)}
                    className="flex-1 h-full min-w-0 flex items-center gap-1.5 md:gap-3 px-2 md:px-5 text-left"
                    title={c.name}
                  >
                    <span className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-magenta-reg/10 text-magenta-reg font-bold text-[9px] md:text-xs flex items-center justify-center overflow-hidden border shrink-0">
                      {c.avatarUrl ? (
                        <img src={c.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        initials
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-[11px] md:text-sm">
                        {c.name}
                      </span>
                      <span className="hidden md:inline-flex items-center gap-1 text-[10px] text-ink-mute min-w-0">
                        {c.email ? (
                          <>
                            <Mail className="w-2.5 h-2.5 shrink-0" />
                            <span className="truncate">{c.email}</span>
                          </>
                        ) : c.phone ? (
                          <>
                            <Phone className="w-2.5 h-2.5 shrink-0" />
                            <span className="truncate">{c.phone}</span>
                          </>
                        ) : null}
                      </span>
                      <span className="md:hidden block text-[9px] text-ink-mute truncate">
                        {c.email || c.phone || ""}
                      </span>
                    </span>
                    <span className="num font-semibold text-[10px] md:text-sm text-right shrink-0 md:w-24">
                      {formatMoney(c.totalSpent, currency)}
                    </span>
                    <span
                      className={cn(
                        "hidden md:inline-flex num text-[9px] md:text-[10px] px-1 md:px-1.5 py-px rounded-full border shrink-0 md:w-14 justify-center",
                        c.loyaltyPoints > 0
                          ? "bg-magenta-reg/10 text-magenta-reg border-magenta-reg/30"
                          : "bg-ink/5 text-ink-mute border-line"
                      )}
                      title="Loyalty points"
                    >
                      {c.loyaltyPoints}
                    </span>
                    <span className="hidden lg:inline text-[10px] text-ink-mute w-20 text-right shrink-0">
                      {formatDate(c.createdAt)}
                    </span>
                  </button>
                  <div className="flex items-center gap-0.5 md:gap-1 pr-1 md:pr-4 shrink-0">
                    {canLoyalty && (
                      <button
                        onClick={() => setLoyaltyFor(c)}
                        className="h-7 w-7 md:h-8 md:w-8 p-0 inline-flex items-center justify-center rounded text-magenta-reg hover:bg-magenta-reg/10"
                        title="Adjust loyalty"
                      >
                        <Gift className="w-3.5 h-3.5 md:w-4 md:h-4" />
                      </button>
                    )}
                    {canManage && (
                      <>
                        <button
                          onClick={() => {
                            setEditCust(c);
                            setModalOpen(true);
                          }}
                          className="h-7 w-7 md:h-8 md:w-8 p-0 inline-flex items-center justify-center rounded text-ink-mute hover:bg-paper"
                          title="Edit customer"
                        >
                          <Edit3 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                        </button>
                        <button
                          onClick={() =>
                            confirm(`Delete customer "${c.name}"?`) &&
                            del.mutate(c.id, {
                              onSuccess: () => toast.success("Customer deleted"),
                            })
                          }
                          className="h-7 w-7 md:h-8 md:w-8 p-0 inline-flex items-center justify-center rounded text-danger hover:bg-danger/10"
                          title="Delete customer"
                        >
                          <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

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
