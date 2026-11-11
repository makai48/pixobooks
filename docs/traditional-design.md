# Traditional Design — Sales Report & Expenses Ledger

**Status:** frozen baseline, amended 2026-11-12 with the shared Sales/Expenses ledger
culture. Established 2026-10-23 from the current live Sales Report
(`src/pages/SalesReport.tsx`). Treat this document as the "Traditional design" reference:
if a future redesign is proposed, it must be measured against these values, and any
deviation from the rules below is a deliberate new design, not a tweak.

**Scope:** `/sales-report` and `/expenses` on mobile (≤ 767px) and desktop (≥ 768px).
Shared chrome that the pages depend on (TopBar, SubNav, glass popovers) is included
because it defines the pages' perceived culture. Amendments are additive: older values
stay valid unless a later section explicitly supersedes them.

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
- **No theme drift.** Colors come exclusively from semantic tokens (`paper`, `card`, `ink`,
  `line`, `brand`, status) driven by the active `data-skin` + `data-theme`. Design work
  changes spacing, type scale and shape — never an individual screen's palette.

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
| Display / values | `font-display` (Fraunces; Manrope on V3 auth) | stat values, receipt number |
| Body / labels | `font-sans` (Inter; DM Sans on V3 auth) | everything else |
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
- Mobile totals hide the currency symbol (`formatNumber`); desktop uses full
  `formatCurrency`. This keeps the six-column mobile grid stable at 375px.
- Desktop keeps the full flex row (number, doc icon, cashier, time, due, profit).
- Voided documents are hidden by default. The `Show voided` chip reveals them, reports the
  hidden count, and never changes any total. Voided rows stay struck through and caged in
  the danger tone.
- Tapping any row opens the receipt/invoice; the per-row void action never changes row
  height.
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

### 4.11 Range and filter control culture (Sales + Expenses)

- Sales range row is **back chevron → glass range select → forward chevron**. All three
  controls are 32px tall (`h-8`); the chevrons use `input input-sm select-glass` and dim to
  35% when that direction has no session. Expenses uses the same glass range select
  without the session chevrons, at a compact 114/124px width.
- Presets share one order and one vocabulary: **Today, This Week, This Month, `<year>`**.
  The last option prints the real year (`2026`), never "This year". The selector is
  content-sized (`noTruncate`), uses 25% headroom plus 36px trigger / 48px menu chrome,
  and never truncates a preset or the selected session label.
- Session labels are produced by `formatDateByPreference` so they obey the saved date
  preference. Manual From/To picks switch the label to **Custom range**; Expenses does not
  list a Custom option at all.
- Filters are collapsed by default. Sales uses an arrow-only toggle on mobile and a
  Show/Hide filters `GlassSelect` on desktop. Expenses uses an outlined `Filters` button
  that carries an active-filter count badge and a rotating chevron.
- The Expenses filter panel is a single `paper-card` region under the sticky bar: search,
  category, From/To and a record count. From/To stay side-by-side at phone widths with
  8px uppercase labels above 28px glass date triggers.
- Active-filter count on Expenses = search text + non-All category + custom range.

### 4.12 Expenses ledger

- Page rhythm: `p-3 md:p-6` and `space-y-3 md:space-y-5`. There are **no metric cards**,
  no Export button and no secondary sidebar panel. The ledger starts directly below the
  sticky control bar.
- Sticky control bar: `sticky top-0 z-20`, wraps, `bg-paper/95` + backdrop blur, bottom
  `line` border. It carries the Expenses/Drawings tabs, range, Filters, Categories and
  New expense — nothing is split into a second header card.
- Tabs use a soft `ink/[0.055]` track with `gap-1.5`. Each tab is 32px tall, **outlined in
  both states** (brand border when active, `line` border when inactive), icon 15px with
  stroke 1.75 / 2.25, label 11px, and a 9px count pill.
- Buttons in the bar are 32px: outlined Categories (icon-only below `sm`) and solid ink
  New expense (icon + "New" below `sm`). Keep a visible gap between every pair.
- Table head is the global solid-ink `table-head-solid` surface, desktop only (`lg:grid`),
  with seven columns: Date, Category, Description, Vendor, Method, Amount, actions.
- Rows: desktop `min-h-[27px]`, `py-[3px]`, `lg:grid`; mobile is a compact card with
  `px-3 py-[3px]`. One shared `divide-y` rule in the `line` token separates rows — never
  per-row borders, and mobile/desktop separators must look identical in weight.
- The whole row is the edit target (click or Enter/Space) and opens the expense sheet.
  Delete is isolated, icon-only, 28/32px, outline-free, and stops propagation.
- Category is plain faint text (muted for expenses, `danger/70` for drawings). The amount
  is 11px bold mobile / 12px bold desktop. Payment method is plain faint text directly
  below the amount — no badge, border or background.
