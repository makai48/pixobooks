# PixoBooks

Offline-capable point-of-sale, inventory, client billing, payroll and
financials for print shops and small businesses. Vite + React + TypeScript,
Tailwind, Supabase (Postgres + Auth + Edge Functions).

## Setup

```sh
npm install
cp .env.example .env   # then fill in your Supabase URL + publishable key
```

Apply the database migrations in order (Supabase Dashboard → SQL Editor):
`supabase/migrations/*.sql` (`billing`, `backups`, `uoms`, `uom_categories`).

```sh
npm run dev      # local dev on :8080 (no service worker in dev)
npm run build    # strict typecheck (tsc -b) + production build (/pixobooks/)
npm run preview  # serve dist locally — use this for offline testing
```

## Checks (all must stay green)

```sh
npm run typecheck  # tsc -b (strict)
npm run lint       # eslint, zero warnings policy
npm run test       # vitest (offline queue, UOM engine, billing, mappers)
```

## Key architecture notes

- **Offline-first**: mutations queue in IndexedDB (`src/lib/offlineQueue.ts`)
  and replay silently via `src/lib/syncEngine.ts`; catalog/settings/branches
  persist across refresh (`src/lib/queryPersist.ts`); PWA worker is
  production-only (`src/lib/pwa.ts`).
- **UOM**: single central engine (`src/lib/uom.ts`) — conversion math and
  discrete/fractional transaction rules live only there; families, reference
  ratios and precision in `uom_categories`/`uoms`.
- **Forms**: every `<label>` must be associated — use
  `src/components/common/Field.tsx` (auto `htmlFor`/`id`), never bare labels.
- **Secrets**: never commit `.env` (gitignored); server keys live only in
  Supabase Edge Function secrets.

## Deploy

Build with the default `/pixobooks/` base and serve `dist/` under that path.
Environment needed at runtime: `VITE_SUPABASE_URL`,
`VITE_SUPABASE_PUBLISHABLE_KEY`, optional `VITE_SENTRY_DSN`.
