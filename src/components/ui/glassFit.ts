/**
 * Content-hugging dropdown width (GLOBAL RULE): the longest label plus a
 * bounded headroom allowance, floored at 64px so tiny labels like "All" or
 * "2026" still fit their text. Callers keep the allowance at or below 25%.
 */
export function glassFitWidth(
  labels: readonly string[],
  headroom = 0.15,
  chromePx = 0
): number | undefined {
  if (typeof document === "undefined") return undefined;
  const ctx = document.createElement("canvas").getContext("2d");
  if (ctx) ctx.font = "14px Inter, ui-sans-serif, system-ui, sans-serif";
  let longest = 0;
  for (const label of labels) {
    const measured = ctx ? ctx.measureText(label).width : label.length * 7.5;
    longest = Math.max(longest, measured);
  }
  // Headroom applies to the text itself; the control's own padding, chevron
  // and optional check icon are added separately so they never eat into it.
  return Math.max(64, Math.ceil(longest * (1 + headroom) + chromePx));
}
