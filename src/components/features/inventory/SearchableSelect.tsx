import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type SearchableOption = { value: string; label: string };

type Props = {
  /** id wired to the field's <label htmlFor> (codebase a11y rule). */
  id: string;
  value: string;
  options: SearchableOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  /** Leading empty entry rendered as `label` with value "" (e.g. "Select vendor..."). */
  emptyLabel?: string;
  invalid?: boolean;
  disabled?: boolean;
  /** Accept the typed text as a free-form value on Enter / blur (suppliers). */
  allowFreeText?: boolean;
  /** When provided, Enter with a query that matches nothing creates it. */
  onCreate?: (text: string) => void;
};

/**
 * Type-to-search combobox — React port of the Stitch design's
 * `initSearchableSelect`. Behaviour: focus opens the menu with the arrow
 * flipping 180deg (iosMenuDrop spring), typing filters options live,
 * mousedown/Enter selects (✓ checkmark via CSS), Escape closes, outside
 * click closes. The selected option is highlighted; keyboard arrows move
 * the highlight. A hidden native select is kept in sync so the value
 * stays form-semantics friendly.
 */
export default function SearchableSelect({
  id,
  value,
  options,
  onChange,
  placeholder = "Search or choose...",
  emptyLabel,
  invalid,
  disabled,
  allowFreeText,
  onCreate,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [dirty, setDirty] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  const labelFor = (v: string) => {
    if (!v) return emptyLabel ?? "";
    return options.find((o) => o.value === v)?.label ?? v;
  };

  // Keep the visible text in sync with the committed value unless the user
  // is mid-typing (options may also arrive late — e.g. the UOM master).
  useEffect(() => {
    if (!dirty) setText(labelFor(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, options]);

  const query = text.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!query) return options;
    return options.filter((o) => o.label.toLowerCase().includes(query));
  }, [options, query]);

  const showEmpty = !!emptyLabel && (!query || emptyLabel.toLowerCase().includes(query));
  const canCreate =
    !!onCreate &&
    text.trim().length > 0 &&
    !options.some((o) => o.label.toLowerCase() === text.trim().toLowerCase());

  const commit = (v: string) => {
    setDirty(false);
    setText(labelFor(v));
    onChange(v);
  };

  const selectIndex = (i: number) => {
    if (showEmpty && i === 0) {
      commit("");
      setOpen(false);
      return;
    }
    const opt = matches[i - (showEmpty ? 1 : 0)];
    if (!opt) return;
    commit(opt.value);
    setOpen(false);
  };

  const closeSoon = () => {
    window.setTimeout(() => {
      setOpen(false);
      setHighlight(-1);
      // Free-text rows keep whatever was typed; selects revert to the value.
      setDirty(false);
      setText(labelFor(value));
    }, 150);
  };

  // Close on outside click (design: one menu open at a time).
  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  const total = matches.length + (showEmpty ? 1 : 0) + (canCreate ? 1 : 0);

  return (
    <div ref={rootRef} className={cn("searchable-select", open && "open")}>
      <div className="searchable-input-wrapper">
        <input
          ref={inputRef}
          id={id}
          type="text"
          autoComplete="off"
          disabled={disabled}
          aria-invalid={invalid || undefined}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-menu`}
          aria-autocomplete="list"
          className={cn("searchable-input", invalid && "field-error")}
          placeholder={placeholder}
          value={text}
          onChange={(e) => {
            setDirty(true);
            setText(e.target.value);
            setHighlight(-1);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setHighlight(-1);
            window.setTimeout(() => inputRef.current?.select(), 0);
          }}
          onBlur={() => {
            if (allowFreeText && dirty) {
              const t = text.trim();
              if (t && t !== labelFor(value)) commit(t);
              else {
                setDirty(false);
                setText(labelFor(value));
              }
            }
            closeSoon();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              setHighlight(-1);
              inputRef.current?.blur();
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              if (!open) {
                setOpen(true);
                setHighlight(0);
                return;
              }
              setHighlight((h) => (total === 0 ? -1 : (h + 1) % total));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              if (!open) return;
              setHighlight((h) => (total === 0 ? -1 : h <= 0 ? total - 1 : h - 1));
            } else if (e.key === "Enter") {
              if (open) {
                e.preventDefault();
                if (total === 0) {
                  if (allowFreeText && dirty) {
                    const t = text.trim();
                    if (t && t !== labelFor(value)) commit(t);
                    setOpen(false);
                  }
                  return;
                }
                const target = highlight >= 0 ? highlight : 0;
                if (target === total - 1 && canCreate) {
                  const t = text.trim();
                  setDirty(false);
                  setText(t);
                  onChange(t);
                  onCreate?.(t);
                  setOpen(false);
                } else if (total > 0) {
                  selectIndex(target);
                }
              } else if (allowFreeText && dirty) {
                const t = text.trim();
                if (t && t !== labelFor(value)) commit(t);
              }
            }
          }}
        />
        <span className="searchable-arrow" aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </span>
      </div>

      {open && (
        <div className="searchable-menu" id={`${id}-menu`} role="listbox">
          {showEmpty && (
            <div
              role="option"
              aria-selected={value === ""}
              className={cn("searchable-option", value === "" && "selected", highlight === 0 && "highlighted")}
              onMouseEnter={() => setHighlight(0)}
              onMouseDown={(e) => {
                e.preventDefault();
                commit("");
                setOpen(false);
              }}
            >
              {emptyLabel}
            </div>
          )}
          {matches.map((o, i) => {
            const idx = i + (showEmpty ? 1 : 0);
            return (
              <div
                key={o.value}
                role="option"
                aria-selected={value === o.value}
                className={cn(
                  "searchable-option",
                  value === o.value && "selected",
                  highlight === idx && "highlighted"
                )}
                onMouseEnter={() => setHighlight(idx)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(o.value);
                  setOpen(false);
                }}
              >
                {o.label}
              </div>
            );
          })}
          {canCreate && (
            <div
              role="option"
              aria-selected={false}
              className={cn("searchable-option", highlight === total - 1 && "highlighted")}
              onMouseEnter={() => setHighlight(total - 1)}
              onMouseDown={(e) => {
                e.preventDefault();
                const t = text.trim();
                setDirty(false);
                setText(t);
                onChange(t);
                onCreate?.(t);
                setOpen(false);
              }}
            >
              {`Create "${text.trim()}"`}
            </div>
          )}
          {total === 0 && <div className="searchable-no-results">Type or select an option</div>}
        </div>
      )}

      {/* Hidden native select keeps the value in form semantics. */}
      <select
        aria-hidden="true"
        tabIndex={-1}
        className="hidden"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{emptyLabel ?? ""}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
