import { useMemo, useState } from "react";
import { PauseCircle, PlayCircle, Trash2, Search, User, LayoutDashboard, FileText, Receipt } from "lucide-react";
import SubNav from "@/components/layout/SubNav";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import {
  useHeldTickets,
  useDeleteHeldTicket,
} from "@/hooks/useHeldTickets";
import { useAuth } from "@/hooks/useAuth";
import { useShopSettings } from "@/hooks/useShopSettings";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export default function HeldTickets() {
  const nav = useNavigate();
  const { profile } = useAuth();
  const { data: settings } = useShopSettings();
  const { data: tickets = [], isLoading } = useHeldTickets();
  const del = useDeleteHeldTicket();
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<"mine" | "all">("all");

  const filtered = useMemo(
    () =>
      tickets.filter((t) => {
        const matchScope = scope === "all" || t.cashierId === profile?.id;
        const matchQ =
          !q ||
          t.label.toLowerCase().includes(q.toLowerCase()) ||
          (t.customerName || "").toLowerCase().includes(q.toLowerCase());
        return matchScope && matchQ;
      }),
    [tickets, q, scope, profile]
  );

  const totalLocked = tickets.reduce(
    (s, t) =>
      s +
      t.lines.reduce(
        (ls, l) => ls + l.qty * l.unitPrice * (1 - l.discountPct / 100),
        0
      ),
    0
  );

  return (
    <div className="p-6 space-y-4">
      <SubNav
        items={[
          { to: "/", label: "Sales POS", icon: LayoutDashboard, end: true },
          { to: "/sales-report", label: "Sales Report", icon: Receipt },
          { to: "/held", label: "Held Tickets", icon: PauseCircle },
          { to: "/quotes", label: "Quotes", icon: FileText },
        ]}
      />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Stat label="Tickets on hold" value={String(tickets.length)} />
        <Stat
          label="Value parked"
          value={formatCurrency(totalLocked, settings?.currency)}
        />
        <Stat
          label="Yours"
          value={String(tickets.filter((t) => t.cashierId === profile?.id).length)}
        />
      </div>

      <div className="paper-card p-4">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by label or customer"
              className="input pl-9"
            />
          </div>
          <div className="flex bg-paper border rounded-md p-0.5">
            {(["all", "mine"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={`px-3 h-8 text-xs uppercase tracking-widest rounded ${
                  scope === s ? "bg-ink text-paper" : "text-ink-mute"
                }`}
              >
                {s === "all" ? "All staff" : "Mine only"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="paper-card p-10 text-center text-ink-mute">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="paper-card p-12 text-center">
          <PauseCircle className="w-10 h-10 text-ink-mute mx-auto" />
          <div className="font-display font-bold text-lg mt-3">No held tickets</div>
          <div className="text-ink-mute text-sm mt-1">
            Held tickets from the POS appear here for any device to resume.
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((t) => {
            const total = t.lines.reduce(
              (s, l) => s + l.qty * l.unitPrice * (1 - l.discountPct / 100),
              0
            );
            return (
              <div key={t.id} className="paper-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] uppercase tracking-widest text-ink-mute">
                      {formatDateTime(t.createdAt)}
                    </div>
                    <div className="font-display text-lg font-bold truncate">
                      {t.label}
                    </div>
                    <div className="text-xs text-ink-mute mt-1 flex items-center gap-1">
                      <User className="w-3 h-3" /> {t.cashierName}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="num font-bold text-lg">
                      {formatCurrency(total, settings?.currency)}
                    </div>
                    <div className="text-[11px] text-ink-mute">
                      {t.lines.length} item{t.lines.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                </div>
                <div className="dashed-divider my-3" />
                <div className="text-sm space-y-1 max-h-32 overflow-auto">
                  {t.lines.map((l) => (
                    <div key={l.itemId} className="flex justify-between">
                      <span className="truncate pr-2">
                        {l.qty}× {l.name}
                      </span>
                      <span className="num text-ink-mute">
                        {formatCurrency(
                          l.qty * l.unitPrice * (1 - l.discountPct / 100),
                          settings?.currency
                        )}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    className="btn btn-primary flex-1"
                    onClick={() => {
                      sessionStorage.setItem("pixobooks:resume", t.id);
                      nav("/");
                      toast.success(`Open POS to resume "${t.label}"`);
                    }}
                  >
                    <PlayCircle className="w-4 h-4" /> Resume in POS
                  </button>
                  <button
                    className="btn btn-outline text-danger"
                    onClick={() =>
                      confirm(`Delete "${t.label}"?`) && del.mutate(t.id)
                    }
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="paper-card p-4">
      <div className="text-[11px] uppercase tracking-widest text-ink-mute">{label}</div>
      <div className="font-display text-2xl font-bold num mt-1">{value}</div>
    </div>
  );
}
