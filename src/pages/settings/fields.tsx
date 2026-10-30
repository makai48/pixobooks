import type { ReactNode } from "react";

function SField({
  label,
  htmlFor,
  req,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  req?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="field-box">
      <label className="field-label" htmlFor={htmlFor}>
        {label}
        {req && <span className="req">*</span>}
      </label>
      {children}
      {hint && <div className="field-hint">{hint}</div>}
      {error && <div className="field-error">{error}</div>}
    </div>
  );
}

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
  return (
    <section id={`settings-${id}`} className="config-section">
      <div className="section-title-row">
        <div className="section-number-title">
          <h2 className="sec-title-text">{title}</h2>
          {required && <span className="sec-req-mark">*</span>}
        </div>
        <span className="sec-desc-text">{desc}</span>
      </div>
      {children}
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
