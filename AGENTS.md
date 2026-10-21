# PixoBooks

## What this is
PixoBooks is a printshop POS and business-management PWA built with Vite 5, React 18, TypeScript (strict), Tailwind CSS, React Query 5, Supabase, and lucide-react.

## Commands
- `npm run dev` — local dev server on `http://localhost:8080` (base `/`).
- `npm run typecheck` — `tsc -b --pretty false`.
- `npm run lint` — ESLint.
- `npm run test` — Vitest (94 tests as of the Settings rewrite).
- `npm run build` — typecheck + production build (base `/pixobooks/`).

Run typecheck, lint, build, and tests before calling a non-trivial change done.

## Layout and routing
- `src/components/layout/AppLayout.tsx` owns the app shell. `<main>` is the scroll container (`overflow-auto`).
- Pages render through `<Outlet />` inside `<main>` and are lazy-loaded in `src/App.tsx`/router.
- On mobile, `<main>` excludes the fixed bottom navigation; desktop uses the collapsible sidebar.

## Design systems
- `pixobooks-shared.css` at the repo root is the canonical PixoBooks Signature Design System reference (Apple-blue controls, teal callout panels, chips, data rows, custom checkboxes). It is **not imported globally**: its `body`/`*` resets would alter the whole app.
- Page-specific UI must import a local scoped stylesheet and namespace it under a root class:
  - `src/pages/Settings.tsx` + `src/pages/settings.css` use `.st`.
  - `src/components/features/inventory/ItemModal.tsx` + `item-modal.css` use `.im`.
  - `src/components/features/uom/UomManagerModal.tsx` + `uom-manager.css` use `.uom`.
- Page CSS should copy/reuse the shared component styles under the scope (`.st .btn`, `.st .input`, `.st .opt-card`, etc.) and avoid importing `pixobooks-shared.css` globally.
- Settings/design reference: `C:\Users\Pixo\Downloads\stitch_item_modal_design_system (26)\code.html` and `DESIGN.md`. The rendered `code.html` is the visual authority; `DESIGN.md` supplies typography/spacing culture.
- Use lucide icons with `className="icon"`; scoped CSS controls size/stroke.
- Do not add comments unless the surrounding code already relies on them.

## Settings page
- `src/pages/Settings.tsx` is a full-page settings screen (not a modal). It uses the design's sticky header/nav/footer and 11 sections: Profile, Money & Format, Categories, Receipts & Invoices, Printer & POS, Discounts, Branches, Theme, Units, Billing, Backup & Export.
- Data source: `useShopSettings()` / `useUpdateShopSettings()` in `src/hooks/useShopSettings.ts`. Saves send the **full** `Settings` object; `baseline`/`dirty` compare `JSON.stringify(form)` against the server snapshot.
- Permission gates come from `useAuth().can(...)`: `settings.shop`, `settings.receipt`, `settings.invoice`, `settings.printer`, `settings.loyalty`, `settings.units`, `settings.taxes`, `settings.theme`, `settings.discount`, `settings.categories`, `settings.export`, plus `settings.manage`. Nav entries must match rendered sections exactly.
- `settings.phone` is a legacy till line printed on receipts; keep it editable even though the new design emphasizes mobile/office/WhatsApp.
- `mapSettings()` in `src/lib/mappers.ts` reconstructs only known keys. Adding a new persisted setting requires updating the `Settings` type, mapper, and any write/read path.
- Branches use `useBranches`/`useCreateBranch`/`useDeleteBranch` and plan limits from `src/lib/billing.ts`; units use `useUnitConversions`/`useUpsertUnitConversion`/`useDeleteUnitConversion`.
- Export categories and `downloadExport()` live in `src/lib/export.ts`; the settings page intentionally exposes all 13 categories, not only the three shown in the reference design.
- Styling is scoped under `.st`; BillingSection is only used by Settings, so it can use the same design classes.

## UOM manager modal
- `Settings → Units → Open units & conversions` opens `UomManagerModal`, a two-pane master-detail modal: units on the left, direct conversion relationships on the right. Desktop is side-by-side; mobile is a bottom sheet with the panes stacked and the split scrolling inside the fixed header/footer.
- It manages unit CRUD (`useUoms`, `useUpsertUom`), conversion CRUD (`useUnitConversions`, `useUpsertUnitConversion`), and category-aware reference ratios.
- Unit deletion must stay guarded by `findUomDependencies` + `useDeleteUom`: if anything references the unit, the user must select or create a replacement unit before deletion. Historical PO/sale lines make a unit deactivate-only. Never bypass this with a bare delete.
- Conversion deletion is guarded by `useDeleteUnitConversion`, which refuses when either endpoint unit is configured on inventory items.
- The modal uses `createPortal` to `document.body`, locks body scroll, and supports Escape/backdrop close. Nested editors use their own Escape handlers.
- Keep the two panes visible together on desktop; do not reintroduce the old tabbed unit/conversion layout or the old `.st .unit-modal-*` styles.
