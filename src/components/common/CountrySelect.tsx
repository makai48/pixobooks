import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { COUNTRIES } from "@/lib/referenceData";
import { FlagImg } from "@/components/common/CountryDialPicker";
import { cn } from "@/lib/utils";

/**
 * Global country field: flag image + name, searchable.
 * Value is the ISO2 code — convert at the edges (e.g. store the name via
 * countryByIso2). Use everywhere a country is chosen — one call, one behavior.
 */
export default function CountrySelect({
  valueIso2,
  onChange,
  label,
  required,
  id,
  ariaLabel,
  fallbackLabel,
}: {
  valueIso2: string;
  onChange: (iso2: string) => void;
  label?: string;
  required?: boolean;
  id?: string;
  ariaLabel?: string;
  fallbackLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const generatedId = `country-${useId().replace(/[^A-Za-z0-9-_]/g, "")}`;
  const buttonId = id || generatedId;
  const current = COUNTRIES.find((c) => c.iso2 === valueIso2);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const q = query.trim().toLowerCase();
  const options = q
    ? COUNTRIES.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.dial.includes(q.replace(/^\+/, "")) ||
          c.iso2.toLowerCase() === q
      )
    : COUNTRIES;

  const shownName = current?.name || fallbackLabel;

  return (
    <div>
      {label && (
        <label htmlFor={buttonId} className="label">
          {label} {required && <span className="text-danger">*</span>}
        </label>
      )}
      <div ref={boxRef} className={cn("relative", label && "mt-1")}>
        <button
          id={buttonId}
          type="button"
          onClick={() => {
            setQuery("");
            setOpen((v) => !v);
          }}
          className="input w-full flex items-center gap-2.5 cursor-pointer text-left"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={label || ariaLabel || "Country"}
        >
          {shownName ? (
            <>
              <FlagImg iso2={current?.iso2 || ""} />
              <span className="flex-1 truncate font-medium text-sm">{shownName}</span>
            </>
          ) : (
            <span className="text-sm text-ink-mute">Select country…</span>
          )}
          <ChevronDown className="w-4 h-4 text-ink-mute shrink-0 ml-auto" />
        </button>
        {open && (
          <div className="absolute left-0 right-0 mt-1 paper-card p-1.5 z-50 shadow-lg">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search country or code…"
              className="input h-9 mb-1.5"
              aria-label="Search countries"
            />
            <div className="max-h-60 overflow-auto" role="listbox" aria-label={label || "Countries"}>
              {options.length === 0 && (
                <div className="p-3 text-xs text-ink-mute text-center">No matches</div>
              )}
              {options.map((c) => {
                const selected = c.iso2 === valueIso2;
                return (
                  <button
                    key={c.iso2}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onChange(c.iso2);
                      setOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-2.5 h-10 rounded-md text-sm transition text-left",
                      selected ? "bg-ink text-paper" : "hover:bg-ink/5"
                    )}
                  >
                    <FlagImg iso2={c.iso2} />
                    <span className="flex-1 truncate font-medium">{c.name}</span>
                    {selected && <Check className="w-4 h-4 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
