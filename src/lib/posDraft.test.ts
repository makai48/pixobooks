import { describe, expect, it } from "vitest";
import {
  clearPosDraft,
  emptyPosDraft,
  isDraftEmpty,
  loadPosDraft,
  parsePosDraft,
  POS_DRAFT_STORAGE_KEY,
  reconcilePosDraftLines,
  savePosDraft,
  serializePosDraft,
} from "@/lib/posDraft";
import type { DraftStorage, PosDraft } from "@/lib/posDraft";
import type { Item, SaleLine } from "@/types";

const item = (over: Partial<Item>): Item => ({
  id: "i1",
  sku: "SKU1",
  name: "Item",
  category: "General",
  price: 100,
  cost: 60,
  stock: 10,
  baseUnit: "pc",
  units: [],
  bom: null,
  isMaterial: false,
  itemType: "product",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...over,
});

const line = (over: Partial<SaleLine> = {}): SaleLine => ({
  itemId: "i1",
  name: "Item",
  qty: 2,
  unitPrice: 100,
  discountPct: 0,
  ...over,
});

const draft = (over: Partial<PosDraft> = {}): PosDraft => ({
  ...emptyPosDraft(),
  ...over,
});

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const storage: DraftStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
  return { storage, data };
}

describe("posDraft round trip", () => {
  it("survives serialize and parse", () => {
    const original = draft({
      lines: [line({ unit: "box", unitFactor: 12 })],
      customerId: "c1",
      orderDiscountPct: 5,
      orderDiscountAmount: 10,
      loyaltyRedeem: 25,
    });
    expect(parsePosDraft(serializePosDraft(original))).toEqual(original);
  });

  it("drops unknown line fields on serialize", () => {
    const raw = serializePosDraft({
      ...draft(),
      lines: [{ ...line(), extra: "secret" } as SaleLine],
    });
    expect(raw).not.toContain("secret");
  });

  it("applies defaults for absent fields", () => {
    const parsed = parsePosDraft(JSON.stringify({ version: 1 }));
    expect(parsed).toEqual(emptyPosDraft());
  });
});

describe("posDraft parsing guards", () => {
  it("returns an empty draft for null, malformed or non-object payloads", () => {
    expect(parsePosDraft(null)).toEqual(emptyPosDraft());
    expect(parsePosDraft("{not json")).toEqual(emptyPosDraft());
    expect(parsePosDraft("42")).toEqual(emptyPosDraft());
  });

  it("rejects a different draft version", () => {
    const raw = JSON.stringify({ version: 99, lines: [line()] });
    expect(parsePosDraft(raw)).toEqual(emptyPosDraft());
  });

  it("clamps percent, qty, price and redeem values", () => {
    const raw = JSON.stringify({
      version: 1,
      customerId: 7,
      orderDiscountPct: 500,
      orderDiscountAmount: -5,
      loyaltyRedeem: -3.6,
      lines: [
        { itemId: "i1", qty: -2, unitPrice: -9, discountPct: 140, unitFactor: 0 },
        { itemId: "i2", qty: 3, unitPrice: 4, discountPct: -1, unitFactor: -2 },
      ],
    });
    const parsed = parsePosDraft(raw);
    expect(parsed.customerId).toBe("");
    expect(parsed.orderDiscountPct).toBe(100);
    expect(parsed.orderDiscountAmount).toBe(0);
    expect(parsed.loyaltyRedeem).toBe(0);
    expect(parsed.lines).toEqual([
      { itemId: "i1", name: "i1", qty: 0, unitPrice: 0, discountPct: 100 },
      { itemId: "i2", name: "i2", qty: 3, unitPrice: 4, discountPct: 0 },
    ]);
  });

  it("skips lines without a usable item id", () => {
    const raw = JSON.stringify({
      version: 1,
      lines: [{ itemId: "  " }, { qty: 1 }, null, "x", line()],
    });
    const parsed = parsePosDraft(raw);
    expect(parsed.lines).toEqual([line()]);
  });

  it("keeps normalised redeem values", () => {
    const parsed = parsePosDraft(JSON.stringify({ version: 1, loyaltyRedeem: 12.7 }));
    expect(parsed.loyaltyRedeem).toBe(13);
  });
});

describe("posDraft storage", () => {
  it("reports empty drafts", () => {
    expect(isDraftEmpty(emptyPosDraft())).toBe(true);
    expect(isDraftEmpty(draft({ customerId: "c1" }))).toBe(false);
    expect(isDraftEmpty(draft({ lines: [line()] }))).toBe(false);
  });

  it("writes and reloads through injected storage", () => {
    const { storage, data } = fakeStorage();
    const value = draft({ lines: [line()], orderDiscountPct: 10 });
    expect(savePosDraft(storage, value)).toBe(true);
    expect(data.has(POS_DRAFT_STORAGE_KEY)).toBe(true);
    expect(loadPosDraft(storage)).toEqual(value);
  });

  it("removes the key instead of storing an empty draft", () => {
    const { storage, data } = fakeStorage({ [POS_DRAFT_STORAGE_KEY]: "{}" });
    expect(savePosDraft(storage, emptyPosDraft())).toBe(true);
    expect(data.has(POS_DRAFT_STORAGE_KEY)).toBe(false);
    expect(loadPosDraft(storage)).toEqual(emptyPosDraft());
  });

  it("clears a stored draft", () => {
    const { storage, data } = fakeStorage();
    savePosDraft(storage, draft({ lines: [line()] }));
    expect(clearPosDraft(storage)).toBe(true);
    expect(data.has(POS_DRAFT_STORAGE_KEY)).toBe(false);
  });

  it("tolerates missing storage and throwing storage", () => {
    expect(loadPosDraft(null)).toEqual(emptyPosDraft());
    expect(savePosDraft(undefined, draft({ lines: [line()] }))).toBe(false);
    expect(clearPosDraft(null)).toBe(false);

    const broken: DraftStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadPosDraft(broken)).toEqual(emptyPosDraft());
    expect(savePosDraft(broken, draft({ lines: [line()] }))).toBe(false);
    expect(clearPosDraft(broken)).toBe(false);
  });
});

describe("reconcilePosDraftLines", () => {
  it("refreshes catalog identity and keeps transaction values", () => {
    const result = reconcilePosDraftLines(
      [line({ name: "Old name", unitPrice: 50, qty: 3, discountPct: 15, unitFactor: 6 })],
      [item({ id: "i1", name: "New name", price: 75, saleUnit: "box" })]
    );
    expect(result.dropped).toBe(0);
    expect(result.lines).toEqual([
      {
        itemId: "i1",
        name: "New name",
        unitPrice: 75,
        qty: 3,
        discountPct: 15,
        unitFactor: 6,
        unit: "box",
      },
    ]);
  });

  it("falls back to the base unit and drops deleted items", () => {
    const result = reconcilePosDraftLines(
      [line({ itemId: "gone" }), line({ itemId: "i2" })],
      [item({ id: "i2", name: "Kept", price: 12, baseUnit: "kg", saleUnit: null })]
    );
    expect(result.dropped).toBe(1);
    expect(result.lines).toEqual([
      { itemId: "i2", name: "Kept", qty: 2, unitPrice: 12, discountPct: 0, unit: "kg" },
    ]);
  });

  it("handles an empty catalog", () => {
    expect(reconcilePosDraftLines([line()], [])).toEqual({ lines: [], dropped: 1 });
    expect(reconcilePosDraftLines([], [item({})])).toEqual({ lines: [], dropped: 0 });
  });
});
