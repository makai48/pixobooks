/** Shared chart palette. Hex values keep SVG fills deterministic and
 *  independent of CSS variable support inside SVG. */
export const CHART_COLORS = [
  "#c2185b",
  "#0891b2",
  "#f59e0b",
  "#16a34a",
  "#7c3aed",
  "#dc2626",
  "#0ea5e9",
  "#65a30d",
  "#db2777",
  "#64748b",
];

export function chartColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}
