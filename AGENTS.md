# PixoBooks

## What this is
PixoBooks is a multi-business POS and business-management PWA built with Vite 5, React 18, TypeScript (strict), Tailwind CSS, React Query 5, Supabase, and lucide-react.

## Commands
- `npm run dev` — local dev server on `http://localhost:8080` (base `/`).
- `npm run typecheck` — `tsc -b --pretty false`.
- `npm run lint` — ESLint.
- `npm run test` — Vitest (387 tests).
- `npm run build` — typecheck + production build (base `/`).

Run typecheck, lint, build, and tests before calling a non-trivial change done.

## Layout and routing
- `src/components/layout/AppLayout.tsx` owns the app shell. `<main>` is the scroll container (`overflow-auto`).
- Pages render through `<Outlet />` inside `<main>` and are lazy-loaded in `src/App.tsx`/router.
- On mobile, `<main>` excludes the fixed bottom navigation; desktop uses the collapsible sidebar.

## Employee onboarding / auth
- Flow (no approval step): admin invites (`Employees` → `invite-employee`) → employee signs in with the temp password → forced to `/change-password` → lands in the app. Invites are created `approval_status='approved'`, `active=true`; `must_change_password` is the only gate. `account_approval_requests` and the Account Approvals page remain only for rows left in `pending_first_login` / `pending_approval` by older invites.
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

