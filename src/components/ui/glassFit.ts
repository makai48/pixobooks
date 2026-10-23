const CHROME_WIDTH = 50;

export function glassFitWidth(labels: readonly string[]): number | undefined {
  if (typeof document === "undefined") return undefined;
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return undefined;
  ctx.font = "14px Inter, ui-sans-serif, system-ui, sans-serif";
  let longest = 0;
  for (const label of labels) {
    longest = Math.max(longest, ctx.measureText(label).width);
  }
  return Math.max(64, Math.ceil(longest) + CHROME_WIDTH);
}
