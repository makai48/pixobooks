import { forwardRef, useEffect, useRef, useState } from "react";
import {
  caretAfterDigits,
  countDigits,
  formatForDisplay,
  formatForTyping,
  getActiveNumberFormat,
  parseTypedNumber,
} from "@/lib/numberFormat";

type Props = {
  id?: string;
  /** The amount. `null`/`undefined`/"" shows an empty field. */
  value: number | string | null | undefined;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number | string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  autoFocus?: boolean;
  inputMode?: "decimal" | "numeric";
  ariaLabel?: string;
  name?: string;
  title?: string;
  onEnter?: () => void;
  /** Called after the field has left editing. */
  onBlur?: () => void;
};

/** Form state keeps some amounts as strings; an empty string is an empty field. */
function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return Number.isFinite(value) ? value : null;
}

/**
 * A money field that groups itself while the shop types.
 *
 * A native `type="number"` cannot show a thousand separator — the browser
 * rejects "50,000" as a value — so this is a text field that formats the
 * keystrokes live with the shop's own separators and reads them back as a
 * number. The digits the user typed are never rewritten, and the caret
 * follows the digits when a separator is inserted.
 */
export default forwardRef<HTMLInputElement, Props>(function AmountInput(
  {
    id,
    value,
    onChange,
    min,
    max,
    step,
    placeholder,
    className,
    disabled,
    readOnly,
    required,
    autoFocus,
    inputMode = "decimal",
    ariaLabel,
    name,
    title,
    onEnter,
    onBlur,
  },
  forwardedRef,
) {
  const format = getActiveNumberFormat();
  const [focused, setFocused] = useState(false);
  const numeric = toNumber(value);
  const [text, setText] = useState(() => formatForDisplay(numeric, format));
  const innerRef = useRef<HTMLInputElement | null>(null);
  // The forwarded ref may be a callback, so the caret logic always reads the
  // internal ref and the two are kept in step.
  const setRef = (node: HTMLInputElement | null) => {
    innerRef.current = node;
    if (typeof forwardedRef === "function") forwardedRef(node);
    else if (forwardedRef) {
      (forwardedRef as { current: HTMLInputElement | null }).current = node;
    }
  };

  // While the field is being edited the raw text is the source of truth; the
  // formatted amount takes over again once it is left.
  useEffect(() => {
    if (!focused) setText(formatForDisplay(numeric, format));
  }, [numeric, focused, format]);

  const clamp = (raw: number): number => {
    let out = raw;
    if (min !== undefined && out < min) out = min;
    if (max !== undefined && out > max) out = max;
    return out;
  };

  const handleChange = (next: string) => {
    const formatted = formatForTyping(next, format);
    setText(formatted);

    const parsed = clamp(parseTypedNumber(formatted, format));
    const current = toNumber(value) ?? 0;
    if (parsed !== current) onChange(parsed);

    // Keep the caret after the same digit it was on before the regrouping.
    const input = innerRef.current;
    if (!input) return;
    const caret = input.selectionStart ?? formatted.length;
    const digits = countDigits(next.slice(0, caret));
    const nextCaret = caretAfterDigits(formatted, digits);
    requestAnimationFrame(() => {
      input.setSelectionRange(nextCaret, nextCaret);
    });
  };

  return (
    <input
      ref={setRef}
      id={id}
      name={name}
      type="text"
      inputMode={inputMode}
      autoComplete="off"
      spellCheck={false}
      className={className}
      value={text}
      placeholder={placeholder}
      disabled={disabled}
      readOnly={readOnly}
      required={required}
      autoFocus={autoFocus}
      aria-label={ariaLabel}
      title={title}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        setText(formatForDisplay(numeric, format));
        onBlur?.();
      }}
      onChange={(e) => handleChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && onEnter) onEnter();
      }}
      data-step={step}
    />
  );
});
