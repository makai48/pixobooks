# PixoBooks

## What this is
PixoBooks is a printshop POS and business-management PWA built with Vite 5, React 18, TypeScript (strict), Tailwind CSS, React Query 5, Supabase, and lucide-react.

## Commands
- `npm run dev` — local dev server on `http://localhost:8080` (base `/`).
- `npm run typecheck` — `tsc -b --pretty false`.
- `npm run lint` — ESLint.
- `npm run test` — Vitest (229 tests).
- `npm run build` — typecheck + production build (base `/`).

Run typecheck, lint, build, and tests before calling a non-trivial change done.

## Layout and routing
- `src/components/layout/AppLayout.tsx` owns the app shell. `<main>` is the scroll container (`overflow-auto`).
- Pages render through `<Outlet />` inside `<main>` and are lazy-loaded in `src/App.tsx`/router.
- On mobile, `<main>` excludes the fixed bottom navigation; desktop uses the collapsible sidebar.

## Employee onboarding / auth
- Flow (no approval step): owner invites (`Employees` → `invite-employee`) → employee signs in with the temp password → forced to `/change-password` → lands in the app. Invites are created `approval_status='approved'`, `active=true`; `must_change_password` is the only gate. `account_approval_requests` and the Account Approvals page remain only for rows left in `pending_first_login` / `pending_approval` by older invites.
- `public.admin_delete_user(uuid)` (`20261028000001_auth_user_repair_v2.sql`, supersedes `20261027000003`) deletes `business_members`, `user_profiles`, the auth child rows and the auth user in one transaction, so a failed delete cannot leave the profile gone while the login survives. `delete-employee` uses it instead of `auth.admin.deleteUser`, which loads the row into Go structs first and fails with "Database error loading user" when a scanned column is NULL. The client never falls back to a profile-only delete; edge failures surface as errors.
- The same migration replaces `pixo_repair_auth_user` so it also fixes non-object `raw_app_meta_data` / `raw_user_meta_data` and NULL timestamps — the shapes that still make GoTrue (and therefore the Supabase Dashboard delete) fail. `public.auth_user_diagnostics()` lists any row that is still unloadable; `select public.admin_delete_user(id) from auth.users where email = '…'` deletes such a row from SQL.
- `public.admin_create_or_reset_user(text, text, jsonb)` and `public.pixo_repair_auth_user(uuid, boolean)` are **owned by** `supabase/migrations/20261027000001_auth_user_onboarding_fix.sql`. They write `auth.users` directly (GoTrue's admin API is blocked by `ipNotInner`), so every column GoTrue scans must be non-NULL and `encrypted_password` must be bcrypt. Do not reintroduce an unversioned dashboard definition.
- Both edge functions verify the generated temp password with a real `POST /auth/v1/token?grant_type=password` before returning it. If verification fails they repair once, retry, then return an actionable error — never a password the employee cannot use.
- Client decisions live in `src/lib/signInFlow.ts` (`resolveSignInGate`, `describeSignInError`) and must stay unit-tested. `createAccountApprovalRequest` is idempotent: it reuses a pending row, inserts before promoting the profile, and rolls back a new row if the profile update fails.
- The invite/approval temp password is stored in `user_profiles.temp_password_expires_at`. Approval refreshes that window; `ChangePassword` clears it. Expiry only matters while `must_change_password` is true.
- `invite-employee` sends the invite itself and returns `delivery: { email, sms }` (`sent` / `not_configured` / `no_recipient` / `failed`). Secrets: `RESEND_API_KEY` + `INVITE_EMAIL_FROM` for email, `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_FROM_NUMBER` for SMS, `INVITE_LOGIN_URL` (falls back to `APP_URL`/`SITE_URL`) for the sign-in link. Without them the invite still succeeds and the UI offers pre-filled `mailto:` / `sms:` links — never fail an invite because a provider is missing.
- `SentInvitesModal` in `src/pages/Employees.tsx` is the "+ view" beside Add: every account with `invited_at`, its invite state (awaiting first sign-in / expired / password set), a per-invite detail view, resend (new temp password) and revoke (permanent delete via `useDeleteEmployee`).
- Permission keys are additive: `users.invite`, `users.permissions`, `users.delete`, `payroll.view`, `payroll.run`, `attendance.view`, `inventory.import`, `customers.view`, `reports.export`. Gate with the new key **or** its legacy parent (e.g. `can("users.invite") || can("employees.manage")`) so stored permission arrays keep working.
- This project has GoTrue's `SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD` enabled, so `supabase.auth.updateUser({ password })` fails with "Current password required when setting new password." `ChangePassword` must send `current_password` (the temporary password the employee signed in with). Error copy lives in `describePasswordUpdateError` in `src/lib/signInFlow.ts`.
- `src/lib/onboarding.ts` is the *first-run checklist* module (`buildOnboardingSteps`, dismiss/backup markers) — unrelated to sign-in.

## Design systems
- `pixobooks-shared.css` at the repo root is the canonical PixoBooks Signature Design System reference (Apple-blue controls, teal callout panels, chips, data rows, custom checkboxes). It is **not imported globally**: its `body`/`*` resets would alter the whole app.
- Page-specific UI must import a local scoped stylesheet and namespace it under a root class:
  - `src/pages/Settings.tsx` + `src/pages/settings.css` use `.st`.
  - `src/components/features/inventory/ItemModal.tsx` + `item-modal.css` use `.im`.
  - `src/components/features/uom/UomManagerModal.tsx` + `uom-manager.css` use `.uom`.
- Page CSS should copy/reuse the shared component styles under the scope (`.st .btn`, `.st .input`, `.st .opt-card`, etc.) and avoid importing `pixobooks-shared.css` globally.
- Settings/design reference: `C:\Users\Pixo\Downloads\stitch_item_modal_design_system (26)\code.html` and `DESIGN.md`. The rendered `code.html` is the visual authority; `DESIGN.md` supplies typography/spacing culture.
- `docs/traditional-design.md` freezes the Sales Report page's **Traditional design** baseline: tokens, page rhythm, pinned metrics and the glass-popover recipe. Measure changes to that page against it; do not drift the palette or the row heights.
- Use lucide icons with `className="icon"`; scoped CSS controls size/stroke.
- Do not add comments unless the surrounding code already relies on them.

## Settings page
- `src/pages/Settings.tsx` is a full-page settings screen (not a modal). It uses the design's sticky header/nav/footer and 10 sections: Profile, Money & Format, Categories, Receipts & Invoices, Printer & POS, Discounts, Branches, Theme, Billing, Import & Backup.
- The page shell owns all shared state, handlers, scroll-spy and save/reset. Section UI lives in `src/pages/settings/sections/*Section.tsx`, reads shared state through `useSettings()` (`src/pages/settings/settingsContext.ts`), and uses the shared `Section`/`SField`/`CheckboxRow` primitives from `src/pages/settings/fields.tsx`. Constants/parsers live in `src/pages/settings/constants.ts`; keep new section UI inside its section file rather than back in the shell.
- Data source: `useShopSettings()` / `useUpdateShopSettings()` in `src/hooks/useShopSettings.ts`. Saves send the **full** `Settings` object; `baseline`/`dirty` compare `JSON.stringify(form)` against the server snapshot.
- Permission gates come from `useAuth().can(...)`: `settings.shop`, `settings.receipt`, `settings.invoice`, `settings.printer`, `settings.loyalty`, `settings.units`, `settings.taxes`, `settings.theme`, `settings.discount`, `settings.categories`, `settings.export`, plus `settings.manage`. Nav entries must match rendered sections exactly.
- `settings.phone` is a legacy till line printed on receipts; keep it editable even though the new design emphasizes mobile/office/WhatsApp.
- `mapSettings()` in `src/lib/mappers.ts` reconstructs only known keys. Adding a new persisted setting requires updating the `Settings` type, mapper, and any write/read path.
- Branches use `useBranches`/`useCreateBranch`/`useDeleteBranch` and plan limits from `src/lib/billing.ts`. Units and conversions are managed from the inventory tab strip, not Settings.
- Export categories and `downloadExport()` live in `src/lib/export.ts`; the settings page intentionally exposes all 13 categories, not only the three shown in the reference design.
- Styling is scoped under `.st`; BillingSection is only used by Settings, so it can use the same design classes.

## UOM manager modal
- `src/components/layout/InventoryTabs.tsx` renders the app-level tab strip for `/inventory`, `/stock-taking`, `/purchase-orders`, and `/suppliers`; its trailing `Units` tab (gated by `settings.units` / `settings.manage`) opens `UomManagerModal`, a two-pane master-detail modal: units on the left, direct conversion relationships on the right. Desktop is side-by-side; mobile is a bottom sheet with the panes stacked and the split scrolling inside the fixed header/footer.
- It manages unit CRUD (`useUoms`, `useUpsertUom`), conversion CRUD (`useUnitConversions`, `useUpsertUnitConversion`), and category-aware reference ratios.
- Unit deletion must stay guarded by `findUomDependencies` + `useDeleteUom`: if anything references the unit, the user must select or create a replacement unit before deletion. Historical PO/sale lines make a unit deactivate-only. Never bypass this with a bare delete.
- Conversion deletion is guarded by `useDeleteUnitConversion`, which refuses when either endpoint unit is configured on inventory items.
- The modal uses `createPortal` to `document.body`, locks body scroll, and supports Escape/backdrop close. Nested editors use their own Escape handlers.
- Keep the two panes visible together on desktop; do not reintroduce the old tabbed unit/conversion layout or the old `.st .unit-modal-*` styles.

## Data import
- The import run lives in `src/lib/importJob.ts` (module-level store + `useImportJob`), **not** in `ImportDataModal`. Settings unmounts on navigation, so component-owned state used to lose the progress while the promises kept running. Never move the run back into React state.
- `ImportJobBanner` (`src/components/features/settings/ImportJobBanner.tsx`) is mounted by `AppLayout` and shows live progress on every route except `/settings`, where the full panel is visible. After completion both surfaces offer **More imports** and **Cancel**.
- `startImportJob` bumps a `runId`; stale async completions are ignored, so reset/start while a previous run is finishing cannot corrupt the store. Tests must call `resetImportJob()` in `beforeEach`.

## Inventory duplication
- Cloning an item opens `CloneSetupModal` (`src/components/features/inventory/ItemModal.tsx`) **before** the edit form and requires a SKU that differs from the source and from every existing item, plus a barcode that is either blank or unused. `nextFreeSku` suggests `SKU-2`, `SKU-3`, ….
- `submit()` re-checks both conflicts on every save (create, clone and edit). SKU is unique per business in the DB; barcode is not, so this client guard is the only thing preventing two products from scanning as one.
