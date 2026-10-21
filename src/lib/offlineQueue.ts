// Offline Queue — IndexedDB-backed mutation queue with background sync
// Supports: sales, stock adjustments, inventory, customers, expenses, payments

export type QueueOperationType =
  | "sale.complete"
  | "stock.adjust"
  | "item.create"
  | "item.update"
  | "item.delete"
  | "customer.create"
  | "customer.update"
  | "expense.create"
  | "expense.update"
  | "payment.record"
  | "payment.update"
  | "sale.hold"
  | "sale.delete"
  | "custom.generic";

export type QueueStatus = "pending" | "syncing" | "synced" | "failed" | "conflict";

export interface QueueOperation<T = unknown> {
  id: string;
  type: QueueOperationType;
  payload: T;
  status: QueueStatus;
  createdAt: string;      // ISO string when queued
  updatedAt: string;      // ISO string last status change
  retryCount: number;
  lastError?: string;
  serverId?: string;      // ID returned by server after successful sync
  conflictData?: unknown; // Server response when conflict occurs
  meta?: Record<string, unknown>; // Additional context (user, device, etc.)
}

export interface QueueStats {
  pending: number;
  syncing: number;
  synced: number;
  failed: number;
  conflict: number;
  total: number;
}

const DB_NAME = "pixobooks_offline_queue";
const STORE_NAME = "operations";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("type", "type", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => Promise<T>): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    tx.onerror = () => reject(tx.error);
    const store = tx.objectStore(STORE_NAME);
    fn(store).then(resolve, reject);
  });
}

// Core queue operations
export const OfflineQueue = {
  /** Add a new operation to the queue */
  async enqueue<T>(type: QueueOperationType, payload: T, meta?: Record<string, unknown>): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const operation: QueueOperation = {
      id,
      type,
      payload,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      retryCount: 0,
      meta,
    };
    await withStore("readwrite", async (store) => {
      await new Promise<void>((resolve, reject) => {
        const req = store.add(operation);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    });
    return id;
  },

  /** Get all operations, optionally filtered by status */
  async getAll(status?: QueueStatus): Promise<QueueOperation[]> {
    return withStore("readonly", async (store) => {
      const request = store.getAll();
      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          let ops = request.result as QueueOperation[];
          if (status) ops = ops.filter((o) => o.status === status);
          ops.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
          resolve(ops);
        };
        request.onerror = () => reject(request.error);
      });
    });
  },

  /** Get a single operation by ID */
  async get(id: string): Promise<QueueOperation | undefined> {
    return withStore("readonly", async (store) => {
      const request = store.get(id);
      return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    });
  },

  /** Update an operation's status and optional fields */
  async update(
    id: string,
    updates: Partial<Pick<QueueOperation, "status" | "updatedAt" | "retryCount" | "lastError" | "serverId" | "conflictData" | "payload">>
  ): Promise<void> {
    const op = await this.get(id);
    if (!op) throw new Error(`Operation ${id} not found`);
    const updated = { ...op, ...updates, updatedAt: new Date().toISOString() };
    await withStore("readwrite", async (store) => {
      await new Promise<void>((resolve, reject) => {
        const req = store.put(updated);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    });
  },

  /** Mark as synced with server ID */
  async markSynced(id: string, serverId: string): Promise<void> {
    await this.update(id, { status: "synced", serverId, updatedAt: new Date().toISOString() });
  },

  /** Mark as failed with error (background retrier picks it up later) */
  async markFailed(id: string, error: string): Promise<void> {
    const op = await this.get(id);
    if (!op) return;
    const retryCount = op.retryCount + 1;
    const status: QueueStatus = retryCount >= MAX_FAILED_ATTEMPTS ? "failed" : "pending";
    await this.update(id, { status, lastError: error, retryCount, updatedAt: new Date().toISOString() });
  },

  /** Mark as conflict with server data (background retrier picks it up later) */
  async markConflict(id: string, serverData: unknown): Promise<void> {
    const op = await this.get(id);
    const retryCount = (op?.retryCount ?? 0) + 1;
    await this.update(id, { status: "conflict", conflictData: serverData, retryCount, updatedAt: new Date().toISOString() });
  },

  /** Delete an operation */
  async delete(id: string): Promise<void> {
    await withStore("readwrite", async (store) => {
      await new Promise<void>((resolve, reject) => {
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    });
  },

  /** Clear all synced operations older than maxAgeMs */
  async clearSynced(maxAgeMs = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
    let deleted = 0;
    await withStore("readwrite", async (store) => {
      const request = store.getAll();
      return new Promise<void>((resolve, reject) => {
        request.onsuccess = () => {
          const ops = request.result as QueueOperation[];
          for (const op of ops) {
            if (op.status === "synced" && op.updatedAt < cutoff) {
              store.delete(op.id);
              deleted++;
            }
          }
          resolve();
        };
        request.onerror = () => reject(request.error);
      });
    });
    return deleted;
  },

  /** Get queue statistics */
  async getStats(): Promise<QueueStats> {
    const ops = await this.getAll();
    return ops.reduce(
      (acc, op) => {
        acc[op.status]++;
        acc.total++;
        return acc;
      },
      { pending: 0, syncing: 0, synced: 0, failed: 0, conflict: 0, total: 0 }
    );
  },

  /** Subscribe to queue changes (simple polling-based for now) */
  onChange(callback: () => void): () => void {
    const interval = setInterval(() => callback(), 2000);
    return () => clearInterval(interval);
  },
};

// Online/offline detection.
// Module-safe: no browser globals at import time (vitest/SSR friendly).
let onlineCallbacks: Array<(online: boolean) => void> = [];
let listenersAttached = false;

function ensureListeners(): void {
  if (listenersAttached) return;
  listenersAttached = true;
  try {
    if (typeof window === "undefined") return;
    window.addEventListener("online", () => {
      onlineCallbacks.forEach((cb) => cb(true));
    });
    window.addEventListener("offline", () => {
      onlineCallbacks.forEach((cb) => cb(false));
    });
  } catch {
    // non-browser runtime — listeners unavailable
  }
}

export function onOnlineChange(cb: (online: boolean) => void): () => void {
  ensureListeners();
  onlineCallbacks.push(cb);
  return () => {
    onlineCallbacks = onlineCallbacks.filter((c) => c !== cb);
  };
}

// Background retry policy — everything runs silently, no manual buttons.
// Failed ops retry after 5 min (up to 10 attempts), conflicts after 1 min
// (up to 8). Past the caps they rest silently to avoid hot loops.
export const FAILED_RETRY_MS = 5 * 60 * 1000;
export const CONFLICT_RETRY_MS = 60 * 1000;
export const MAX_FAILED_ATTEMPTS = 10;
export const MAX_CONFLICT_ATTEMPTS = 8;

/** Pick ops the background sync should attempt now (pure — tested). */
export function selectRetryable(ops: QueueOperation[], now = Date.now()): QueueOperation[] {
  return ops.filter((op) => {
    if (op.status === "pending") return true;
    const age = now - new Date(op.updatedAt).getTime();
    if (op.status === "failed") {
      return op.retryCount < MAX_FAILED_ATTEMPTS && age >= FAILED_RETRY_MS;
    }
    if (op.status === "conflict") {
      return op.retryCount < MAX_CONFLICT_ATTEMPTS && age >= CONFLICT_RETRY_MS;
    }
    return false;
  });
}