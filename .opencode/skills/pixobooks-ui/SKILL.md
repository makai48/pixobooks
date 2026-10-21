---
name: pixobooks-ui
description: Use when editing PixoBooks pages or components to match the PixoBooks Signature Design System — Settings, ItemModal, forms, Apple-blue controls, sticky headers/footers, and scoped page CSS.
---

# PixoBooks UI

## When to use
Use for UI work in this repo when the task references a PixoBooks design, `code.html`, `DESIGN.md`, `pixobooks-shared.css`, the Settings page, or the ItemModal.

## Source of truth
1. The provided rendered `code.html` is the visual authority.
2. `DESIGN.md` supplements typography, spacing, and elevation.
3. `pixobooks-shared.css` at the repo root contains the reusable component styles.
4. Never import `pixobooks-shared.css` globally — its `body` reset changes the entire app. Copy/scoped rules into a page stylesheet instead.

## Required workflow
1. Read the design HTML/CSS and the current component before editing.
2. Port the full component stylesheet, scoped under a unique root class:
   - Settings: `.st` (`src/pages/settings.css`)
   - ItemModal: `.im` (`src/components/features/inventory/item-modal.css`)
   - UOM manager modal: `.uom` (`src/components/features/uom/uom-manager.css`)
3. Use the design's class names inside the page (`settings-window`, `settings-header`, `config-section`, `field-box`, `btn`, `input`, `opt-card`, `apple-checkbox-*`, `teal-banner-box`, `data-row`, `nav-pill`, `toast-notice`).
4. Preserve behavior while restyling: permissions, validation, dirty/save/reset, uploads, branch limits, exports, unit conversions, billing.
5. Verify with `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run test`.

## Layout rules
- The app scroll container is `<main>` inside `AppLayout`.
- Use `position: sticky; top: 0` for the page header and `bottom: 0` for the footer inside `<main>`.
- Give sections `scroll-margin-top` that clears the sticky header (110px mobile, 140px desktop).
- Keep the page full-bleed like `code.html`; do not wrap it in an app `paper-card`.
- On mobile the fixed bottom nav sits outside `<main>`; raise fixed toasts above it (Settings uses `bottom: 86px`).

## Component rules
- Buttons: `.btn` + `.btn-primary` / `.btn-outline` / `.btn-blue` / `.btn-sm` / `.btn-ghost-danger`.
- Inputs: `.input`, `textarea.input`, `select.input`; labels live in `.field-box > .field-label`.
- Numeric fields: add `num` for JetBrains Mono/tabular figures and right-align amounts.
- Choice cards: `.opt-cards-grid` + `.opt-card` (`.selected`).
- Checkboxes: `.checkbox-row` + `.apple-checkbox-input` + `.apple-checkbox-box` + `.checkbox-label`.
- Callouts: `.teal-banner-box`.
- Lists/tables: `.data-table-card` + `.data-row` + `.badge-hq`.
- Icons: lucide with `className="icon"`; CSS controls size.
- Use design tokens scoped on the root (`--apple-blue`, `--ink-*`, `--teal-*`, `--border-*`), never global `:root`.

## Settings specifics
- Save sends the complete `Settings` object through `useUpdateShopSettings`; keep `baseline`/`dirty` JSON comparison.
- Nav entries and rendered sections must share the same permission gates.
- `settings.phone` is printed on receipts; retain it even if the design omits it.
- `mapSettings()` only maps known keys; update type + mapper for new persisted settings.
- Expose all `EXPORT_CATEGORIES`, not just the design's sample three.

## UOM manager specifics
- `src/components/features/uom/UomManagerModal.tsx` is the Settings unit/conversion workspace. It uses `.uom` styles from `uom-manager.css`, portaled to `document.body`.
- Desktop keeps both panes side-by-side; mobile stacks them inside a fixed bottom sheet. Search/filter toolbars stay at the top of each pane while only the split area scrolls.
- Unit deletion is dependency-aware: use `findUomDependencies`/`useDeleteUom`, require an existing or inline-created replacement, and make historical PO/sale usage deactivate-only.
- Conversion deletion is guarded by `useDeleteUnitConversion`; do not allow removing an endpoint that inventory items use.
- Pass the full existing UOM (`categoryId`, `rounding`) when toggling active state.
- Preserve `can("settings.units") || can("settings.manage") || isAppOwner` permission gating.
