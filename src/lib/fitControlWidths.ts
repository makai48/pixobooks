/**
 * fitControlWidths — global rule: a dropdown or text field must never be wider
 * than the text it carries.
 *
 * The CSS declares these controls `width: auto` with a `max-width` derived from
 * a `--fit-measure` custom property. This module measures each control's own
 * text with canvas text metrics (not character count, so mixed-width labels
 * like "Receipts & invoices" measure correctly) and writes that value in as the
 * property. Measuring is per-element because every control has different
 * options/placeholder text.
 *
 * Runs on load, on resize, and is exposed globally so React re-renders can
 * trigger it via `window.fitControlWidths()`.
 */

type RootElement = HTMLElement | Document;

let canvas: CanvasRenderingContext2D | null = null;

/** Lazily build a shared 2d context for text measurement. */
function measureCtx(): CanvasRenderingContext2D | null {
  if (canvas) return canvas;
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  canvas = ctx;
  return canvas;
}

/** Width of a string at a given font, or 0 when canvas is unavailable. */
function textWidth(text: string, font: string): number {
  const ctx = measureCtx();
  if (!ctx || !text) return 0;
  ctx.font = font;
  return ctx.measureText(text).width;
}

/** The text a control currently displays. */
function controlText(el: HTMLElement): string {
  if (el instanceof HTMLSelectElement) {
    // A select shows its selected option; fall back to the longest option so
    // the width is stable no matter which one is picked.
    const opts = Array.from(el.options ?? []).map((o) => o.text || "");
    const selected = el.options?.[el.selectedIndex]?.text ?? "";
    return selected || opts.reduce((a, b) => (b.length > a.length ? b : a), "");
  }
  if (el instanceof HTMLInputElement) {
    return el.value || el.placeholder || "";
  }
  return el.textContent?.trim() ?? "";
}

/** Comfortable floor, so a nearly-empty control never collapses. */
const MIN_WIDTH = 110;

function fitOne(el: HTMLElement): void {
  const font = window.getComputedStyle(el).font;
  const measured = textWidth(controlText(el), font);
  if (!measured) return;
  // Round up and add breathing room so the caret/glyph never clips.
  const px = Math.ceil(measured);
  el.style.setProperty("--fit-measure", `${px}px`);
  el.style.setProperty("--fit-min", `${MIN_WIDTH}px`);
}

/**
 * Measure every auto-fitting control under `root`.
 * Returns how many were measured, for testability.
 */
export function fitControlWidths(root: RootElement = document): number {
  const controls = Array.from(
    root.querySelectorAll<HTMLElement>("select.input, input.input")
  ).filter(
    (el) =>
      // Never size checkboxes/radios — they are square by design.
      !(el instanceof HTMLInputElement) ||
      (el.type !== "checkbox" && el.type !== "radio")
  );

  let count = 0;
  for (const el of controls) {
    // Controls explicitly pinned full-width (the two-panel data screens) keep
    // their width and are skipped.
    if (el.dataset.fit === "full") continue;
    fitOne(el);
    count++;
  }
  return count;
}

let resizeTimer: number | null = null;

/** Start watching. Idempotent — safe to call more than once. */
export function startFitControlWidths(root: RootElement = document): void {
  if (typeof window === "undefined") return;

  // Immediate pass, then again once fonts have settled.
  fitControlWidths(root);
  if (document.readyState !== "complete") {
    window.addEventListener("load", () => fitControlWidths(root), { once: true });
  }
  // Fonts load async; re-measure shortly after.
  window.setTimeout(() => fitControlWidths(root), 300);

  window.addEventListener("resize", () => {
    if (resizeTimer !== null) window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => fitControlWidths(root), 120);
  });
}

/** Expose for React components to re-measure after they change their markup. */
declare global {
  interface Window {
    fitControlWidths?: (root?: RootElement) => number;
  }
}

if (typeof window !== "undefined") {
  window.fitControlWidths = fitControlWidths;
}