## UI/UX command protocol
- For every UI/UX request, first ask which screen sizes must be implemented: mobile (`<768px`), tablet (`768–1023px`), laptop (`1024–1279px`), and desktop (`>=1280px`). If the user says "all", implement and verify all four. Every UI/UX change must explicitly define behavior for all four ranges; never rely on a desktop-only `md:` change being sufficient for mobile, tablet or laptop.
- Treat the active V3 skin as the source of truth. Use semantic tokens (`paper`, `card`, `ink`, `line`, `brand`, status colors) rather than hardcoded colors. The `surface-*` classes are subtle tints — a low-alpha wash of the skin's own token over the paper card (brand/success/cyan 18%, warning 20%, danger 16%, ink 7%) with a 36–42% border; `surface-soft` stays a wash for secondary emphasis.
- Tinted metric cards carry meaning, never decoration: `brand` = headline revenue/skin identity, `success` = money in or profit, `danger` = owed or an exception, `warning` = a liability such as tax, `cyan` = raw materials, `ink` = neutral fact (counts, costs, inventory value). Inventory keeps the flat `surface-*` wash; Sales currently uses neutral `paper-card` StatCards with no fill, gradient, icon or solid variant and retains the established uppercase label/Fraunces value typography. Other deliberate metric surfaces may use `StatCard`'s `fill` and `variant="solid"`. Surface class names must stay string literals (see `FILL_CLASS`) or Tailwind purges them.
- Use the navigation icon language everywhere: Lucide outline, `1.75` inactive / `2.25` active, optical size 16–18px.
- Sidebar identity: show the signed-in user's name and role only — never the email, and no "Signed in" kicker. Use a 42px avatar and a 2px solid `border-brand` stroke, so the outline is the skin's primary accent (Papier yellow; Tidal teal; Grove green; Ember orange; Nocturne yellow). Put sign-out inside the card as a 32px circular icon button on the right (no separate full-width row; hidden when collapsed). The business address under the logo is mixed case, tight leading, and wraps to two lines.
- Shared range and date controls: compact dropdown culture, short month names always, saved date format applied everywhere, no truncated trigger/menu text. The preset is app-wide: `formatDate`/`formatDateTime` read the active value set by `AppLayout`, `GlassDatePicker` defaults to it, and receipts/PDFs/EscPos pass `settings.dateFormat`. Never format a date with a bare `toLocaleDateString`/`toLocaleString`.
- Statistics header: keep one compact paper-card hierarchy with a clear screen kicker and active-period summary. The range is a tight content-sized `GlassSelect` trigger and popup; advanced month/custom date filters are hidden by default behind an outlined Filters toggle. On mobile, keep the range selector left and pin Filters to the far right. Exclude Last Week from the selector and label the year option with the actual year. Reuse `GlassDatePicker` with the saved date format and never truncate the active period label. Cashflow uses the live revenue/expense trend series rather than a static-looking bar block.
- Team & Permissions: keep the roster/detail workspace compact and responsive. Use fixed-height, scan-friendly employee rows, keep the non-payroll tabs dense, and leave the Payroll tab behavior intact. Invite and sent-invite screens use the established bottom-sheet/centred-dialog pattern with compact headers, pinned actions and wrapped credential text.
- Team responsive modes: mobile/tablet/laptop use a roster-then-detail flow with an explicit Back control; desktop (`>=1280px`) keeps the two-pane roster/detail workspace. Action groups become icon-only where labels would crowd touch widths, while tablet and laptop retain readable labels where space permits.
- Team phone density (`src/pages/employees.css`, scoped under `.team-page`): controls are 34px, paired-field controls 30px with 12px text, roster rows 46px, notes 44px. Profile fields pair two-up on phones (Full name | Display name, Role | Phone, Email | Address); the payroll row keeps Base salary | Currency | Pay cycle on one line; Attendance shows three stat cards per line. Never widen a control past its content.
- Paired fields share one horizontal baseline: the control is bottom-aligned inside its cell (`margin-top: auto`), so a wrapped label never shifts the row. The country-code box must match the control height beside it.
- Phone fields on phones drop the flag, keep the country-code box tight (`+256` only) and give the freed width to the number field. Tablet, laptop, desktop and every other screen keep the flag-first dial picker — the change is scoped, never global.
- Customers page (`src/pages/customers.css`, scoped under `.customer-page`): stat cards stay 3-up, the search + New customer share one line (icon-only on phones), and a mobile count line reports `N of M customers · tap a row to open`. Ledger rows are 44px on phones (38px desktop) with the contact on the second line and 28px action targets. The customer sheet and loyalty dialog are phone bottom sheets with compact headers, paired Email | Phone fields and a pinned footer.
- Suppliers page follows the same register pattern: 3-up stat cards, search + New supplier on one line (icon-only on phones), a mobile count line, and cards with 40px avatars, 28px action targets and a tighter items section.
- Daily balancing form (`src/pages/financial-statements.css`, scoped under `.balancing-sheet`): keeps the app's `td-*` role scale (docs/traditional-design.md §4.9) — UI/UX only, never the accounting logic. On phones it is a bottom sheet with 34px money controls, the b/f → c/d chain stays read-only, and Amount | Date pair while Bank | Reference take full rows (long values are never cut). Explanatory paragraphs are desktop-only; the figures and controls are always visible. Number spinners are hidden on phones so a right-aligned figure never overflows.
- Daily balancing layout: **Reference/Slip # replaces Amount in the first pair** (Reference | Date), **Amount shares a line with Bank / Account** (Amount narrower, Bank wider), and the **Calculated Balance c/d plus Physical count & Variance sit at the foot of the Cash Deposit card** so the whole till position reads as one block. Keep the deposit card's internal spacing tight (`space-y-1.5` / `md:space-y-2`).
- **V3 is mountable outside auth.** `src/styles/auth.css` exposes `.v3-scope` alongside `.register-page`: it carries the V3 tokens and unlocks the field/button rules, so any screen can host the real V3 components (`AuthModal`, `AuthField`). Use `.v3-scope` + the primitives instead of approximating V3; never hand-copy V3 values.
  - The scope is **tokens only**. The full-page canvas rules (`height:100dvh`, `overflow:auto`, page background) stay on `.register-page` alone — a `.v3-scope` host must never become an opaque full-height block.
  - A scope host must add no geometry to the host page: give it `v3-scope-host` (`display: contents`), so the fixed dialog paints over the page (z-index 50) without affecting the page's layout, scroll height or stacking.
- The customer sheet is built on `AuthModal` + `AuthField` (V3 dialog, 20px radius, brand-yellow CTA, floating icon fields) and carries `.customer-sheet-scope` so its styles travel with the component wherever it is used (Customers page and POS). On phones it is a bottom sheet; from `md` it is a centred 420px dialog. V3 control sizes apply: 33px fields below 1024px, 44px from 1024px.
- **Shared sheets live in `src/styles/sheet.css`.** The customer and supplier sheets are siblings: both mount `v3-scope v3-scope-host v3-sheet-scope` and share `.v3-sheet`, `.sheet-identity`, `.sheet-avatar`, `.sheet-photo-btn`, `.sheet-line` and the phone bottom-sheet rules. Add a third record type by reusing these classes — never re-implement a sheet.
  - Line-item rows (supplier materials) are a 5-column grid on tablet/desktop; on phones they become a named-area grid (`name name remove` / `qty uom price`) — the area rows must match the column count or items fall into implicit columns.
  - Sheet phone rules own the flag-free country code box (65px code box, wide digits) so a sheet behaves the same wherever it is mounted, including from the POS.
