import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { glassFitWidth } from "./glassFit";

export type GlassOption = { value: string; label: string };

type Pos = {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
};

/**
 * Frosted-glass dropdown. Renders the list in a portal so it is never
 * clipped by cards, and flips above the trigger when space is tight.
 *
 * Type-to-search: lists longer than a handful of options get a search box
 * pinned at the top of the popup (override with `searchable`). The trigger
 * hugs the longest label (+25% headroom) so boxes stay compact side by side.
 */
export default function GlassSelect({
  value,
  onChange,
  options,
  ariaLabel,
  id,
  className,
  fullWidth,
  disabled,
  autoFocus,
  searchable,
}: {
  value: string;
  onChange: (value: string) => void;
  options: GlassOption[];
  ariaLabel: string;
  id?: string;
  className?: string;
  /** Fill the container instead of hugging the longest option. */
  fullWidth?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Type-to-search box in the popup. Defaults to on when the list is long. */
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const [active, setActive] = useState(0);
  const [query, setQuery] = useState("");
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selected = options.find((o) => o.value === value) ?? options[0];
  const showSearch = searchable ?? options.length > 6;
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);
  const hasWidthClass = /\b(w-|min-w-|max-w-|flex-1|col-span-)/.test(className ?? "");
  const fitWidth = useMemo(
    () => glassFitWidth(options.map((o) => o.label)),
    [options]
  );

  const place = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(Math.max(fitWidth ?? r.width, 64), vw - 16);
    const height = options.length * 32 + (showSearch ? 44 : 10);
    const openUp = r.bottom + height + 8 > vh && r.top > vh - r.bottom;
    setPos({
      left: Math.min(Math.max(8, r.left), vw - width - 8),
      width,
      maxHeight: Math.max(96, (openUp ? r.top : vh - r.bottom) - 12),
      ...(openUp ? { bottom: vh - r.top + 4 } : { top: r.bottom + 4 }),
    });
  }, [options.length, fitWidth, showSearch]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  // Typing a new query always restarts highlight at the top match;
  // closing the popup discards the query so the full list returns.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open ]);

  const pick = useCallback(
    (v: string) => {
      onChange(v);
      setOpen(false);
      setQuery("");
      btnRef.current?.focus();
    },
    [onChange]
  );

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!btnRef.current?.contains(target) && !popRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => (visible.length === 0 ? 0 : (i + 1) % visible.length));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) =>
          visible.length === 0 ? 0 : (i - 1 + visible.length) % visible.length
        );
      } else if (e.key === "Enter" || e.key === " ") {
        // Typing in the search box: Enter picks the highlighted match.
        if (e.target === searchRef.current) {
          e.preventDefault();
          const target = visible[Math.min(active, Math.max(0, visible.length - 1))];
          if (target) pick(target.value);
          return;
        }
        if (popRef.current?.contains(e.target as Node)) return;
        e.preventDefault();
        const target = visible[Math.min(active, Math.max(0, visible.length - 1))];
        if (target) pick(target.value);
      } else if (e.key === "Tab") {
        setOpen(false);
      }
    };
    const onScroll = (e: Event) => {
      if (popRef.current && e.target instanceof Node && popRef.current.contains(e.target)) return;
      setOpen(false);
    };
    const onResize = () => {
      // Re-anchor instead of closing: on mobile the keyboard opening
      // fires a viewport resize right after the popup (and its autofocused
      // search box) appears — closing here made every dropdown flash open
      // then instantly vanish.
      place();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, active, visible, pick, place]);

  const expand = () => {
    if (disabled) return;
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };

  return (
    <>
      <button
        ref={btnRef}
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        autoFocus={autoFocus}
        onClick={() => (disabled ? undefined : open ? setOpen(false) : expand())}
        onKeyDown={(e) => {
          if (disabled || open) return;
          if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            expand();
          }
        }}
        className={cn(
          "input select-glass flex items-center justify-between gap-1 text-left cursor-pointer max-w-full",
          fullWidth && "w-full",
          disabled && "opacity-60 cursor-not-allowed",
          className
        )}
        style={!fullWidth && !hasWidthClass && fitWidth ? { width: fitWidth } : undefined}
      >
        <span className="truncate">{selected?.label ?? "—"}</span>
        <ChevronDown
          className={cn("w-3.5 h-3.5 shrink-0 opacity-60 transition", open && "rotate-180")}
        />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={popRef}
            role="listbox"
            aria-label={ariaLabel}
            className="glass-pop fixed z-[70] rounded-xl p-1 overflow-hidden animate-fade-in flex flex-col"
            style={{
              left: pos.left,
              width: pos.width,
              top: pos.top,
              bottom: pos.bottom,
              maxHeight: pos.maxHeight,
            }}
          >
            {showSearch && (
              <div className="p-1 shrink-0">
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                  }}
                  onKeyDown={(e) => {
                    // Space types into the box; the popup-level handler
                    // must not treat it as "pick the highlighted option".
                    if (e.key === " ") e.stopPropagation();
                  }}
                  placeholder="Type to search..."
                  aria-label={`${ariaLabel} search`}
                  className="input input-sm w-full"
                  autoFocus
                />
              </div>
            )}
            <div className="overflow-y-auto min-h-0 p-0.5">
              {visible.length === 0 && (
                <div className="px-2.5 py-2 text-[12px] text-ink-mute">
                  No matches
                </div>
              )}
              {visible.map((o) => {
                const isSelected = o.value === value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setActive(visible.indexOf(o))}
                    onClick={() => pick(o.value)}
                    className={cn(
                      "w-full h-8 flex items-center gap-2 px-2.5 rounded-lg text-left text-[13px] transition",
                      visible.indexOf(o) === active
                        ? "bg-ink text-paper"
                        : "text-ink hover:bg-ink/10"
                    )}
                  >
                    <span className="flex-1 truncate">{o.label}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
