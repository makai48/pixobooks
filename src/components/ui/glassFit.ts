/**
 * Content-hugging dropdown width (GLOBAL RULE): the longest label plus at
 * most 15% headroom (room for the chevron), floored at 64px so tiny labels
 * like "All" or "2026" still fit their text. The trigger truncates beyond
 * that, so boxes never stretch wider than 115% of their longest text and
 * never squeeze the search bar beside them.
 */
export function glassFitWidth(labels: readonly string[]): number | undefined {
  if (typeof document === "undefined") return undefined;
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return undefined;
  ctx.font = "14px Inter, ui-sans-serif, system-ui, sans-serif";
  let longest = 0;
  for (const label of labels) {
    longest = Math.max(longest, ctx.measureText(label).width);
  }
  return Math.max(64, Math.ceil(longest * 1.15));
}
