// React hook for offline queue integration.
// Everything syncs silently in the background; this hook only exposes
// status for the connectivity dot plus enqueue/sync primitives.
import { useEffect, useState, useCallback } from "react";
import { OfflineQueue, type QueueStats } from "@/lib/offlineQueue";
import { syncQueue, startAutoSync } from "@/lib/syncEngine";
import { onOnlineChange } from "@/lib/offlineQueue";

export function useOfflineQueue() {
  const [stats, setStats] = useState<QueueStats>({ pending: 0, syncing: 0, synced: 0, failed: 0, conflict: 0, total: 0 });
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    // Initial stats
    OfflineQueue.getStats().then(setStats);

    // Start auto-sync
    const stopAutoSync = startAutoSync(30000);

    // Listen for online/offline
    const stopOnlineListener = onOnlineChange(setIsOnline);

    // Subscribe to queue changes
    const stopQueueListener = OfflineQueue.onChange(() => {
      OfflineQueue.getStats().then(setStats);
    });

    return () => {
      stopAutoSync();
      stopOnlineListener();
      stopQueueListener();
    };
  }, []);

  const sync = useCallback(async (onProgress?: (p: number, t: number) => void) => {
    setIsSyncing(true);
    try {
      return await syncQueue(onProgress);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  return {
    stats,
    isOnline,
    isSyncing,
    sync,
  };
}

/** Check if an error is an offline queue marker */
export function isOfflineQueuedError(err: unknown): string | null {
  if (err instanceof Error && err.message.startsWith("OFFLINE_QUEUED:")) {
    return err.message.slice("OFFLINE_QUEUED:".length);
  }
  return null;
}