
/**
 * Register the PixoBooks service worker so the app is installable and
 * works offline (cached shell + route chunks + query snapshots).
 *
 * Dev builds are EXCLUDED on purpose: a cache-first worker in dev serves
 * stale Vite-transformed modules, which duplicates module instances and
 * crashes React ("Cannot read properties of null (reading 'useContext')").
 * Offline is a production-build concern — test it via `vite preview`.
 */
export function registerPWA() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (import.meta.env.DEV) {
    // Actively remove any worker a previous build left behind in dev.
    navigator.serviceWorker.getRegistrations().then((regs) => {
      for (const r of regs) r.unregister().catch(() => undefined);
    }).catch(() => undefined);
    return;
  }
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch(() => undefined);
  });
}
