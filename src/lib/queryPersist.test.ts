import { describe, expect, it } from "vitest";
import {
  persistedKey,
  isFresh,
  encodeSnapshot,
  decodeSnapshot,
  saveQuerySnapshot,
  loadQuerySnapshot,
  seedQueryClient,
} from "@/lib/queryPersist";
import { QueryClient } from "@tanstack/react-query";

function memStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}

describe("queryPersist", () => {
  it("only whitelists safe cache keys", () => {
    expect(persistedKey(["shop_settings"])).toContain("shop_settings");
    expect(persistedKey(["items"])).toContain("items");
    // Transactional feeds are persisted too (instant first paint).
    expect(persistedKey(["sales", 500, null])).toContain("sales");
    expect(persistedKey(["expenses", "biz", null])).toContain("expenses");
    // Balancing + stock first paint.
    expect(persistedKey(["stock_adjustments", "biz", "2026-10-01", "2026-10-31", undefined])).toContain("stock_adjustments");
    expect(persistedKey(["bank_deposits", "biz", "2026-10-30", "2026-10-30"])).toContain("bank_deposits");
    expect(persistedKey(["live_opening_balance", "biz", "2026-10-30"])).toContain("live_opening_balance");
    // Unknown / unsafe keys are rejected.
    expect(persistedKey(["audit_logs", "biz", 500])).toBeNull();
    expect(persistedKey([])).toBeNull();
  });

  it("round-trips snapshots and respects TTL", () => {
    const s = memStorage();
    saveQuerySnapshot(["items"], [{ id: "a" }], s);
    expect(loadQuerySnapshot(["items"], s)).toEqual([{ id: "a" }]);
    // stale
    const old = encodeSnapshot([{ id: "a" }], Date.now() - 8 * 24 * 60 * 60 * 1000);
    expect(decodeSnapshot(old)).toBeNull();
    expect(isFresh(Date.now())).toBe(true);
  });

  it("seeds a QueryClient from storage", () => {
    const s = memStorage();
    saveQuerySnapshot(["branches"], [{ id: "b1" }], s);
    const qc = new QueryClient();
    const n = seedQueryClient(qc, s);
    expect(n).toBe(1);
    expect(qc.getQueryData(["branches"])).toEqual([{ id: "b1" }]);
  });
});
