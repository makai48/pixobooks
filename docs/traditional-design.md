# Traditional Design — Sales Report

**Status:** frozen baseline. Established 2026-10-23 from the current live Sales Report
(`src/pages/SalesReport.tsx`). Treat this document as the "Traditional design" reference:
if a future redesign is proposed, it must be measured against these values, and any
deviation from the rules below is a deliberate new design, not a tweak.

**Scope:** `/sales-report` on mobile (≤ 767px) and desktop (≥ 768px). Shared chrome that
the page depends on (TopBar, SubNav, glass popovers) is included because it defines the
page's perceived culture.

---

## 1. Design culture

- **Operational density.** This is a working ledger, not a marketing page. Vertical space
  is the scarce resource; every section exists to scan transactions fast.
- **Paper and ink.** Warm paper background, white cards, near-black ink, a single muted
  grey for secondary text. Color is functional only (payment/status tones), never decorative.
- **Deterministic metrics.** Row heights, card heights and control heights are pinned in
  CSS, never inferred from content, permissions or async data. Refresh must never move the
  layout.
- **Micro-label / macro-number.** Tiny uppercase tracked labels sit above large mono
  values. Numbers use tabular figures so columns do not jitter.
- **Glass only for overlays.** Frosted surfaces are reserved for things that float above
  the page (popovers, dropdowns, calendars). Page surfaces stay opaque paper.
- **No theme drift.** Colors come exclusively from the existing HSL tokens. Design work
  changes spacing, type scale and shape — never the palette.

---

## 2. Tokens

### Color (`tailwind.config.ts` → `src/index.css` variables)

| Token | Use |
| --- | --- |
| `paper` | page background |
| `card` | cards, popover base |
| `ink` / `ink-soft` / `ink-mute` | primary / secondary / supporting text |
| `line` | card + field borders |
| `success` / `warning` / `danger` | semantic value tones |
| `cyan-reg` | wire + paid badge accent |
| `magenta.reg` | primary accent (POS pay, collect) |

### Typography

| Role | Family | Notes |
| --- | --- | --- |
| Display / values | `font-display` (Fraunces) | stat values, receipt number |
| Body / labels | `font-sans` (Inter) | everything else |
| Numerics | `.num` (JetBrains Mono) | tabular, `-0.01em` tracking |

### Shape, elevation, motion

- `paper-card`: 14px radius, 1px `line` border, layered soft shadow.
- Controls: 10px radius; chips/badges: pill.
- Glass popovers: 12px radius (`rounded-xl`), `fade-in` 160ms.
- Motion is short and functional; no bouncing, no parallax.

---

## 3. Page rhythm

| Property | Mobile | Desktop |
| --- | --- | --- |
| Page padding | `p-2.5` (10px) | `p-6` (24px) |
| Section gap | `space-y-2` (8px) | `space-y-4` (16px) |
| Card padding | `p-2` … `p-2.5` | `p-4` |
| Grid gaps | `gap-1.5` (6px) | `gap-3` (12px) |
| Breakpoint | `max-md:` ≤ 767px | `md:` ≥ 768px |

**Hard rule:** every component that appears on both sizes uses `md:` deltas only — the
mobile value is the base class.

---

## 4. Component specifications

### 4.1 Sub-navigation (tabs)

- Labels are short: `POS`, `Report`, `Held Tickets`, `Quotes`.
- Bar: `paper-card p-1.5`, horizontal scroll, hidden scrollbar.
- Tabs: `h-9` desktop / `h-7` mobile, `text-xs` / `10px`, uppercase, `tracking-widest` /
  `tracking-wide`, icon 14px / 12px.
- Active tab: solid `ink` background with `paper` text.

### 4.2 Stat cards

- Grid: 3-up on mobile. Desktop is 4-up: Revenue, Collected, Outstanding, **Sales in
  period** (the count is desktop-only; on mobile the meta line already reports the count).
- Card: `p-2` mobile / `p-4` desktop. Height on mobile ≈ 42px — roughly −25% vs. the
  pre-compaction card.
- Label: `7px` mobile / `11px` desktop, uppercase, `leading-none`, truncates.
- Value: `12px` mobile / `clamp(1rem, 5.5vw, 1.5rem)` desktop, `font-display`, bold, `.num`.
- Amounts are written in full (`formatCurrency`) and only compact to `1.2M` style at
  ≥ 1,000,000. Double-click expands the exact value.

### 4.3 Filter card

- Mobile: two logical rows under the search field, using `max-md:contents` so labels and
  controls become grid items of a `auto | 1fr | auto | 1fr` grid.
  - Row 1: `From [date] To [date]` �?" the label and its field are always on **one
    horizontal line**, even at 375px. Never stack `From` / `To` above their date controls.
  - Row 2: `Payment [select] Status [select]`
- Desktop: 6-column grid, labels above fields, search spans 2 columns, bottom-aligned.
- Card: `paper-card p-2.5` mobile / `p-4` desktop; `gap-x-1.5 gap-y-1.5` / `gap-3`.
- Labels: `9px` mobile uppercase (no wrap).
- Controls: 28px (`h-7`) on mobile, 36px (`h-9`) on desktop.

### 4.4 Controls

- Compact mobile tokens live in `src/index.css` under `@media (max-width: 767px)`:
  - `.btn.btn-sm` → `h-7`, `px-2`, `text-[11px]`, `gap-1`
  - `.input.input-sm` → `h-7`, `text-[13px]`
- These are unlayered rules with double-class specificity so they beat the global mobile
  `.btn { h-10 }` / `.input { h-10 }` overrides.

### 4.5 Action row

- Left: count line `N of N sales` (mobile) / `N of N transactions · tap any row…` (desktop).
- Right: Cashier dropdown + Reset + Export CSV, all 28px on mobile.
- The row may wrap; the action group stays right-aligned and grows with `flex-1` on mobile.

