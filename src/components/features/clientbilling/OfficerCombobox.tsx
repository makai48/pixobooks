import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, User } from "lucide-react";
import type { ClientStaff } from "@/types";
import { cn } from "@/lib/utils";

type Props = {
  id?: string;
  value: string;
  onChange: (name: string) => void;
  staff: ClientStaff[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

/**
 * Officer / staff picker for Client Billing work entries.
 *
 * Unlike a native `<datalist>`, each suggestion shows the officer's name
 * and role as a tight two-line block: the role sits directly beneath the
 * name (no vertical gap) and uses a readable ink-soft colour instead of
 * the near-invisible muted tone the browser gives datalist options.
 *
 * Free typing is still supported — a brand-new officer is accepted and
 * saved to the client's roster by the caller.
 */
export default function OfficerCombobox({
  id,
  value,
  onChange,
  staff,
  placeholder = "Pick or type a name",
  disabled,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = staff.filter((s) => s.active !== false);
    if (!q) return list;
    return list.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.title || "").toLowerCase().includes(q)
    );
  }, [staff, query]);

  const pick = (name: string) => {
    onChange(name);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <div className="relative">
        <input
          id={id}
          required
          autoComplete="off"
          disabled={disabled}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setQuery("");
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "Enter" && open && options.length > 0) {
              e.preventDefault();
              pick(options[0].name);
            }
          }}
          className="input pr-8"
          placeholder={placeholder}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => {
            setQuery("");
            setOpen((o) => !o);
          }}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 h-6 w-6 inline-flex items-center justify-center rounded text-ink-mute hover:text-ink"
          aria-label="Show officers"
        >
          <ChevronDown className={cn("w-3.5 h-3.5 transition", open && "rotate-180")} />
        </button>
      </div>

      {open && !disabled && (
        <div className="absolute z-50 left-0 right-0 mt-1 paper-card border shadow-lg max-h-56 overflow-auto scroll-lined">
          <div className="sticky top-0 bg-paper/95 backdrop-blur px-2 py-1.5 border-b flex items-center gap-1.5">
            <Search className="w-3 h-3 text-ink-mute shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search officer or role"
              className="w-full bg-transparent outline-none text-[11px] placeholder:text-ink-mute"
              aria-label="Search officers"
            />
          </div>

          {options.length === 0 ? (
            <div className="px-3 py-2.5 text-[11px] text-ink-mute">
              {staff.length === 0
                ? "No officers on file yet — type a name to add one."
                : "No matching officer."}
            </div>
          ) : (
            <ul role="listbox" aria-label="Officers">
              {options.map((s) => {
                const selected = s.name === value;
                return (
                  <li key={s.name}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => pick(s.name)}
                      className={cn(
                        "w-full text-left px-2.5 py-1.5 flex items-center gap-2 hover:bg-paper/70 transition",
                        selected && "bg-magenta-reg/5"
                      )}
                    >
                      <span className="w-6 h-6 rounded-full bg-cyan-reg/10 text-cyan-reg flex items-center justify-center shrink-0">
                        <User className="w-3 h-3" />
                      </span>
                      {/* Name + role are stacked with no gap so the role
                          reads as a subtitle, not a separate faint line. */}
                      <span className="min-w-0 flex flex-col leading-none">
                        <span className="text-[11px] md:text-xs font-semibold text-ink truncate leading-tight">
                          {s.name}
                        </span>
                        <span className="text-[9px] md:text-[10px] text-ink-soft truncate leading-tight">
                          {s.title?.trim() || "Officer"}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
