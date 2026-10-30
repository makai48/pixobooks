// Offline-first query cache persistence — keeps catalog/settings/branches
// available across a hard refresh while offline. Only whitelisted,
// JSON-safe, bounded-size queries are persisted (7-day TTL).
import type { QueryClient } from "@tanstack/react-query";

const PREFIX = "pixobooks:qcache:";
const VERSION = 1;
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Per-snapshot ceiling. Large enough to hold the default 500-row sales /
 *  expense / purchase feeds, small enough to leave room in the ~5 MB
 *  localStorage quota for the catalog snapshots. Anything bigger is simply
 *  not persisted (the live query still works). */
const MAX_BYTES = 1_500_000;

// Base query keys safe to persist (exact key must start with one of these).
// Catalog + settings make the POS/inventory usable offline; the
// transactional feeds are included so Statistics, the Sales Report and
// Purchase Orders paint instantly after a reload instead of showing a
// full-page spinner. Param queries (e.g. ["sales", biz, 5000, branch])
// are persisted only when their encoded snapshot fits MAX_BYTES.
//
// The second group covers the remaining first-paint reads: the balancing
// till, the banking list, the stock-adjustment log and the derived
// opening balance. Without them those screens flash empty/loading on
// every mount while the network refetch resolves, even though the data
// barely changed.
const PERSISTED_BASE_KEYS = [
  // Catalog & configuration
  "shop_settings",
  "items",
  "customers",
  "branches",
  "uoms",
  "unit_conversions",
  "uom_categories",
  "suppliers",
  "employees",
  // Transactional feeds (instant first paint)
  "sales",
  "expenses",
  "purchase_orders",
  "client_accounts",
  "client_invoices",
  "client_work_entries",
  "client_services",
  "standing_orders",
  "held_tickets",
  "quotes",
  // Balancing + stock first paint
  "stock_adjustments",
  "bank_deposits",
  "daily_balancing",
  "live_opening_balance",
  "mru_bank_account",
];

export type StoredSnapshot = {
  v: number;
  savedAt: number;
  data: unknown;
};

export function persistedKey(queryKey: unknown): string | null {
  if (!Array.isArray(queryKey) || queryKey.length === 0) return null;
  const base = queryKey[0];
  if (typeof base !== "string") return null;
  if (!PERSISTED_BASE_KEYS.includes(base)) return null;
  return PREFIX + JSON.stringify(queryKey);
}

export function isFresh(savedAt: number, now = Date.now()): boolean {
  return now - savedAt < TTL_MS;
}

export function encodeSnapshot(data: unknown, now = Date.now()): string | null {
  try {
    const body = JSON.stringify({ v: VERSION, savedAt: now, data } satisfies StoredSnapshot);
    if (body.length > MAX_BYTES) return null;
    return body;
  } catch {
    return null;
  }
}

export function decodeSnapshot(raw: string | null, now = Date.now()): unknown | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredSnapshot;
    if (!parsed || parsed.v !== VERSION) return null;
    if (typeof parsed.savedAt !== "number" || !isFresh(parsed.savedAt, now)) return null;
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

type StorageLike = {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
  key(i: number): string | null;
  readonly length: number;
};

function getStorage(): StorageLike | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function saveQuerySnapshot(queryKey: unknown, data: unknown, storage?: StorageLike | null): void {
  const store = storage ?? getStorage();
  if (!store || data === undefined) return;
  const key = persistedKey(queryKey);
  if (!key) return;
  const encoded = encodeSnapshot(data);
  if (!encoded) return;
  try {
    store.setItem(key, encoded);
  } catch {
    // quota/private mode — offline cache just stays memory-only
  }
}

export function loadQuerySnapshot(queryKey: unknown, storage?: StorageLike | null): unknown | null {
  const store = storage ?? getStorage();
  if (!store) return null;
  const key = persistedKey(queryKey);
  if (!key) return null;
  return decodeSnapshot(store.getItem(key));
}

/** Seed a QueryClient from persisted snapshots (call once before render). */
export function seedQueryClient(qc: QueryClient, storage?: StorageLike | null): number {
  const store = storage ?? getStorage();
  if (!store) return 0;
  let restored = 0;
  try {
    const keys: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    for (const k of keys) {
      const data = decodeSnapshot(store.getItem(k));
      if (data === null) continue;
      try {
        const queryKey = JSON.parse(k.slice(PREFIX.length)) as unknown[];
        qc.setQueryData(queryKey, data);
        restored++;
      } catch {
        // corrupt key — skip
      }
    }
  } catch {
    // storage unreadable — boot continues without cache
  }
  return restored;
}

/**
 * Remove every persisted snapshot.
 *
 * Used after a data wipe: the offline cache holds whitelisted catalogs
 * (items, customers, …) and would otherwise repaint the deleted rows on the
 * next reload, before the refetch has a chance to correct them.
 */
export function clearPersistedSnapshots(storage?: StorageLike | null): number {
  const store = storage ?? getStorage();
  if (!store) return 0;
  let removed = 0;
  try {
    const keys: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    for (const k of keys) {
      store.removeItem(k);
      removed++;
    }
  } catch {
    // storage unreadable — memory cache is still invalidated by the caller
  }
  return removed;
}

/** Subscribe to cache updates and persist whitelisted successes. */
export function persistQueryCache(qc: QueryClient): () => void {
  return qc.getQueryCache().subscribe((event) => {
    if (event.type !== "updated") return;
    const action = event.action as { type?: string } | undefined;
    if (action?.type !== "success") return;
    const queryKey = event.query.queryKey;
    const data = event.query.state.data;
    if (data === undefined) return;
    saveQuerySnapshot(queryKey, data);
  });
}
