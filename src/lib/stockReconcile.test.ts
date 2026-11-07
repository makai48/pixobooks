import { describe, expect, it } from "vitest";
import { reconcileItem, type ItemPeriodFlow } from "./stockReconcile";

const flow = (over: Partial<ItemPeriodFlow> = {}): ItemPeriodFlow => ({
  sold: 0,
  received: 0,
  adjustments: 0,
  soldAfter: 0,
  receivedAfter: 0,
  adjustmentsAfter: 0,
  nowStock: 0,
  ...over,
});

describe("reconcileItem", () => {
  it("derives opening and closing from today's stock", () => {
    // Now 10; sold 3 earlier in the period, received 5 later today.
    const { opening, closing } = reconcileItem(
      flow({ nowStock: 10, sold: 3, received: 5 })
    );
    expect(closing).toBe(10);
    expect(opening).toBe(8); // 10 + 3 - 5
  });

  it("rolls back movements that happened after the period end", () => {
    const { closing } = reconcileItem(
      flow({ nowStock: 10, soldAfter: 4, receivedAfter: 2 })
    );
    expect(closing).toBe(12); // 10 + 4 - 2
  });

  it("keeps negative on-hand instead of clamping to zero", () => {
    // Oversold by 6: a void/receipt later cannot be hidden by a clamp.
    const { closing, opening } = reconcileItem(flow({ nowStock: -6, sold: 2 }));
    expect(closing).toBe(-6);
    expect(opening).toBe(-4);
  });

  it("subtracts signed adjustments in both directions", () => {
    const { opening } = reconcileItem(
      flow({ nowStock: 10, adjustments: -4 })
    );
    expect(opening).toBe(14); // stock was 14 before a −4 adjustment
  });

  it("treats a period with no movement as a flat balance", () => {
    const { opening, closing } = reconcileItem(flow({ nowStock: 7 }));
    expect(opening).toBe(7);
    expect(closing).toBe(7);
  });
});
