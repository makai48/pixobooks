import { QueryClient, keepPreviousData } from "@tanstack/react-query";

/**
 * The single QueryClient used by the whole app.
 *
 * It lives in its own module (instead of `main.tsx`) so non-React code can
 * reach it. The import job writes rows straight to Supabase, outside every
 * mutation hook, so it has to invalidate the caches itself — otherwise a
 * freshly imported sale is invisible in the Sales Report until the next poll.
 *
 * Flicker-free policy (applies to every screen + device):
 * - Cached data paints instantly and is KEPT while background refreshes
 *   resolve (keepPreviousData) — never flash back to skeletons.
 * - No refetch storm every time the window regains focus (POS devices
 *   switch apps constantly); per-hook polling + reconnect cover freshness.
 * - structuralSharing (default) skips re-renders when payloads are identical.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 15 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      placeholderData: keepPreviousData,
      retry: 1,
    },
  },
});
