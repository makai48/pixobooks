import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, Tag, X, Check, Plus, AlertCircle, Loader2 } from "lucide-react";
import { useItems } from "@/hooks/useItems";
import { useShopSettings } from "@/hooks/useShopSettings";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (name: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

/**
 * Fully data-driven Category picker. The list is assembled from real
 * application data (`items.category` + `shop_settings.categories`) —
 * NEVER from hard-coded samples. Handles loading, empty and error
 * states and allows typing a new category on the fly (which is saved
 * with the item, then reappears automatically in future dropdowns).
 */
export default function CategoryPicker({
  value,
  onChange,
  placeholder = "Select category",
  className,
  disabled,
}: Props) {
  const {
    data: items = [],
    isLoading: itemsLoading,
    isError: itemsError,
    error: itemsErr,
    refetch: refetchItems,
  } = useItems();
  const {
    data: settings,
    isLoading: settingsLoading,
    isError: settingsError,
  } = useShopSettings();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loading = itemsLoading || settingsLoading;
  const errored = itemsError || settingsError;

  // Assemble the real category list — user-defined categories first
  // (settings.categories, order preserved), then any additional
  // categories detected on existing items. Fully deduplicated, no
  // hard-coded values are injected.
  const categories = useMemo(() => {
    const custom = (settings?.categories || []).map((c) => (c || "").trim()).filter(Boolean);
    const derived = items.map((i) => (i.category || "").trim()).filter(Boolean);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const c of [...custom, ...derived]) {
      const key = c.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
    }
    return out;
  }, [items, settings]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.toLowerCase().includes(q));
  }, [categories, query]);

  const showCreateOption =
    query.trim().length > 0 &&
    !categories.some((c) => c.toLowerCase() === query.trim().toLowerCase());

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

  const pick = (name: string) => {
    onChange(name.trim());
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={containerRef} className={cn("relative min-w-0", className)}>
      <button
        type="button"
        disabled={disabled || errored}
        onClick={() => setOpen((o) => !o)}
        className="input flex items-center gap-2 w-full min-w-0 pl-2 pr-2 h-10 disabled:opacity-50"
      >
        <Tag className="w-3.5 h-3.5 shrink-0 text-ink-mute" />
        <span className={cn("truncate flex-1 text-left text-sm", !value && "text-ink-mute")}>
          {value || placeholder}
        </span>
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
                placeholder="Search or type a new category..."
                className="input h-8 py-0 text-xs pl-7 pr-6 w-full"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && query.trim()) {
                    e.preventDefault();
                    pick(query.trim());
                  }
                }}
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
            {loading ? (
              <div className="px-3 py-6 flex flex-col items-center gap-2 text-[11px] text-ink-mute">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading categories...
              </div>
            ) : errored ? (
              <div className="px-3 py-4 flex flex-col items-center gap-2 text-[11px] text-danger text-center">
                <AlertCircle className="w-4 h-4" />
                Couldn't load categories.
                <span className="text-ink-mute">{(itemsErr as Error)?.message || "Please retry."}</span>
                <button
                  type="button"
                  onClick={() => refetchItems()}
                  className="btn btn-outline h-7 px-2 text-[11px] mt-1"
                >
                  Retry
                </button>
              </div>
            ) : (
              <>
                {showCreateOption && (
                  <button
                    type="button"
                    onClick={() => pick(query.trim())}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-magenta-reg/5 border-b bg-magenta-reg/[0.03] font-semibold text-left text-magenta-reg"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Create "{query.trim()}"
                  </button>
                )}

                {value && (
                  <button
                    type="button"
                    onClick={() => pick("")}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-paper/60 text-ink-mute text-left border-b"
                  >
                    Clear selection
                  </button>
                )}

                {filtered.length === 0 ? (
                  <div className="px-3 py-6 text-center text-[11px] text-ink-mute">
                    {categories.length === 0
                      ? "No categories yet. Type above to create one."
                      : `No categories match "${query}".`}
                  </div>
                ) : (
                  filtered.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => pick(c)}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-paper/60 text-left border-t border-line/30",
                        value === c && "bg-paper/80 font-semibold"
                      )}
                    >
                      <Tag className="w-3.5 h-3.5 text-ink-mute shrink-0" />
                      <span className="flex-1 truncate">{c}</span>
                      {value === c && <Check className="w-3.5 h-3.5 text-ink shrink-0" />}
                    </button>
                  ))
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
