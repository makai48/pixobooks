import { useEffect, useMemo, useRef, useState } from "react";
import { User, Search, UserPlus, ChevronDown, X, Check } from "lucide-react";
import type { Customer } from "@/types";
import { cn } from "@/lib/utils";

type Props = {
  customers: Customer[];
  value: string;                   // customerId ("" = Walk-in)
  onChange: (customerId: string) => void;
  onAddNew: () => void;            // opens the Add Customer modal
  className?: string;
  disabled?: boolean;
};

/**
 * POS customer selector. Renders as a compact combobox:
 *  - Trigger shows the currently-selected customer name.
 *  - Opens a popover with a search input at the top.
 *  - "Add Customer" appears as the FIRST option, always.
 *  - Existing customers appear underneath, filtered by search.
 *  - "Walk-in Customer" is a permanent clear option.
 */
export default function CustomerCombobox({
  customers,
  value,
  onChange,
  onAddNew,
  className,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = customers.find((c) => c.id === value) || null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phone || "").toLowerCase().includes(q) ||
        (c.email || "").toLowerCase().includes(q)
    );
  }, [customers, query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", onClickOutside);
      // autofocus the search input when opening
      setTimeout(() => inputRef.current?.focus(), 30);
    }
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const selectId = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };

  const buttonLabel = selected
    ? `${selected.name}${selected.loyaltyPoints > 0 ? ` (${selected.loyaltyPoints} pts)` : ""}`
    : "Walk-in Customer";

  return (
    <div ref={containerRef} className={cn("relative min-w-0 flex-1", className)}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={cn(
          "input h-8 py-0 text-xs w-full flex items-center gap-2 pl-2 pr-2 min-w-0",
          "disabled:opacity-50"
        )}
      >
        <User className="w-3.5 h-3.5 shrink-0 text-ink-mute" />
        <span className="truncate flex-1 text-left">{buttonLabel}</span>
        <ChevronDown className="w-3.5 h-3.5 shrink-0 text-ink-mute" />
      </button>

      {open && (
        <div className="absolute z-50 left-0 right-0 top-[calc(100%+4px)] paper-card shadow-xl overflow-hidden border">
          <div className="p-2 border-b bg-paper/40">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-ink-mute pointer-events-none" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search customers..."
                className="input h-8 py-0 text-xs pl-7 pr-6 w-full"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-ink-mute hover:text-ink"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-64 overflow-auto scroll-lined">
            {/* Add Customer — ALWAYS FIRST */}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setQuery("");
                onAddNew();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-magenta-reg/5 border-b bg-magenta-reg/[0.03] font-semibold text-left"
            >
              <span className="w-6 h-6 rounded-full bg-magenta-reg text-white flex items-center justify-center shrink-0">
                <UserPlus className="w-3.5 h-3.5" />
              </span>
              <span className="flex-1 text-magenta-reg">Add Customer</span>
            </button>

            {/* Walk-in */}
            <button
              type="button"
              onClick={() => selectId("")}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-paper/60 text-left",
                value === "" && "bg-paper/80 font-semibold"
              )}
            >
              <span className="w-6 h-6 rounded-full bg-ink/10 text-ink-mute flex items-center justify-center shrink-0">
                <User className="w-3.5 h-3.5" />
              </span>
              <span className="flex-1">Walk-in Customer</span>
              {value === "" && <Check className="w-3.5 h-3.5 text-ink" />}
            </button>

            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-[11px] text-ink-mute">
                No customers match "{query}".
              </div>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selectId(c.id)}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-paper/60 text-left border-t border-line/30",
                    value === c.id && "bg-paper/80 font-semibold"
                  )}
                >
                  <span className="w-6 h-6 rounded-full bg-cyan-reg/10 text-cyan-reg flex items-center justify-center shrink-0 overflow-hidden">
                    {c.avatarUrl ? (
                      <img src={c.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      c.name.slice(0, 1).toUpperCase()
                    )}
                  </span>
                  <span className="flex-1 min-w-0 truncate">
                    {c.name}
                    {c.phone && (
                      <span className="text-ink-mute font-normal"> · {c.phone}</span>
                    )}
                  </span>
                  {c.loyaltyPoints > 0 && (
                    <span className="chip bg-magenta-reg/10 text-magenta-reg text-[9px] px-1.5 py-0">
                      {c.loyaltyPoints}pt
                    </span>
                  )}
                  {value === c.id && <Check className="w-3.5 h-3.5 text-ink shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
