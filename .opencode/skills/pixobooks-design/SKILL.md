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
- **Dates:** always `formatDateByPreference`. Months are short. `D MMM YYYY` renders
  `7 Nov` on mobile/compact and `7 Nov 2026` on larger surfaces.
- **Toasts:** centred on both axes at every breakpoint; keep the ≤600px Sonner track
  override in `src/styles/toaster.css`.
- Verify light + dark at `<768px`, `768–1023px`, `1024–1279px`, `≥1280px`.

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
