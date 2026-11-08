import { useEffect, useRef } from "react";
import type { Sale } from "@/types";
import { formatCurrency } from "@/lib/utils";
import "./sale-completion.css";

type Props = {
  sale: Sale;
  currency?: string;
  /** How long the circle stays on screen before it clears itself. */
  delayMs?: number;
  onDone: () => void;
};

/**
 * Sale-complete confirmation: one large animated circle with a drawing tick
 * and the receipt number centred below it. It sits above the receipt preview
 * (dimming the screen behind it), then clears itself after `delayMs` or on the
 * first tap/click. It holds no transaction logic and never blocks printing.
 */
export default function SaleCompletion({
  sale,
  currency = "USD",
  delayMs = 1500,
  onDone,
}: Props) {
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const doneRef = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (doneRef.current) return;
      doneRef.current = true;
      onDoneRef.current();
    }, Math.max(400, delayMs));
    return () => window.clearTimeout(timer);
  }, [delayMs]);

  return (
    <div
      className="sc-overlay"
      role="presentation"
    >
      <div
        className="sc-pop"
        role="status"
        aria-live="polite"
        aria-label={`Sale ${sale.number} completed`}
        onPointerDown={() => {
          if (doneRef.current) return;
          doneRef.current = true;
          onDoneRef.current();
        }}
      >
        <span className="sc-circle" aria-hidden="true">
          <svg viewBox="0 0 120 120">
            <circle className="sc-halo" cx="60" cy="60" r="55" />
            <circle className="sc-disc" cx="60" cy="60" r="47" />
            <path className="sc-check" d="M38 62l14 14 30-34" />
          </svg>
        </span>
        <div className="sc-success-word">Successful!</div>
        <div className="sc-receipt-no">
          <span>{sale.number}</span>
          <strong>{formatCurrency(sale.total, currency)}</strong>
        </div>
      </div>
    </div>
  );
}