- Mobile dates use the compact preference (`7 Nov`); the range footer and desktop columns
  use the full preference (`7 Nov 2026`). Months are always short names.
- Footer: range endpoints on the left, record count and total on the right, 9/10px muted.

### 4.13 Expense sheet (modal)

- Bottom sheet on mobile, centred dialog from `md`; `max-w-md` → `md:max-w-lg` (512px),
  `max-h-[92dvh]`, page padding 6/16px. The dialog carries `role="dialog"`,
  `aria-modal`, `aria-labelledby`, Escape close and backdrop-click close.
- Header: 8px kicker / 15px title mobile, 10px / 20px desktop, `py-2.5` / `py-4`.
  A 32/36px solid icon tile (brand + Wallet for expenses, danger + ArrowDownRight for
  drawings, magenta + Banknote for payroll) uses the navigation icon language — the expense
  glyph is the same Wallet as the sidebar/bottom-nav Expenses tab, never Receipt. The close
  control is an outlined 32/34px icon button.
- Form body: `space-y-2 md:space-y-3`, labels 8.5/10px uppercase with 0.14em tracking,
  field margin none (labels own the gap).
- Control heights on phones: inputs and glass triggers **34px**, textarea 44px, footer
  buttons 36px. This is scoped under `.expense-modal` and is unlayered so it beats the
  global 40px phone control rule.
- Amount is the macro-number: 16px bold, right-aligned, tabular, with the currency code as
  a right-side suffix; focus selects the current value. It sits beside Payment date in an
  even two-column row; Payment date always fills its column (`fullWidth`) and reserves
  room for the calendar glyph, so the date text is never squeezed by the icon.
- Field order: Category, Description, Amount + Payment date, Payment method +
  Vendor/Payee, Notes. Never stack method/vendor as separate full-width rows.
- Drawing mode shrinks to one contextual strip: cash reduces today's till; card/transfer
  only changes the ledger.
- Salary mode is a compact magenta panel: employee + month (stacked below `sm`), then a
  payroll breakdown. Payroll values are 10px rows with a bordered total.
- Notes are collapsed by default behind **Add note**; editing an expense that already has
  notes opens them. Expanded height is 44px mobile / 80px desktop.
- Footer is pinned. From `sm` it shows `method · date` on the left; actions are 36px,
  full-width on phones with an 8px gap, and content-sized from `sm`. Record/Save carries a
  14px check icon.

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
10. Sales totals hide the currency symbol on mobile and show it from `md` up.
11. Voided sales are hidden by default; the reveal toggle never changes totals.
12. Every ledger row has exactly one horizontal separator from the `line` token; never
    layer per-row borders, and never restyle the separator between breakpoints.
13. Expense rows are tap-to-edit; delete stays isolated and outline-free. Category and
    payment method are plain text — no chip, badge or background box.
14. Expenses has no metric cards and no Export. The sticky bar is the only page header.
15. Dates render through `formatDateByPreference`; months are always short. `D MMM YYYY`
    means `7 Nov` on mobile/compact and `7 Nov 2026` on larger surfaces.
16. Notifications centre on the viewport at every breakpoint; never remove the ≤600px
    Sonner track override in `src/styles/toaster.css`.

---

## 6. Source map

| Concern | File |
| --- | --- |
| Sales page, stats, range, filter, row, modal | `src/pages/SalesReport.tsx` |
| Expenses page, sticky bar, ledger, row interactions | `src/pages/Expenses.tsx` |
| Expense entry sheet | `src/components/features/expenses/ExpenseModal.tsx` |
| Compact control tokens, `.select-glass`, `.glass-pop`, `.expense-*` | `src/index.css` (`@layer components`, mobile media query) |
| Shared date string | `src/lib/dateFormat.ts` |
| Range presets / week starts | `src/lib/week.ts` |
| Dropdown component | `src/components/ui/GlassSelect.tsx` |
| Calendar component | `src/components/ui/GlassDatePicker.tsx` |
| Toasts | `src/App.tsx` + `src/styles/toaster.css` |
| Tabs | `src/components/layout/SubNav.tsx` |
| Sign-out + header | `src/components/layout/TopBar.tsx` |
| Business/branch popup | `src/components/layout/BusinessSwitcher.tsx` |
| Tokens (colors, fonts, radii, shadow) | `tailwind.config.ts` + `src/index.css` |

Gate checks for any change: `npm run typecheck`, `npm run lint`, `npm run test`,
`npm run build`.

---

## 7. Amendments

- **2026-11-12** — Extended scope to `/expenses`; added shared range/filter culture (§4.11),
  Expenses ledger (§4.12) and expense sheet (§4.13); documented mobile currency hiding,
  voided-default behaviour, the one-divider row rule, tap-to-edit rows and short-date
  output; corrected typography to Manrope/DM Sans and token guidance to the skin system.
