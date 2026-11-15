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
 * - No fixed polling loops: cached data is refreshed on focus after it
 *   becomes stale, on reconnect, and immediately after local mutations.
 * - structuralSharing (default) skips re-renders when payloads are identical.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cached data paints instantly and stays fresh in the background.
      // A longer gcTime means navigating away and back never re-shows a
      // full-page loader for data we already have.
      staleTime: 60_000,
      gcTime: 60 * 60_000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      placeholderData: keepPreviousData,
      retry: 1,
    },
  },
});
