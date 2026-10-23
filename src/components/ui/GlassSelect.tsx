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
 */
export default function GlassSelect({
  value,
  onChange,
  options,
  ariaLabel,
  id,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: GlassOption[];
  ariaLabel: string;
  id?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const [active, setActive] = useState(0);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value) ?? options[0];
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
    const height = options.length * 32 + 10;
    const openUp = r.bottom + height + 8 > vh && r.top > vh - r.bottom;
    setPos({
      left: Math.min(Math.max(8, r.left), vw - width - 8),
      width,
      maxHeight: Math.max(96, (openUp ? r.top : vh - r.bottom) - 12),
      ...(openUp ? { bottom: vh - r.top + 4 } : { top: r.bottom + 4 }),
    });
  }, [options.length, fitWidth]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

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
        setActive((i) => (i + 1) % options.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (i - 1 + options.length) % options.length);
      } else if (e.key === "Enter" || e.key === " ") {
        if (popRef.current?.contains(e.target as Node)) return;
        e.preventDefault();
        onChange(options[active].value);
        setOpen(false);
        btnRef.current?.focus();
      } else if (e.key === "Tab") {
        setOpen(false);
      }
    };
    const onScroll = (e: Event) => {
      if (popRef.current && e.target instanceof Node && popRef.current.contains(e.target)) return;
      setOpen(false);
    };
    const onResize = () => setOpen(false);
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
  }, [open, active, options, onChange]);

  const expand = () => {
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
        onClick={() => (open ? setOpen(false) : expand())}
        onKeyDown={(e) => {
          if (open) return;
          if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            expand();
          }
        }}
        className={cn(
          "input select-glass flex items-center justify-between gap-1 text-left cursor-pointer max-w-full",
          className
        )}
        style={fitWidth ? { width: fitWidth } : undefined}
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
            className="glass-pop fixed z-[70] rounded-xl p-1 overflow-y-auto animate-fade-in"
            style={{
              left: pos.left,
              width: pos.width,
              top: pos.top,
              bottom: pos.bottom,
              maxHeight: pos.maxHeight,
            }}
          >
            {options.map((o, i) => {
              const isSelected = o.value === value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                    btnRef.current?.focus();
                  }}
                  className={cn(
                    "w-full h-8 flex items-center gap-2 px-2.5 rounded-lg text-left text-[13px] transition",
                    i === active ? "bg-ink text-paper" : "text-ink hover:bg-ink/10"
                  )}
                >
                  <span className="flex-1 truncate">{o.label}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}
