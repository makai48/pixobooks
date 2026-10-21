// Connectivity dot — everything syncs silently in the background.
// No panels, no buttons: pending/failed/conflict ops are retried
// automatically by the sync loop with backoff (see offlineQueue).
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useOfflineQueue } from "@/hooks/useOfflineQueue";

export default function OfflineIndicator() {
  const { stats, isOnline, isSyncing, sync } = useOfflineQueue();

  useEffect(() => {
    if (stats.pending > 0 && isOnline && !isSyncing) {
      const timer = setTimeout(() => sync(), 1000);
      return () => clearTimeout(timer);
    }
  }, [stats.pending, isOnline, isSyncing, sync]);

  return (
    <span
      title={isOnline ? "Online — all changes sync automatically" : "Offline — sales queue and sync automatically"}
      className={cn("w-2 h-2 rounded-full", isOnline ? "bg-success" : "bg-danger")}
    />
  );
}
