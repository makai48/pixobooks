# Stock Design — Mobile Ledger Culture

**Status:** living baseline. Distilled 2026-11-01 from the STOCK page
(`src/pages/Inventory.tsx`) after the mobile-first programme. Assigned name:
**Stock Ledger**. Apply this recipe to every dense list/report page on mobile
(< 768px); desktop keeps its own layout — restore it with `md:` overrides
instead of changing it.

**Scope:** mobile list pages (STOCK, Report, Quotes, Held, POs, Suppliers,
Expenses, Stock Taking…). Shared primitives this culture depends on:
`GlassSelect`, `GlassDatePicker`, `MoneyText`, `StatCard`, `glassFitWidth`.

---

## 1. Design culture

- **Operational density.** A working ledger, not a marketing page. Vertical
  space is the scarce resource; scan speed beats decoration.
- **Mobile-first, desktop restored.** Mobile is the base classes; desktop is
  expressed with `md:` only. When a mobile restyle lands, the desktop
  appearance is restored with `md:` overrides (chips rows, card padding,
  text sizes) — never redefined by the mobile change.
- **Pinned metrics.** Row heights, control heights and stat sizes are fixed
  (`h-[30px]` mobile ledger rows, `h-6` chips, `input-sm`/`btn-sm` which are
  themselves mobile-only). Heights never depend on data or permissions.
- **No theme drift.** Never touch the color tokens. Darken/lighten only via
  `opacity` or `brightness()` filters on existing tokens.
- **Glass only for overlays.** Frosted surfaces (`select-glass` triggers,
  `glass-pop` popups) are for floating controls. Page surfaces stay opaque.

## 2. Page rhythm (top to bottom, mobile)

1. **Stat grid** — `grid-cols-3/4`, gap-1.5, `StatCard` (or local `Stat` in
   the same compact shape: `p-2`, 7px tracked label, 12px–clamp value,
   double-click expands `fullValue`).
2. **Value strip** (optional) — desktop keeps the `paper-card` strip;
   on mobile it becomes a bare right-aligned full figure above the table.
3. **Filter card** — ONE `paper-card p-2.5` row:
   `flex flex-wrap items-center gap-x-1.5 gap-y-1.5` containing, in order:
   search (`flex-1 min-w-[100px]`, icon `pl-7`, `input-sm`), one filter
   `GlassSelect`, the primary action (`btn-primary btn-sm`, responsive
   `New` / `New item` label). Everything shares the line; wrapping is the
   overflow safety net, never `shrink-0` on a fixed-width control.
4. **Count line** — `flex justify-between`: left `x of y` + hint
   (`md:hidden` short hint, `hidden md:inline` full hint); right holds the
   mobile value figure when the page has one.
5. **Ledger** — `paper-card overflow-hidden` + `divide-y`, pinned `h-[30px]`
   rows: status pill + `truncate` middle + right `num` figure. Desktop keeps
   its own richer cards (`hidden md:grid` / `md:hidden` ledger).

## 3. Dropdown rules (global)

- Every dropdown is `GlassSelect` (glass trigger + portaled `glass-pop`
  list, flips above the trigger when space is tight, `z-[70]`).
- **Width ≤ 15% over longest text** (`glassFitWidth`): the box hugs the
  longest option plus at most 15% headroom, floored at 64px. Never add
  `w-`/`min-w-`/`flex-1` sizing classes to the trigger itself when fit
  width is wanted — they disable it. Keep `min-w-0` off fit-width
  dropdowns; keep the trigger truncating.
- **Type-to-search:** lists longer than 6 options automatically get a
  search box pinned at the top of the popup (override with `searchable`).
  Selecting filters live; Enter picks the highlight; empty shows
  "No matches".
- No two fixed-width controls share a flex row with `shrink-0` — one of
  them must yield (`min-w-0` + truncate, or wrap the row).

## 4. Sticky header recipe (mobile)

Wrap everything above the table in one container:

```jsx
<div className="space-y-2 md:space-y-4 max-md:sticky max-md:top-0 max-md:z-20 max-md:-mx-2.5 max-md:-mt-2.5 max-md:px-2.5 max-md:pt-2.5 max-md:pb-2.5 max-md:bg-paper max-md:border-b max-md:border-line">
```

- `space-y` mirrors the page rhythm so desktop spacing is unchanged.
- Negative margin + padding makes the background full-bleed; `bg-paper`
  keeps scrolled rows from showing through; `z-20` stays under popups
  (`z-[70]`) and the fixed TopBar.
- **Table-edge rule:** never pull a bottom negative margin — it eats the
  `space-y` gap and tucks the table's top border under the opaque header
  even at rest. Keep `-mx`/`-mt` only, so a clean gap survives. The
  full-bleed `border-b` divider makes the stuck layering read as
  intentional chrome instead of a glitch.
- Sticky table heads inside scroll boxes must be fully opaque (`bg-paper`,
  never `/60`) or scrolled rows ghost through them.

## 5. Money rules

- All amounts render through `MoneyText`: full `formatCurrency` figures,
  never compact, with the currency symbol at 0.75em in uniform grey
  (`text-ink-mute brightness-[0.77]`) regardless of card tone.
- `title` always carries the full figure wherever a compact form shows.

## 6. Modal culture

- Bottom sheet on mobile (`items-end p-2`), centered dialog on desktop.
- Compact header (`px-2.5 py-2`, 9px kicker, base/title), `md:` restores.
- Dense two-line mobile line-blocks + desktop 12-col grid rows.
- Micro labels (`text-[9px] md:text-xs`), pinned footer with
  `form="<id>"` submit so actions survive scrolling.

## 7. Collapsible filter drawer

- **25% rule:** when the operations mechanism, info blocks and/or header
  elements occupy more than 25% of the screen — squeezing a long list or
  table into an inconvenient viewport — collapse them by default behind a
  single toggle. The list gets maximum room; controls are one tap away.
- One `md:hidden` toggle button (`SlidersHorizontal` + rotating chevron,
  `aria-expanded`) pinned at the top of the sticky header, labelled for
  what it holds (e.g. "Period & filters").
- The drawer content keeps the normal `space-y` rhythm; hiding uses
  `max-md:hidden` when closed so desktop (`md:block` flow) never changes.
- Collapsed by default (`useState(false)`); expanding is explicit. Stats
  that summarise the list at a glance may stay outside the drawer.
- The sticky header recipe (§4) still applies — the toggle pins while the
  list scrolls beneath.
