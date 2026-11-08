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

/**
 * Expense-mix categorical palette.
 *
 * Eight hues chosen so every pair is visibly different (checked by
 * `palette.test.ts` with a minimum RGB distance) and neighbouring donut
 * slices never share a hue family. Mid-dark tones keep the same fills
 * legible on cream and dark-navy chart cards.
 */
export const EXPENSE_MIX_COLORS = [
  "#d81b60", // rose
  "#0f766e", // deep teal
  "#f59e0b", // amber
  "#6366f1", // indigo
  "#65a30d", // lime
  "#a855f7", // purple
  "#991b1b", // dark red
  "#475569", // slate
];

export function expenseMixColor(index: number): string {
  return EXPENSE_MIX_COLORS[index % EXPENSE_MIX_COLORS.length];
}
