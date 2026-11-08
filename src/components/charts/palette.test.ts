import { describe, expect, it } from "vitest";
import { EXPENSE_MIX_COLORS } from "./palette";

function rgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function distance(a: string, b: string): number {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

describe("expense mix palette", () => {
  it("has eight distinct colours", () => {
    expect(new Set(EXPENSE_MIX_COLORS).size).toBe(EXPENSE_MIX_COLORS.length);
  });

  it("keeps every pair visually separable", () => {
    for (let i = 0; i < EXPENSE_MIX_COLORS.length; i++) {
      for (let j = i + 1; j < EXPENSE_MIX_COLORS.length; j++) {
        expect(
          distance(EXPENSE_MIX_COLORS[i], EXPENSE_MIX_COLORS[j])
        ).toBeGreaterThanOrEqual(60);
      }
    }
  });

  it("keeps neighbouring donut slices clearly different", () => {
    for (let i = 0; i < EXPENSE_MIX_COLORS.length; i++) {
      const next = EXPENSE_MIX_COLORS[(i + 1) % EXPENSE_MIX_COLORS.length];
      expect(distance(EXPENSE_MIX_COLORS[i], next)).toBeGreaterThanOrEqual(90);
    }
  });
});
