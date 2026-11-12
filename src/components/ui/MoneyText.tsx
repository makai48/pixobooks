/**
 * Split a formatted money string into its currency prefix (symbol or code)
 * and the numeric remainder. `formatCurrency` renders the symbol as a prefix
 * ("$1,234.56", "TSh 1,234"), so everything before the first digit belongs to
 * the symbol. Values without a digit (em dashes, "N/A") stay whole.
 */
export function splitMoney(value: string): [symbol: string, amount: string] {
  const match = /^([^\d]*)(\d[\s\S]*)$/.exec(value);
  if (!match) return ["", value];
  return [match[1], match[2]];
}

import { cn } from "@/lib/utils";

/**
 * Money inside an info card. The currency symbol is drawn at three-quarters
 * of the amount size. On bare paper it keeps the uniform grey; on tinted
 * fills the parent passes muted={false} so the symbol inherits full ink.
 */
export default function MoneyText({
  value,
  className,
  symbolClassName,
  muted = true,
}: {
  value: string;
  className?: string;
  symbolClassName?: string;
  muted?: boolean;
}) {
  const [symbol, amount] = splitMoney(value);
  if (!symbol) return <span className={className}>{value}</span>;
  return (
    <span className={className}>
      <span
        className={cn(
          "text-[0.75em] font-semibold align-baseline whitespace-nowrap",
          muted ? "text-ink-mute brightness-[0.77]" : "text-current",
          symbolClassName
        )}
      >
        {symbol}
      </span>
      {amount}
    </span>
  );
}
