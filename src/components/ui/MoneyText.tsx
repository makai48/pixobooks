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

/**
 * Money inside an info card. The currency symbol is drawn at three-quarters
 * of the amount size in a uniform grey darkened ~23% overall (brightness
 * 0.77 over the muted ink token, so it stays the same grey in every card
 * regardless of tone) while the digits keep the full visual weight.
 */
export default function MoneyText({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const [symbol, amount] = splitMoney(value);
  if (!symbol) return <span className={className}>{value}</span>;
  return (
    <span className={className}>
      <span className="text-[0.75em] font-semibold text-ink-mute brightness-[0.77] align-baseline whitespace-nowrap">
        {symbol}
      </span>
      {amount}
    </span>
  );
}
