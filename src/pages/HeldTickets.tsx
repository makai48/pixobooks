import { useMemo, useState } from "react";
import { PauseCircle, PlayCircle, Trash2, Search, User, ScanBarcode, ShoppingBag, FileText } from "lucide-react";
import SubNav from "@/components/layout/SubNav";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import {
  useHeldTickets,
  useDeleteHeldTicket,
} from "@/hooks/useHeldTickets";
import { useAuth } from "@/hooks/useAuth";
import { useShopSettings } from "@/hooks/useShopSettings";
import { cn, formatCurrency, formatDateTime } from "@/lib/utils";
import MoneyText from "@/components/ui/MoneyText";

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
    <div className="p-2.5 md:p-6 space-y-2 md:space-y-4">
      <SubNav
        items={[
          { to: "/", label: "POS", icon: ScanBarcode, end: true },
          { to: "/sales-report", label: "Sales", icon: ShoppingBag },
          { to: "/held", label: "Held Tickets", icon: PauseCircle },
          { to: "/quotes", label: "Quotes", icon: FileText },
        ]}
      />
      <div className="grid grid-cols-3 gap-1.5 md:gap-3">
        <Stat label="Tickets on hold" value={String(tickets.length)} />
        <Stat
          label="Value parked"
          value={formatCurrency(totalLocked, settings?.currency)}
          fullValue={formatCurrency(totalLocked, settings?.currency)}
        />
        <Stat
          label="Yours"
          value={String(tickets.filter((t) => t.cashierId === profile?.id).length)}
        />
      </div>

      <div className="paper-card p-2.5 md:p-4 flex items-center gap-1.5 md:gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="w-3.5 h-3.5 md:w-4 md:h-4 absolute left-2 md:left-3 top-1/2 -translate-y-1/2 text-ink-mute pointer-events-none" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by label or customer"
            className="input input-sm pl-7 md:pl-9"
          />
        </div>
        <div className="hidden md:flex bg-paper border rounded-md p-0.5 shrink-0">
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
        <div className="flex items-center gap-1 shrink-0 md:hidden">
          {(["all", "mine"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={cn(
                "chip border px-2 h-6 text-[9px] whitespace-nowrap shrink-0 transition",
                scope === s ? "bg-ink text-paper border-ink" : "border-line hover:border-ink"
              )}
            >
              {s === "all" ? "All staff" : "Mine only"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-[10px] md:text-xs text-ink-mute inline-flex items-center gap-1.5 md:gap-2">
          <PauseCircle className="w-3 h-3 md:w-3.5 md:h-3.5 shrink-0" />
          {filtered.length} of {tickets.length}{" "}
          <span className="md:hidden">tickets · tap to resume</span>
          <span className="hidden md:inline">
            held tickets · resume any ticket in POS
          </span>
        </div>
      </div>

      {isLoading ? (
        <div className="paper-card p-6 md:p-10 text-center text-ink-mute text-sm">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="paper-card p-8 md:p-12 text-center">
          <PauseCircle className="w-8 h-8 md:w-10 md:h-10 text-ink-mute mx-auto" />
          <div className="font-display font-bold text-base md:text-lg mt-2 md:mt-3">No held tickets</div>
          <div className="text-ink-mute text-[11px] md:text-sm mt-1">
            Held tickets from the POS appear here for any device to resume.
          </div>
        </div>
      ) : (
        <>
        <div className="hidden md:grid gap-2 md:gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((t) => {
            const total = t.lines.reduce(
              (s, l) => s + l.qty * l.unitPrice * (1 - l.discountPct / 100),
              0
            );
            return (
              <div key={t.id} className="paper-card p-2.5 md:p-4 flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[9px] md:text-[11px] uppercase tracking-wide md:tracking-widest text-ink-mute truncate">
                      {formatDateTime(t.createdAt)}
                    </div>
                    <div className="font-display text-sm md:text-lg font-bold leading-tight truncate">
                      {t.label}
                    </div>
                    <div className="text-[10px] md:text-xs text-ink-mute mt-0.5 flex items-center gap-1 truncate">
                      <User className="w-3 h-3 shrink-0" /> {t.cashierName}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="num font-bold text-sm md:text-lg">
                      <MoneyText value={formatCurrency(total, settings?.currency)} />
                    </div>
                    <div className="text-[9px] md:text-[11px] text-ink-mute">
                      {t.lines.length} item{t.lines.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                </div>
                <div className="dashed-divider my-1.5 md:my-3" />
                <div className="text-[10px] md:text-sm space-y-0.5 md:space-y-1 max-h-16 md:max-h-32 overflow-auto">
                  {t.lines.map((l) => (
                    <div key={l.itemId} className="flex justify-between gap-2">
                      <span className="truncate pr-2">
                        {l.qty}× {l.name}
                      </span>
                      <span className="num text-ink-mute shrink-0">
                        <MoneyText value={formatCurrency(
                          l.qty * l.unitPrice * (1 - l.discountPct / 100),
                          settings?.currency
                        )} />
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-auto pt-2 flex gap-1">
                  <button
                    className="btn btn-primary btn-sm flex-1"
                    onClick={() => {
                      sessionStorage.setItem("pixobooks:resume", t.id);
                      nav("/");
                      toast.success(`Open POS to resume "${t.label}"`);
                    }}
                  >
                    <PlayCircle className="w-3.5 h-3.5" /> Resume in POS
                  </button>
                  <button
                    className="btn btn-outline btn-sm w-7 md:w-auto md:px-4 px-0 text-danger shrink-0"
                    onClick={() =>
                      confirm(`Delete "${t.label}"?`) && del.mutate(t.id)
                    }
                    title={`Delete "${t.label}"`}
                    aria-label={`Delete "${t.label}"`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Mobile ledger — one dense row per ticket, pinned height */}
        <div className="md:hidden paper-card overflow-hidden">
          <div className="divide-y">
            {filtered.map((t) => {
              const total = t.lines.reduce(
                (s, l) => s + l.qty * l.unitPrice * (1 - l.discountPct / 100),
                0
              );
              return (
                <div key={t.id} className="flex items-center h-[30px] text-[11px] leading-tight">
                  <button
                    onClick={() => {
                      sessionStorage.setItem("pixobooks:resume", t.id);
                      nav("/");
                      toast.success(`Open POS to resume "${t.label}"`);
                    }}
                    className="flex-1 h-full flex items-center gap-1.5 px-2 min-w-0 text-left hover:bg-paper/50 transition"
                    title={`${t.label} · ${t.cashierName}`}
                  >
                    <span className="flex-1 min-w-0 truncate">
                      <span className="font-semibold">{t.label}</span>
                      <span className="text-ink-mute"> · {t.cashierName} · {t.lines.length} item{t.lines.length !== 1 ? "s" : ""}</span>
                    </span>
                    <span className="num font-bold shrink-0">
                      <MoneyText value={formatCurrency(total, settings?.currency)} />
                    </span>
                  </button>
                  <button
                    className="h-full w-8 shrink-0 inline-flex items-center justify-center text-danger hover:bg-paper/50 transition"
                    onClick={() =>
                      confirm(`Delete "${t.label}"?`) && del.mutate(t.id)
                    }
                    title={`Delete "${t.label}"`}
                    aria-label={`Delete "${t.label}"`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, fullValue }: { label: string; value: string; fullValue?: string }) {
  const [expanded, setExpanded] = useState(false);
  const showFull = expanded && !!fullValue;

  return (
    <div
      className="paper-card p-2 md:p-4 min-w-0 cursor-pointer select-none"
      onDoubleClick={() => setExpanded((e) => !e)}
    >
      <div className="text-[7px] md:text-[11px] uppercase tracking-wide md:tracking-widest leading-none text-ink-mute truncate">{label}</div>
      <div
        title={fullValue ?? value}
        className={cn(
          "font-display font-bold num mt-0.5 md:mt-1 leading-tight break-words",
          showFull
            ? "text-[7px] md:text-[clamp(0.65rem,3vw,0.95rem)]"
            : "text-[12px] md:text-2xl"
        )}
      >
        {showFull && fullValue ? <MoneyText value={fullValue} /> : <MoneyText value={value} />}
      </div>
    </div>
  );
}