- Team attendance header carries only the screen kicker (no employee name, no extra copy). The attendance month/year pair stays on one line.
- `users.avatar` lets an employee upload **their own** photo only; admins keep photo edits through `employees.manage` and get the roster-wide **Photos** view (every team photo plus who still has none). Permissions are stored as a free-form array, so a new key needs no migration.

## Sales Report and Expenses (shared ledger culture)
- Both pages are operational ledgers: micro-labels over tabular numbers, pinned row heights, no decorative colour. Row and control heights must never depend on content, permissions or async data.
- Range control: Sales uses chevron-back / `GlassSelect` / chevron-forward; Expenses uses the same compact glass select without the session chevrons. Presets are Today, This Week, This Month and the real year (`2026`, never "This year") in both pages. Expenses does not offer a "Custom range" option — manual date picks only show `Custom range` as the selected label.
- Filter panels are collapsed by default on both pages, and the toggle reports state: Sales uses an arrow-only button on mobile plus a Show/Hide filters dropdown on desktop; Expenses uses an outlined `Filters` button with an active-filter count badge.
- One horizontal separator per ledger row: `divide-y` + the `line` token (`.expense-ledger-rows`). Never layer per-row `border-b` on top, and never give mobile separators a different weight or design from desktop.
- Sales rows are pinned at `h-[27px]` desktop / `max-md:h-[21px]` mobile. The mobile grid is `44px | 16px | minmax(0,1fr) | 66px | 38px | 56px`: badge, initials, customer, when, qty/items, total. Currency symbols are hidden on mobile (`formatNumber`); `md+` uses full `formatCurrency`.
- Voided sales are hidden by default. The `Show voided` chip reveals them, reports the hidden count, and never changes totals. Tapping a row opens the receipt/invoice.
- Expenses has no metric cards and no Export. The sticky control bar carries the Expenses/Drawings tabs, range, Filters, Categories and New expense. Tabs stay outlined in both states and keep a small gap.
- Expenses rows: tapping/clicking anywhere (or Enter/Space) opens the edit sheet; delete is isolated, icon-only and outline-free. Category is plain faint text. The payment method is plain faint text directly below the amount — no badge, border or background. Mobile uses the compact date preference.
- Date output always goes through `formatDateByPreference` (`src/lib/dateFormat.ts`); months are short everywhere. The `D MMM YYYY` preference renders `7 Nov` on mobile/compact and `7 Nov 2026` on larger screens.
- The expense sheet (`ExpenseModal`) is a dense two-column-at-`md` dialog: icon-tiled header with outlined close (Wallet for expenses — the nav glyph — plus ArrowDownRight drawings and Banknote payroll), 34px phone controls, amount as a 16px hero with currency suffix, amount/date and method/vendor rows, notes collapsed behind `Add note`, and a pinned footer showing `method · date` with full-width 36px actions on phones. Payment date fills its grid cell so the calendar icon never crowds the label. Keep new fields inside those rows rather than stacking full-width blocks.
- Notifications are vertically centred and horizontally centred on every breakpoint. Sonner's ≤600px track is full-width with side offsets, so `src/styles/toaster.css` re-anchors the track to the viewport and centres each toast card on it; do not remove that mobile block.
- After each UI change, update this file or the relevant scoped design doc when a reusable pattern changes. Notify the user in the final response which screens and breakpoints were verified.
- **Permanent instruction (all sessions): after every prompt, update this context/skill file with any durable new preference or decision, and explicitly tell the user that the context was updated.**

## Design systems
- `pixobooks-shared.css` at the repo root is the legacy PixoBooks Signature Design System reference (Apple-blue/teal era controls, chips, data rows, custom checkboxes). It is **not imported globally**: its `body`/`*` resets would alter the whole app, and its palette is not the current skin system.
- Page-specific UI must import a local scoped stylesheet and namespace it under a root class:
  - `src/pages/Settings.tsx` + `src/pages/settings.css` use `.st`.
  - `src/components/features/inventory/ItemModal.tsx` + `item-modal.css` use `.im`.
  - `src/components/features/uom/UomManagerModal.tsx` + `uom-manager.css` use `.uom`.