### 4.6 Transaction row — **pinned heights**

- Row wrapper: **`h-[27px]` desktop / `max-md:h-[21px]` mobile**, constant across refreshes,
  independent of permissions, content or async data.
- The row button is `h-full` so the click target equals the row.
- Mobile layout: one line — badge | initials | name (`1fr`) | time | items | total.
  Tracks: `40px | 17.5px | minmax(0,1fr) | auto | auto | auto`, `gap-x-1`.
- Mobile type: badge 8px uppercase 4-letter (`CASH`, `WIRE`…), initials 11px bold,
  name 11px, time 10px, items 10px bold, total 11px bold.
- Desktop keeps the full flex row (number, doc icon, cashier, time, due, profit).
- Void button (permission-gated) must never change row height: `max-md:h-full`, 10px icon.

### 4.7 Glass popovers (dropdowns + date picker)

- Trigger surface: `select-glass` — `card` at 55% alpha, 10px blur, 150% saturation,
  soft top highlight, themed option list.
- Popover surface `.glass-pop`:
  - **45% transparent** (`hsl(var(--card) / 0.55)`), light and dark themes.
  - `blur(18px) saturate(170%)`, 1px `ink/14%` border, inset top highlight, long soft shadow.
  - Opaque `card` fallback when `backdrop-filter` is unsupported.
- Behavior is part of the culture: portaled to `document.body`, viewport-clamped, flips
  above the trigger, closes on outside click / Escape / page scroll, keeps trigger focus,
  arrow-key navigation on selects, 32px option rows, calendar with 32px day cells.
- **Content-sized width.** A glass dropdown and its trigger text box are sized from the
  longest option label plus a fixed 50px chrome allowance (padding, chevron/check). They
  must never be padded more than 25% beyond the longest label (`glassFitWidth`). Fixed
  widths and minimums (`w-20`, `flex-1`, `min-w-[…]`) are forbidden on triggers; only
  `max-w-full` is allowed so an exceptionally long value truncates instead of overflowing.
  The calendar popover is the one exception: it stays at its 252px grid minimum while the
  date trigger still fits its `dd Mmm yyyy` label.

### 4.8 Receipt modal

- Overlay `p-2` mobile / `p-4` desktop; sheet `rounded-lg`, `max-h-[95dvh]`.
- Header `p-3` / `p-4`, kicker 10px / 11px, number `text-base` / `text-lg`.
- Footer actions remain 40px tall; document preview scrolls.

### 4.9 Global role scale (v1)

Opt-in role classes live in `src/index.css` and never change font family or color. Apply
them by class name; only Daily Balancing and Standing Order use them so far.

| Role | Class | Mobile | Desktop | Use |
| --- | --- | --- | --- | --- |
| Kicker | `.td-kicker` | 7px | 11px | card/section eyebrows |
| Field label | `.td-label` | 9px | 11px | input names |
| Title | `.td-title` | 14px | 18px | modal / section headings |
| Body | `.td-body` | 10px | 13px | rows, support copy |
| Hint | `.td-hint` | 9px | 10px | footnotes, audit notes |
| Value | `.td-value` | caller sets | caller sets | display/mono totals |
| Text box | `.input.input-sm` | 28px / 13px | 36px / 14px | inputs, glass triggers |
| Card | `.td-card` | 10px pad | 16px pad | pair with `paper-card` |

Textarea height comes from `min-h-12 md:min-h-16` so the mobile height rule cannot crush
it.

The **Cash Flow Summary** card uses a maintained 130% text scale: `.td-flow-kicker`
(9/14), `.td-flow-body` (13/17), `.td-flow-value` (14/21), `.td-flow-hint` (12/13).
These are derived from the base roles above — if a base role changes, recompute the
flow variants at ×1.3 rather than inventing new sizes.

### 4.10 Shared chrome

- TopBar: 48px / 56px tall; compact sign-out (`h-7` mobile via `btn-sm`, 16px icon).
- Business/branch popup: `w-52` desktop; **30% smaller on mobile** (`w-[146px]`, 22px rows,
  10px text, 12px icons). It is the only non-glass dropdown in the page culture.

---

## 5. Invariants (do not break)

1. Never change color tokens, themes or the paper/ink contrast.
2. Row height is always 21px mobile / 27px desktop and never content-derived.
3. Glass transparency stays at 45% (alpha 0.55) with blur 18px.
4. Popovers are portaled, clamped to the viewport and keyboard-dismissable.
5. Mobile is the base class set; desktop is expressed only with `md:` overrides.
6. Stat amounts stay unabbreviated below 1,000,000.
7. Desktop keeps the "Sales in period" card; mobile does not.
8. `From` / `To` labels and their date controls share one horizontal line on mobile.
9. Glass triggers and popups are content-sized (`longest label + 50px`, never >25% slack);
   no fixed trigger widths.

---

## 6. Source map

| Concern | File |
| --- | --- |
| Page, stats, filter, row, modal | `src/pages/SalesReport.tsx` |
| Compact control tokens, `.select-glass`, `.glass-pop` | `src/index.css` (`@layer components`, mobile media query) |
| Dropdown component | `src/components/ui/GlassSelect.tsx` |
| Calendar component | `src/components/ui/GlassDatePicker.tsx` |
| Tabs | `src/components/layout/SubNav.tsx` |
| Sign-out + header | `src/components/layout/TopBar.tsx` |
| Business/branch popup | `src/components/layout/BusinessSwitcher.tsx` |
| Tokens (colors, fonts, radii, shadow) | `tailwind.config.ts` + `src/index.css` |

Gate checks for any change: `npm run typecheck`, `npm run lint`, `npm run test`,
`npm run build`.
