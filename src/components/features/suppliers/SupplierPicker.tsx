import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, Truck, X, Check } from "lucide-react";
import { useSuppliers } from "@/hooks/useSuppliers";
import { cn } from "@/lib/utils";

type Props = {
  value: string;                                        // supplier name
  onChange: (name: string, id?: string | null) => void; // returns real supplier id when picked
  placeholder?: string;
  className?: string;
  size?: "sm" | "md";
  allowFreeText?: boolean;                              // permit typing a custom name
  disabled?: boolean;
};

/**
 * Global, reusable Supplier / Vendor picker. Sources data from
 * `useSuppliers()` so every place that uses this component sees the
 * exact same list as the Suppliers page — no hard-coded values.
 *
 * Rendered as a compact combobox with search. Selecting an existing
 * supplier calls onChange(name, id). If `allowFreeText` is true, the
 * user can type any name to store it as-is (id = null).
 */
export default function SupplierPicker({
  value,
  onChange,
  placeholder = "Select supplier",
  className,
  size = "md",
  allowFreeText = true,
  disabled,
}: Props) {
  const { data: suppliers = [] } = useSuppliers();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.contactPerson || "").toLowerCase().includes(q) ||
        (s.phone || "").toLowerCase().includes(q) ||
        (s.email || "").toLowerCase().includes(q)
    );
  }, [suppliers, query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", onClickOutside);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const heightCls = size === "sm" ? "h-8" : "h-10";
  const textCls = size === "sm" ? "text-xs" : "text-sm";
  const showCustomOption =
    allowFreeText &&
    query.trim().length > 0 &&
    !suppliers.some(
      (s) => s.name.toLowerCase() === query.trim().toLowerCase()
    );

  const label = value || placeholder;

  return (
    <div ref={containerRef} className={cn("relative min-w-0", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "input flex items-center gap-2 w-full min-w-0 pl-2 pr-2 disabled:opacity-50",
          heightCls,
          textCls
        )}
      >
        <Truck className="w-3.5 h-3.5 shrink-0 text-ink-mute" />
        <span
          className={cn(
            "truncate flex-1 text-left",
            !value && "text-ink-mute"
          )}
        >
          {label}
        </span>
        <ChevronDown className="w-3.5 h-3.5 shrink-0 text-ink-mute" />
      </button>

      {open && (
        <div className="absolute z-50 left-0 right-0 top-[calc(100%+4px)] paper-card shadow-xl overflow-hidden border min-w-[220px]">
          <div className="p-2 border-b bg-paper/40">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-ink-mute pointer-events-none" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search suppliers..."
                className="input h-8 py-0 text-xs pl-7 pr-6 w-full"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-ink-mute hover:text-ink"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-56 overflow-auto scroll-lined">
            {showCustomOption && (
              <button
                type="button"
                onClick={() => {
                  onChange(query.trim(), null);
                  setOpen(false);
                  setQuery("");
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-magenta-reg/5 border-b bg-magenta-reg/[0.03] font-semibold text-left text-magenta-reg"
              >
                + Use "{query.trim()}"
              </button>
            )}

            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange("", null);
                  setOpen(false);
                  setQuery("");
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-paper/60 text-ink-mute text-left border-b"
              >
                Clear selection
              </button>
            )}

            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-[11px] text-ink-mute">
                {suppliers.length === 0
                  ? "No suppliers yet. Add some on the Suppliers page."
                  : "No suppliers match."}
              </div>
            ) : (
              filtered.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    onChange(s.name, s.id);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-paper/60 text-left border-t border-line/30",
                    value === s.name && "bg-paper/80 font-semibold"
                  )}
                >
                  <span className="w-6 h-6 rounded-full bg-cyan-reg/10 text-cyan-reg flex items-center justify-center shrink-0 overflow-hidden">
                    {s.avatarUrl ? (
                      <img
                        src={s.avatarUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      s.name.slice(0, 1).toUpperCase()
                    )}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block truncate font-semibold">{s.name}</span>
                    {(s.contactPerson || s.phone) && (
                      <span className="block truncate text-[10px] text-ink-mute font-normal">
                        {s.contactPerson}
                        {s.phone ? ` · ${s.phone}` : ""}
                      </span>
                    )}
                  </span>
                  {value === s.name && (
                    <Check className="w-3.5 h-3.5 text-ink shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