- Page CSS should copy/reuse the shared component styles under the scope (`.st .btn`, `.st .input`, `.st .opt-card`, etc.) and avoid importing `pixobooks-shared.css` globally.
- Settings/design reference: `C:\Users\Pixo\Downloads\stitch_item_modal_design_system (26)\code.html` and `DESIGN.md`. The rendered `code.html` is the visual authority; `DESIGN.md` supplies typography/spacing culture.
- `docs/traditional-design.md` freezes the **Sales Report + Expenses** ledger baseline: tokens, page rhythm, range/filter culture, pinned rows, separators, the expense sheet and the glass-popover recipe. Measure changes to either page against it; do not drift the palette, row heights or separator weight.
- `docs/stock-design.md` freezes the STOCK page's mobile **Stock Ledger** culture: single-line search+filter+action filter card, ≤15% fit-width glass dropdowns with type-to-search, sticky above-table header, pinned ledger rows, grey-symbol full figures, bottom-sheet modals. Apply it to every dense list page on mobile; restore desktop with `md:` overrides.
- Use lucide icons with `className="icon"`; scoped CSS controls size/stroke.
- Do not add comments unless the surrounding code already relies on them.
- Responsive contract: every new screen must define intentional mobile
  (`<768px`), tablet (`768–1023px`), laptop (`1024–1279px`), and desktop
  (`>=1280px`) behavior. Do not assume `md:` means desktop. Prioritize the
  primary task, keep touch controls usable on touch widths, and restore the
  full desktop composition only at the large-screen breakpoint.

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

## Stock integrity (ledger, voids, receipts)
- Every quantity that moves inventory goes through `stock_movements` (`src/lib/stockLedger.ts` + `public.post_stock_movements`). `items.stock` is only a cache maintained by that RPC. Never write `items.stock` directly: sales use `commit_sale`, voids use `void_sale`, receipts/adjustments/imports/opening stock all post movements.
- `commit_sale(p_sale, p_payment, p_movements)` inserts the sale, its payment and the stock movements in one transaction and is idempotent on the stamped `number` — a retried checkout returns the existing sale instead of double-selling.
- `void_sale(p_sale_id, p_reason, p_movements)` verifies `sales.void` (or admin/admin) server-side, marks the document `voided_at` and posts the restoring movements atomically. Voided sales stay in the database; reports exclude them and the cash ledger keeps the original day's cash while posting a negative refund row on the void date.
- Stock Take computes period flows from the ledger when the ledger covers the period (`src/lib/stockReconcile.ts`), falling back to documents for older periods. Balances may be negative (oversold); never clamp them.
- Partial PO receipts are cumulative base quantities (`receivedBaseQty`) and post only the delivery delta, keyed `<po>:<n>`. Received/partially received POs are locked for editing and deletion.
- Deleting an item keeps its movement history (`item_id` becomes NULL).
- Migration order is `20261103000001`, `20261103000002`,
  `20261103000003`, `20261103000004_integrity_hardening.sql`,
  `20261103000005_transactional_inventory_controls.sql`, then
  `20261103000006_idempotency_and_insert_guards.sql`, then
  `20261103000007_authoritative_accounting_controls.sql`. The
  application fails closed until the ledger/RPC contract is installed; never
  restore a direct `items.stock` or step-by-step void fallback.

## Data import
- The import run lives in `src/lib/importJob.ts` (module-level store + `useImportJob`), **not** in `ImportDataModal`. Settings unmounts on navigation, so component-owned state used to lose the progress while the promises kept running. Never move the run back into React state.
- `ImportJobBanner` (`src/components/features/settings/ImportJobBanner.tsx`) is mounted by `AppLayout` and shows live progress on every route except `/settings`, where the full panel is visible. After completion both surfaces offer **More imports** and **Cancel**.
- `startImportJob` bumps a `runId`; stale async completions are ignored, so reset/start while a previous run is finishing cannot corrupt the store. Tests must call `resetImportJob()` in `beforeEach`.

## Inventory duplication
- Cloning an item opens `CloneSetupModal` (`src/components/features/inventory/ItemModal.tsx`) **before** the edit form and requires a SKU that differs from the source and from every existing item, plus a barcode that is either blank or unused. `nextFreeSku` suggests `SKU-2`, `SKU-3`, ….
- `submit()` re-checks both conflicts on every save (create, clone and edit). SKU is unique per business in the DB; barcode is not, so this client guard is the only thing preventing two products from scanning as one.
