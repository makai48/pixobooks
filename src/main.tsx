import { Component, StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, keepPreviousData } from "@tanstack/react-query";
import App from "./App";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import { registerPWA } from "@/lib/pwa";
import { initMonitoring } from "@/lib/monitoring";
import { persistQueryCache, seedQueryClient } from "@/lib/queryPersist";
import "./index.css";

// Flicker-free policy (applies to every screen + device):
// - Cached data paints instantly and is KEPT while background refreshes
//   resolve (keepPreviousData) — never flash back to skeletons.
// - No refetch storm every time the window regains focus (POS devices
//   switch apps constantly); per-hook polling + reconnect cover freshness.
// - structuralSharing (default) skips re-renders when payloads are identical.
const queryClient = new QueryClient({
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

class BootErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      const msg = this.state.error.message || "Something went wrong";
      const isConfig =
        msg.includes("VITE_SUPABASE") || msg.includes("supabase");
      return (
        <div className="h-screen w-screen flex items-center justify-center bg-paper p-6">
          <div className="paper-card p-6 max-w-md w-full text-center space-y-3">
            <h1 className="font-display text-lg font-bold">
              {isConfig ? "Configuration missing" : "App failed to start"}
            </h1>
            <p className="text-sm text-ink-mute">
              {isConfig
                ? "Supabase connection settings are missing. Check your .env file (see .env.example), then reload."
                : msg}
            </p>
            {!isConfig && (
              <p className="text-xs text-ink-mute">
                Your data is safe — this is usually a temporary issue. Try reloading.
              </p>
            )}
            {import.meta.env.DEV && this.state.error.stack && (
              <pre className="text-left text-[11px] text-ink-mute bg-ink/5 p-2 rounded overflow-auto max-h-40">
                {String(this.state.error.stack).slice(0, 2000)}
              </pre>
            )}
            <button
              className="btn btn-primary h-10 px-4"
              onClick={() => window.location.reload()}
            >
              Reload app
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

try {
  registerPWA();
} catch {
  // offline / unsupported SW — boot continues without PWA
}
try {
  initMonitoring();
} catch {
  // monitoring must never break boot
}

// Restore last-known catalog/settings so a hard refresh while offline
// still renders tabs + POS instead of skeletons. Live queries replace it.
seedQueryClient(queryClient);
persistQueryCache(queryClient);

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Missing #root element");

createRoot(rootEl).render(
  <StrictMode>
    <BootErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ThemeProvider>
            <App />
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </BootErrorBoundary>
  </StrictMode>
);
