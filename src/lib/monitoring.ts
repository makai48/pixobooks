// Lightweight observability: web-vitals (already a dep) + optional Sentry.
// Set VITE_SENTRY_DSN to enable Sentry; otherwise only web-vitals are logged in DEV.
export function initMonitoring(): void {
  try {
    void import("web-vitals").then((m) => {
      const report = (name: string, value: number) => {
        if (import.meta.env.DEV) {
          console.debug(`[web-vitals] ${name}:`, Math.round(value));
        }
      };
      m.onCLS((v) => report("CLS", v.value));
      m.onINP((v) => report("INP", v.value));
      m.onLCP((v) => report("LCP", v.value));
    }).catch(() => undefined);

    const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
    if (dsn) {
      // Optional dep — dynamic specifier avoids a hard build dependency.
      const specifier = "@sentry/" + "react";
      void import(/* @vite-ignore */ specifier).then((Sentry: { init: (o: unknown) => void }) => {
        Sentry.init({ dsn, tracesSampleRate: 0.1 });
      }).catch(() => undefined);
    }
  } catch {
    // never break boot
  }
}
