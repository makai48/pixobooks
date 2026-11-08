import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { toJsBarcodeFormat } from "@/lib/barcode";

type Props = {
  /** Exact decoded value. */
  value: string;
  /** ZXing format name, e.g. "EAN_13". Falls back to Code 128. */
  format?: string | null;
  /** Bar height in SVG units (the whole graphic scales responsively). */
  height?: number;
  /** Module width in SVG units. */
  width?: number;
  /** Quiet-zone margin in SVG units. */
  margin?: number;
  /** SVG background. Use "transparent" for the live camera overlay. */
  background?: string;
  /** Bar colour. White is used over the live camera, black on the result. */
  lineColor?: string;
  className?: string;
};

type JsBarcodeFn = (
  target: SVGElement,
  text: string,
  options: Record<string, unknown>
) => void;

/** Resolve JsBarcode's CommonJS export across Vite/browser interop. */
async function loadJsBarcode(): Promise<JsBarcodeFn | null> {
  try {
    const mod = await import("jsbarcode");
    const candidate =
      (mod as unknown as { default?: JsBarcodeFn }).default ??
      (mod as unknown as JsBarcodeFn);
    return typeof candidate === "function" ? candidate : null;
  } catch {
    return null;
  }
}

/**
 * Renders a real, vector barcode from the decoded value — never a camera
 * crop or screenshot. Black bars on white, quiet zones included, and scaled
 * with `viewBox` so it stays sharp at any size without distorting the bars.
 */
export default function BarcodeImage({
  value,
  format,
  height = 80,
  width = 2,
  margin = 12,
  background = "#ffffff",
  lineColor = "#000000",
  className,
}: Props) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    let cancelled = false;
    const el = ref.current;
    if (!el || !value) return;
    el.innerHTML = "";

    const options = {
      width,
      height,
      displayValue: false,
      background,
      lineColor,
      margin,
    };

    void (async () => {
      const JsBarcode = await loadJsBarcode();
      if (!JsBarcode || cancelled || !ref.current) return;

      const svg = ref.current;
      const draw = (fmt: string) =>
        JsBarcode(svg, value, { ...options, format: fmt });

      try {
        draw(toJsBarcodeFormat(format));
      } catch {
        svg.innerHTML = "";
        try {
          draw("CODE128");
        } catch {
          // Nothing renderable (e.g. control characters) — leave it blank.
          svg.innerHTML = "";
        }
      }

      // Convert the fixed-size output to a viewBox so CSS can scale it while
      // preserving the exact bar proportions.
      const w = svg.getAttribute("width");
      const h = svg.getAttribute("height");
      if (w && h) {
        svg.setAttribute("viewBox", `0 0 ${parseFloat(w)} ${parseFloat(h)}`);
        svg.removeAttribute("width");
        svg.removeAttribute("height");
      }
      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    })();

    return () => {
      cancelled = true;
    };
  }, [value, format, height, width, margin, background, lineColor]);

  return (
    <svg
      ref={ref}
      role="img"
      aria-label={`Barcode ${value}`}
      className={cn("block h-auto w-full", className)}
    />
  );
}
