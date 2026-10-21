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
  it("only whitelists catalog keys", () => {
    expect(persistedKey(["shop_settings"])).toContain("shop_settings");
    expect(persistedKey(["items"])).toContain("items");
    expect(persistedKey(["sales", 500, null])).toBeNull();
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
