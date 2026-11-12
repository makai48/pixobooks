import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { SECTION_META } from "./constants";

function SField({
  label,
  htmlFor,
  req,
  error,
  hint,
  icon: Icon,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  req?: boolean;
  error?: string;
  hint?: string;
  /** Optional glyph shown beside the label. */
  icon?: LucideIcon;
  /** Extra classes on the field wrapper — used by the responsive grids. */
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("field-box", className)}>
      <label
        className={cn("field-label", Icon && "has-icon")}
        htmlFor={htmlFor}
      >
        {Icon && <Icon className="field-icon" strokeWidth={1.8} aria-hidden="true" />}
        {label}
        {req && <span className="req">*</span>}
      </label>
      {children}
      {hint && <div className="field-hint">{hint}</div>}
      {error && <div className="field-error">{error}</div>}
    </div>
  );
}

/**
 * The band colour of each section header.
 *
 * The hue carries the section's meaning (magenta = the shop's own identity,
 * brand = the workspace's money and skin, cyan = the catalogue and hardware,
 * warning = a restriction, success = money in, ink = a neutral fact). Every
 * colour is a token of the ACTIVE skin, so the band always suits the theme
 * preset instead of imposing a fixed colour on all five.
 */
const SECTION_TONES: Record<string, string> = {
  business: "tone-magenta",
  money: "tone-brand",
  categories: "tone-cyan",
  docs: "tone-ink",
  hardware: "tone-cyan",
  discounts: "tone-warning",
  branches: "tone-ink",
  theme: "tone-brand",
  billing: "tone-success",
  export: "tone-ink",
};

function Section({
  id,
  title,
  desc,
  required,
  children,
}: {
  id: string;
  title: string;
  desc: string;
  required?: boolean;
  children: ReactNode;
}) {
  const meta = SECTION_META[id as keyof typeof SECTION_META];
  const Glyph = meta?.icon;
  /** Section titles still carry the legacy "4. " ordinal. The rail already
   *  communicates position, and a settings page is not a sequence, so the
   *  numeral is dropped here instead of being restyled. */
  const heading = title.replace(/^\s*\d+\.\s*/, "");

  return (
    <section id={`settings-${id}`} className="config-section">
      <header className={cn("sec-head", SECTION_TONES[id] ?? "tone-ink")}>
        {Glyph && (
          <span className="sec-glyph" aria-hidden="true">
            <Glyph strokeWidth={1.6} />
          </span>
        )}
        <div className="sec-head-copy">
          <h2 className="sec-title-text">{heading}</h2>
          <p className="sec-desc-text">{desc}</p>
        </div>
        {required && <span className="sec-flag">Required</span>}
      </header>
      <div className="sec-body">{children}</div>
    </section>
  );
}

function CheckboxRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="checkbox-row">
      <input
        type="checkbox"
        className="apple-checkbox-input"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="apple-checkbox-box">
        <svg viewBox="0 0 24 24" fill="none">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
      <span className="checkbox-label">{label}</span>
    </label>
  );
}

export { SField, Section, CheckboxRow };
