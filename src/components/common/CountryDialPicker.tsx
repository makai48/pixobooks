import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { COUNTRIES, flagUrl, isoToFlag } from "@/lib/referenceData";
import { cn } from "@/lib/utils";

export function FlagImg({ iso2, className }: { iso2: string; className?: string }) {
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [iso2]);

  if (broken || !iso2) {
    return (
      <span className={cn("text-lg leading-none", className)} aria-hidden="true">
        {iso2 ? isoToFlag(iso2) : "🌐"}
      </span>
    );
  }
  return (
    <img
      src={flagUrl(iso2)}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setBroken(true)}
      className={cn(
        "w-6 h-4 object-contain rounded-[2px] shrink-0 bg-white ring-1 ring-black/5",
        className
      )}
    />
  );
}

/**
 * Flag-first ISD picker: closed button reads `UG +256` with the flag image;
 * dropdown lists flag + country + dial with search. Parent stores the dial
 * only; the ISO shown is the picked (or first-matching) country.
 */
export default function CountryDialPicker({
  dial,
  onChange,
  label,
}: {
  dial: string;
  onChange: (dial: string) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [iso, setIso] = useState(() => COUNTRIES.find((c) => c.dial === dial)?.iso2 || "");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!COUNTRIES.some((c) => c.iso2 === iso && c.dial === dial)) {
      const m = COUNTRIES.find((c) => c.dial === dial);
      setIso(m ? m.iso2 : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dial]);

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
  }, [open ]);

  const q = query.trim().toLowerCase();
  const options = q
    ? COUNTRIES.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.dial.includes(q.replace(/^\+/, "")) ||
          c.iso2.toLowerCase() === q
      )
    : COUNTRIES;

  const pick = (iso2: string, d: string) => {
    setIso(iso2);
    onChange(d);
    setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => {
          setQuery("");
          setOpen((v) => !v);
        }}
        className="input h-10 phone-dial flex items-center gap-1.5 pr-2 cursor-pointer whitespace-nowrap"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label} country code`}
        title={iso ? `${iso.toUpperCase()} (+${dial})` : "Choose country code"}
      >
        <FlagImg iso2={iso} className="phone-dial__flag" />
        <span className="num text-sm font-semibold">+{dial || "···"}</span>
        <ChevronDown className="w-3.5 h-3.5 text-ink-mute phone-dial__chevron" />
      </button>
      {open && (
        <div className="absolute left-0 mt-1 w-64 paper-card p-1.5 z-50 shadow-lg">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search country or code…"
            className="input h-9 mb-1.5"
            aria-label="Search countries"
          />
          <div className="max-h-60 overflow-auto" role="listbox" aria-label={`${label} country codes`}>
            {options.length === 0 && (
              <div className="p-3 text-xs text-ink-mute text-center">No matches</div>
            )}
            {options.map((c) => {
              const selected = c.iso2 === iso && c.dial === dial;
              return (
                <button
                  key={c.iso2}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => pick(c.iso2, c.dial)}
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
  );
}
