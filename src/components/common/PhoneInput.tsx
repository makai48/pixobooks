import { useEffect, useId, useRef, useState } from "react";
import CountryDialPicker from "@/components/common/CountryDialPicker";
import { splitPhone, joinPhone } from "@/lib/referenceData";
import { cn } from "@/lib/utils";

/**
 * Global phone field: flag-first ISD picker + number input.
 * Value is the full stored string ("+256 712345678" or plain digits).
 * Use everywhere a phone number is entered — one call, one behavior.
 */
export default function PhoneInput({
  value,
  onChange,
  label,
  required,
  placeholder,
  id,
  ariaLabel,
  inputClassName,
  keepDialWhenEmpty,
}: {
  value: string;
  onChange: (full: string) => void;
  label?: string;
  required?: boolean;
  placeholder?: string;
  id?: string;
  ariaLabel?: string;
  inputClassName?: string;
  /** Keep the dial code in the emitted value while the number is still empty. */
  keepDialWhenEmpty?: boolean;
}) {
  const { dial: storedDial, number } = splitPhone(value || "");
  const generatedId = `phone-${useId().replace(/[^A-Za-z0-9-_]/g, "")}`;
  const inputId = id || generatedId;
  const [dial, setDial] = useState(storedDial);
  const [text, setText] = useState(number);
  const clearedByEdit = useRef(false);

  useEffect(() => {
    if (storedDial) {
      clearedByEdit.current = false;
      setDial(storedDial);
    } else if (!clearedByEdit.current) {
      setDial("");
    }
  }, [storedDial]);

  useEffect(() => {
    if (text.replace(/\D/g, "") !== number.replace(/\D/g, "")) setText(number);
  }, [number, text]);

  const compose = (d: string, n: string) => {
    const full = joinPhone(d, n);
    return full || (keepDialWhenEmpty && d ? `+${d}` : "");
  };

  return (
    <div>
      {label && (
        <label htmlFor={inputId} className="label">
          {label} {required && <span className="text-danger">*</span>}
        </label>
      )}
      <div className={cn("flex gap-2", label && "mt-1")}>
        <CountryDialPicker
          dial={dial}
          onChange={(d) => {
            setDial(d);
            const full = compose(d, text);
            clearedByEdit.current = !full;
            onChange(full);
          }}
          label={label || ariaLabel || "Phone"}
        />
        <input
          id={inputId}
          type="tel"
          inputMode="tel"
          required={required}
          value={text}
          onChange={(e) => {
            const next = e.target.value.replace(/[^\d ]/g, "");
            setText(next);
            const full = compose(dial, next);
            clearedByEdit.current = !full;
            onChange(full);
          }}
          placeholder={placeholder || "712 345 678"}
          aria-label={ariaLabel}
          className={cn("input flex-1 min-w-0", inputClassName)}
        />
      </div>
    </div>
  );
}
