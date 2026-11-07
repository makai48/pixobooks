# PixoBooks

PixoBooks is an all-in-one cloud-based business management SaaS for SMEs, integrating point-of-sale (POS), inventory, finance, HR, payroll, reporting, and business intelligence. It helps businesses manage operations, automate processes, gain real-time insights, and make smarter decisions to drive growth—anytime, anywhere.

The app is built with Vite, React, TypeScript, Tailwind CSS, and Supabase (Postgres, Auth, and Edge Functions). It is designed for offline-capable POS and business workflows across retail, services, wholesale, and other growing businesses.

## Setup

```sh
npm install
cp .env.example .env   # then fill in your Supabase URL and publishable key
```

Apply the database migrations in order using Supabase Dashboard → SQL Editor. Relevant migration areas include billing, backups, UOMs, and UOM categories under `supabase/migrations/`.

```sh
npm run dev      # local development on port 8080 (no service worker in dev)
npm run build    # strict typecheck (tsc -b) and production build
npm run preview  # serve dist locally — use this for offline testing
```

## Checks

Run these checks before committing changes:

```sh
npm run typecheck  # TypeScript project build/typecheck
npm run lint       # ESLint
npm run test       # Vitest tests
```

## Key architecture notes

- **Offline-first:** mutations queue in IndexedDB (`src/lib/offlineQueue.ts`) and replay through `src/lib/syncEngine.ts`. Catalog, settings, and branches persist across refreshes via `src/lib/queryPersist.ts`. The PWA service worker is production-only (`src/lib/pwa.ts`).
- **Units of measure (UOM):** conversion logic is centralized in `src/lib/uom.ts`; UOM families, reference ratios, and precision are represented in the UOM tables.
- **Forms:** associate every `<label>` with its control. Use `src/components/common/Field.tsx` for automatic `htmlFor`/`id` handling.
- **Secrets:** do not commit `.env` files. Server-side keys belong in Supabase Edge Function secrets.

## Deployment

The app is configured to serve from the domain root (for example, `https://app.pixoprints.com/`). The Vercel configuration in `vercel.json` rewrites application routes to `/index.html` so client-side routes can load directly.

The build output is `dist/`. Configure Vercel's output directory as `dist` and keep `vercel.json` in the project root alongside `package.json`.

Required environment variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- Optional: `VITE_SENTRY_DSN`
