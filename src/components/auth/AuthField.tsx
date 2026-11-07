import type { ReactNode } from "react";
import { AlertCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type AuthFieldProps = {
  htmlFor: string;
  label: string;
  required?: boolean;
  icon?: LucideIcon;
  hint?: ReactNode;
  error?: string;
  /** Right-aligned action on the label row (e.g. "Forgot?"). */
  trailing?: ReactNode;
  className?: string;
  children: ReactNode;
};

/**
 * V3 field primitive: sentence-case label, optional leading icon, hint or
 * inline error. Spacing, control height and focus ring live in auth.css.
 */
export default function AuthField({
  htmlFor,
  label,
  required,
  icon: Icon,
  hint,
  error,
  trailing,
  className,
  children,
}: AuthFieldProps) {
  const labelEl = (
    <label htmlFor={htmlFor} className="reg-label">
      {label}
      {required && (
        <>
          {" "}
          <span className="reg-req" aria-hidden="true">
            *
          </span>
        </>
      )}
    </label>
  );

  return (
    <div className={cn("reg-field", className)}>
      {trailing ? (
        <div className="reg-label-row">
          {labelEl}
          {trailing}
        </div>
      ) : (
        labelEl
      )}
      <div className="reg-control">
        {Icon && <Icon className="reg-icon" aria-hidden="true" />}
        {children}
      </div>
      {error ? (
        <p
          id={`${htmlFor}-error`}
          className="reg-hint reg-hint-error"
          role="alert"
        >
          <AlertCircle aria-hidden="true" />
          {error}
        </p>
      ) : hint ? (
        <p className="reg-hint">{hint}</p>
      ) : null}
    </div>
  );
}
