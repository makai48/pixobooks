import { useMemo, useState } from "react";
import { useSuppliers } from "@/hooks/useSuppliers";
import GlassSelect from "@/components/ui/GlassSelect";

const CUSTOM = "__custom__";

type Props = {
  /** id wired to the field's <label htmlFor> (codebase a11y rule). */
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** Text shown when nothing is selected. */
  placeholder?: string;
  /** Adds an empty "(none)" choice — for optional vendor fields. */
  allowEmpty?: boolean;
  /** Offers an "Other" choice that reveals a free-text box. */
  allowCustom?: boolean;
  autoFocus?: boolean;
  /** Trigger class — lets callers match the surrounding form spacing. */
  className?: string;
};

/**
 * Supplier dropdown shared by every vendor field (purchase orders, expenses).
 * Options come from the Suppliers register, so vendor names stay consistent
 * for search and reporting. A vendor already stored on a record but missing
 * from the register (legacy / renamed supplier) is still shown, and "Other"
 * keeps one-off vendors possible.
 */
export default function VendorSelect({
  id,
  value,
  onChange,
  placeholder = "Select supplier...",
  allowEmpty,
  allowCustom = true,
  autoFocus,
  className = "input select-glass mt-1",
}: Props) {
  const { data: suppliers = [] } = useSuppliers();
  const [custom, setCustom] = useState(false);

  // Trimmed, case-insensitive unique names — the stored `vendor` is a string,
  // not a supplier id, so names (not ids) are the option values.
  const names = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of suppliers) {
      const name = (s.name || "").trim();
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      out.push(name);
    }
    return out;
  }, [suppliers]);

  const matched = names.find((n) => n.toLowerCase() === value.trim().toLowerCase());
  // Unknown text (legacy vendor) or an explicit "Other" pick opens the
  // free-text box; typing an exact supplier name snaps back to the dropdown.
  const showCustom = allowCustom && !matched && (custom || !!value.trim());

  const selectId = showCustom ? `${id}-list` : id;
  const inputId = showCustom ? id : `${id}-custom`;

  return (
    <>
      <GlassSelect
        id={selectId}
        value={showCustom ? CUSTOM : (matched ?? "")}
        onChange={(next) => {
          if (next === "" && !allowEmpty) return;
          if (next === CUSTOM) {
            setCustom(true);
            if (value) onChange("");
            return;
          }
          setCustom(false);
          onChange(next);
        }}
        autoFocus={showCustom ? undefined : autoFocus}
        ariaLabel={placeholder}
        options={[
          { value: "", label: placeholder },
          ...names.map((name) => ({ value: name, label: name })),
          ...(allowCustom ? [{ value: CUSTOM, label: "Other (enter manually)" }] : []),
        ]}
        className={className}
      />

      {showCustom && (
        <input
          id={inputId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus={autoFocus}
          className={className}
          placeholder="Vendor name"
          aria-label="Vendor name"
        />
      )}
    </>
  );
}
