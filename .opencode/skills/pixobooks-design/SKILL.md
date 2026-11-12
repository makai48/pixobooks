---
name: pixobooks-design
description: PixoBooks V3 design language — auth surfaces, forms, and responsive business UI.
---

# PixoBooks V3 design language

V3 is the authority for identity surfaces (login, register, setup) and the
reference for new UI. Keep the app's established Paper & Ink operations screens
intact; scope V3 overrides to the surface being redesigned.

## Tokens (oklch, never hex in new work)

The app ships five skins — Papier, Tidal, Grove, Ember, Nocturne — applied as
`data-skin` + `data-theme` on `<html>`. The values below are the Papier light/dark
baseline; always consume the semantic CSS variables so every skin keeps working.

- Brand: `oklch(0.86 0.175 92)` (#FFCC08). Brand foreground: `oklch(0.18 0 0)`.
- Ink: `oklch(0.18 0 0)`; ink-foreground: `oklch(0.98 0 0)`.
- Background: `oklch(0.935 0.004 106)`; card: `oklch(1 0 0)`.
- Muted foreground: `oklch(0.56 0 0)`; border/input: `oklch(0.925 0.004 106)`.
- Secondary/muted surface: `oklch(0.95 0.003 106)`.
- Danger: `oklch(0.577 0.245 27.325)`; success: `oklch(0.72 0.15 155)`.
- Focus ring is brand. Radius scale starts at 12px (`--radius: 0.75rem`):
  controls `rounded-lg` = 12px, cards `rounded-2xl` = 20px.
- Shadows: card `0 1px 2px oklch(0 0 0 / .03), 0 12px 32px -12px oklch(0 0 0 / .08)`;
  brand `0 8px 20px -8px oklch(0.86 0.175 92 / .6)`.
- Dark surface: background `oklch(0.129 0.042 264.695)`, card
  `oklch(0.208 0.042 265.755)`, border `oklch(1 0 0 / 10%)`.

## Typography

- V3 auth surfaces: Display Manrope, body and controls DM Sans. Operational app
  surfaces (ledgers, POS, settings) use `font-display` = Fraunces and `font-sans` =
  Inter from `tailwind.config.ts`; `auth.css` overrides only the auth scope.
- Mono only for tabular numbers and OTP codes.
- Page titles: 1.5rem → 2.125rem via `clamp(1.5rem, 4vw, 2.125rem)`, weight 700,
  tight tracking. Ledes: 15px, muted, max 30ch.
- Auth field labels are sentence case, 14px, weight 500 — never uppercase. Dense ledger
  field labels are the opposite: 8–9px, uppercase, tracked, muted.
- Small overlines/kickers: 10px in auth, 600–700, uppercase, 0.16–0.2em tracking; ledger
  labels tighten to 8–9px.

## App chrome (sidebar)

- The signed-in identity card is a compact footer surface: 42px avatar (32px + 30%),
  name + role only — never the email, and no "Signed in" kicker. Outline it with a
  2px `border-brand` stroke — the skin's primary accent (Papier yellow) — not a white
  alpha or the neutral line token.
- Sign-out is a 32px circular icon button at the right edge of the identity card
  (`rounded-full`, LogOut glyph, quiet white/5 fill that brightens on hover). There is
  no separate full-width sign-out row; the button hides when the sidebar is collapsed.
- Business identity under the logo: shop name on one line, address/meta beneath it in
  mixed case, 9px, tight leading, wrapping to at most two lines (`line-clamp-2`).
- Sidebar navigation stays icon-led; the identity card is the only bordered surface
  in the footer.

## Operational ledgers (Sales + Expenses)

Density is the product. These two pages are one design family: pinned heights,
micro-labels over tabular numbers, no decorative colour, and no metric-card sprawl.

- **Range row:** Sales uses back chevron → `GlassSelect` → forward chevron, all 32px
  (`h-8`). Expenses uses the same glass select without the session chevrons, at a compact
  114/124px. Presets are Today, This Week, This Month, `<real year>` — never "This year".
  Selected session labels obey the saved date preference; manual picks read
  "Custom range". Expenses does not list a Custom option at all.
- **Filters:** collapsed by default. Sales uses an arrow-only toggle on mobile and a
  Show/Hide filters dropdown on desktop. Expenses uses an outlined `Filters` button with
  an active-filter count badge.
- **Separators:** one `divide-y` rule from the `line` token. Never layer per-row borders,
  and keep the mobile and desktop separator weight identical.
- **Sales rows:** 27px desktop / 21px mobile. Mobile grid is
  `44px | 16px | minmax(0,1fr) | 66px | 38px | 56px` (badge, initials, customer, when,
  qty/items, total). Currency symbols are hidden on mobile; `md+` shows full currency.
  Voided sales are hidden by default behind `Show voided`; the toggle never changes
  totals. Tap a row for the receipt/invoice.
- **Expenses rows:** the whole row is the edit target (click or Enter/Space). Delete is
  isolated, icon-only, 28/32px and outline-free. Category is plain faint text; payment
  method is plain faint text directly below the amount — no badge, border or background.
  Desktop is a 7-column ledger; mobile is a compact card with one shared divider.
- **Expenses bar:** sticky (`top-0 z-20`), carries the Expenses/Drawings tabs, range,
  Filters, Categories and New expense. Tabs stay outlined in both states, brand-filled
  when active, with a 6px gap. No metric cards, no Export, no second header card.
- **Expense sheet:** a 512px desktop dialog / phone bottom sheet with an icon-tiled header
  and outlined close. The header glyph follows the nav: Wallet for expenses (never Receipt),
  ArrowDownRight for drawings, Banknote for payroll. Controls are 34px on phones; the amount
  is a 16px right-aligned hero with a currency-code suffix; amount + date and method +
  vendor/payee share even rows, and the date trigger fills its cell so the calendar icon
  never crowds the date. Notes collapse behind `Add note`; the pinned footer shows
  `method · date` and full-width 36px actions on phones. Escape and backdrop click close;
  `max-h-[92dvh]`.
- **Dates:** the saved shop preset is app-wide and single-sourced. `formatDate` /
  `formatDateTime` (utils) read the active preset, `formatDateByPreference` /
  `formatDateTimeByPreference` take it explicitly, and `GlassDatePicker` defaults to it.
  Never call `toLocaleDateString` / `toLocaleString` for a date. This covers range
  triggers, ledger rows, summaries, tooltips, expiry/notice copy, receipts, on-screen
  documents and PDF/EscPos output. Months are short. `D MMM YYYY` renders `7 Nov` on
  mobile/compact and `7 Nov 2026` on larger surfaces.
- **Toasts:** centred on both axes at every breakpoint; keep the ≤600px Sonner track
  override in `src/styles/toaster.css`.
- Verify light + dark at `<768px`, `768–1023px`, `1024–1279px`, `≥1280px`.

## Statistics header and cashflow trend

- The Statistics header is a compact `paper-card`: identity/kicker and the active
  period remain visible, while advanced month/custom date filters are collapsed by
  default behind one outlined `Filters` toggle. On phone widths the range dropdown
  stays left and the Filters button is pinned to the far right of the action row.
- The period control is a tight `GlassSelect` with 15% headroom and reduced chrome
  (`triggerHeadroom={0.15}`, `menuHeadroom={0.15}`); do not add width classes that
  disable fit measurement. Presets are Today, This Week, This Month and the real
  current year. Last Week is not exposed in this selector.
- Custom date triggers always pass the saved `dateFormat`. Cashflow trend visuals
  consume the live `trendBundle` revenue and expense series so changing the period
  refreshes the chart rather than leaving a static-looking bar block.

## Team & Permissions surface

- The Employees page is a roster/detail workspace: a compact employee list on the
  left and the selected employee detail surface on the right at `xl`; below that
  breakpoint the surfaces stack to preserve readable names and permission labels.
- Employee rows stay fixed-height and scan-friendly. Names may wrap in the detail
  surface, but roster metadata remains compact and actions stay isolated at the edge.
- `users.avatar` is self-service: an employee may set only their own photo. Admins
  keep photo edits through `employees.manage` and can open the roster-wide **Photos**
  view to see every team picture at once (and who still has none).
- Profile, Attendance and Permissions use the dense Paper & Ink control rhythm;
  Payroll is an existing protected tab and must not be visually or behaviorally
  changed when redesigning the surrounding Team page.
- Invite and Sent Invites are bottom sheets on phones and centred dialogs at larger
  widths. Headers are compact, forms use pinned footers, and credentials/detail
  values use wrapping rather than truncation.
- Every implementation must be intentional at all four viewport bands: mobile
  `<768px`, tablet `768–1023px`, laptop `1024–1279px`, and desktop `≥1280px`.
  Mobile/tablet/laptop may use stacked or drill-in flows; desktop may use a
  two-pane composition. Do not treat `md:` as a substitute for checking each band.
- Phone density is a first-class concern: pair short fields two-up, keep
  28–34px controls with 12–13px text, cap text areas at ~44px, and put three
  summary cards on one line. A control is never wider than the text it holds.
- Paired fields must sit on one horizontal baseline — bottom-align the control
  inside its cell so a wrapped label cannot shift the row.
- On phones a phone field drops the flag, keeps the country-code box tight
  (`+256`) and gives the freed width to the number field; tablet and up keep the
  flag-first picker. Scope this per screen, never globally.
- A register-style list (customers, suppliers) pairs a search bar with its
  primary action on one line, reports `N of M` on its own count line, and gives
  each row a 44px phone height with the contact on the second line and 28px
  action targets. Its edit sheet and secondary dialogs are phone bottom sheets.
- Record sheets are siblings: the customer and supplier sheets share
  `src/styles/sheet.css` (identity strip, photo action, line-item rows, phone
  bottom sheet) and both mount the V3 scope. Build the next record sheet from
  those classes rather than writing a new one.
- A money/ledger form (daily balancing) keeps its own documented role scale
  rather than the V3 auth sheet, but borrows the same behaviours: phone bottom
  sheet, 34px controls, short values paired two-up and long values on their own
  row, explanatory paragraphs desktop-only, and no clipped figures. Related
  read-outs (balance c/d, variance) belong at the foot of the card that holds
  the inputs they describe, not as separate floating cards.
- **Mount V3 instead of imitating it.** `src/styles/auth.css` exposes a `.v3-scope`
  class that carries the V3 tokens and unlocks the field/button rules, so a
  non-auth screen can render the real `AuthModal` / `AuthField` primitives:
  20px card radius, brand-yellow CTA, floating icon fields, 33px controls below
  1024px and 44px from 1024px. Never hand-copy V3 values into a component —
  mount the scope and reuse the primitives. The scope carries **tokens only**:
  give the host `v3-scope-host` (`display: contents`) so a dialog mounted inside
  another screen adds no geometry to that page.
- A tab surface opens with one shared header row (icon tile + kicker + optional
  meta + right-aligned actions) and hides descriptive copy on touch widths.

## Metric surfaces (Sales + Inventory)

Colour is meaning, not decoration. Inventory keeps the quiet `surface-*` wash. The
Sales screen currently uses neutral paper cards with no fill or gradient; its metric
colours are intentionally removed. `StatCard`'s `fill` and `variant="solid"` remain
available for other deliberate uses, but Sales does not opt into them.

- **Semantics:** `brand` = headline revenue / skin identity; `success` = money in or
  profit; `danger` = owed or an exception; `warning` = a liability such as tax;
  `cyan` = raw materials; `ink` = neutral fact (counts, costs, inventory value). Never
  assign two meanings to one fill on the same screen.
- **Sales:** Revenue brand · Collected success · Outstanding danger (ink at zero) ·
  Sales in period ink · COGS ink · Gross profit success/danger · Tax warning. The
  label/value carry the metric; the solid card has no glyph or folded tab.
- **Inventory:** Products brand · Ready success · Materials cyan · Low stock danger
  (ink at zero) · desktop value strip ink. Inventory stays on the flat paper card.
- **Treatment — Sales:** standard `paper-card` with the established 14px radius, 1px
  line border and soft paper shadow; no semantic fill, solid gradient, icon or tab.
- **Typography — Sales:** the established card typography remains: uppercase tracked
  label (`7px` mobile / `11px` desktop) and Fraunces `font-display` bold tabular value
  (`12px` mobile / `clamp(1rem,5.5vw,1.5rem)` desktop).
- **Foregrounds:** brand = `--brand-foreground`; success/danger/cyan = white in light
  and `--brand-foreground` in dark; warning = `--ink` in light and
  `--brand-foreground` in dark; ink = `--paper` on `--ink` in light, and white on
  `--line` in dark. This keeps the large text legible on every skin.
- **Treatment — Inventory:** the flat `surface-*` wash (brand/success/cyan 18%,
  warning 20%, danger 16%, ink 7%) with a 36–42% semantic border, `.stat-label` at
  66% ink.
- **Interaction:** solid cards lift 2px on pointer hover with the shadow deepening;
  never on touch or with `prefers-reduced-motion: reduce`.
- **Text:** the currency prefix drops its muted grey on filled cards
  (`MoneyText muted={!fill}`). Selected foreground pairs are checked against each
  skin's token, not hardcoded.
- **Implementation:** keep surface class names as string literals (see `FILL_CLASS`)
  or Tailwind purges them from the build.
- The Sales `Report range` GlassSelect keeps its trigger width but scales the portalled
  listbox to `83%` of its calculated menu width (17% narrower); other GlassSelect menus
  remain unchanged.

## Auth composition (login/register)

- One centred column, `max-width: 420px`; page padding
  `clamp(0.75rem, 4vh, 4rem) 1rem`.
- Brand row: 40px circular logo (`/app-logo.png`, `object-fit: cover`) + Manrope
  20px wordmark and a 10px uppercase tracked subtitle.
- Rotating highlight: 28px brand tile with a 15px lucide icon, 13–14px text, and
  pill dots (active dot `w-5`, ink). Dwell 5s; in 340ms, out 220ms.
- Card: `max-width: 360px` on mobile/tablet, full column width at ≥1024px;
  padding `clamp(1rem, 3vh, 2rem) clamp(1.25rem, 5vw, 2rem)`; 20px radius,
  1px border, white surface, card shadow.
- Fields: 33px tall below 1024px, 44px at ≥1024px; 12px radius; 1px
  foreground/50 border; 18px leading icon at 16px; `padding-left: 44px`.
  Focus: foreground border + 4px brand/25 ring.
- Primary CTA: brand fill, ink text, 33px tall (48px at ≥1024px), 12px radius,
  600 weight; hover brightness 0.96 + brand shadow; active scale 0.99.
- Secondary links: foreground text with a 2px brand underline, offset 4px.
- Security note: 12px muted, 14px shield icon.
- Keep forms minimal: group related fields with small overlines, collapse
  advanced/regional settings, and avoid repeated helper copy.

## Background and motion

- Warm canvas with ~55 hand-placed lucide business icons (`strokeWidth: 1.25`):
  foreground/9% base, brand/50 for accents. Show only the `m` subset below 768px.
- Icons drift ±8px over 7s; stagger delays.
- Add a `center-quiet` radial (background 35% → transparent) over the icons.
- Cursor spotlight: 280px brand/16 glow plus a 200px icon mask, driven by
  `--mx`/`--my`; only for `(hover: hover) and (pointer: fine)` and
  `prefers-reduced-motion: no-preference`.
- Disable drift, carousel and spotlight under reduced motion.

## Rules

- Never swap the global Paper & Ink theme to force V3 on one screen; scope
  tokens and styles to the route.
- Logo and avatar marks stay circular and use `object-fit: cover`.
- Keep copy generic and business-focused — no print-shop branding.
- Verify at <768px, 768–1023px, 1024–1279px and ≥1280px, in light and dark.
