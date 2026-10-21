/**
 * Preview-faithful PDF for sales documents.
 *
 * Captures the real `DocumentView` invoice (the same React tree the POS shows
 * after a credit sale) with html2canvas and paginates it onto paper-sized
 * pages. Result is graphically identical to the on-screen preview: same
 * letterhead, logo, type, colours, zebra rows, badge, signatures and footer.
 *
 * Page breaks are placed on safe boundaries measured from the DOM: never
 * through a line of type, and never through a table row. Continuation pages
 * keep a small paper gutter and repeat the line-item table header so a long
 * invoice still reads like a printed document.
 */
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { jsPDF } from "jspdf";
import DocumentView from "@/components/features/receipts/DocumentView";
import type { DocumentExtras } from "@/components/features/receipts/DocumentView";
import type { Sale, SalePayment, Settings } from "@/types";

export type DocumentPdfOptions = {
  /** Page width/height in mm. Defaults to A4. */
  widthMm?: number;
  heightMm?: number;
  docLabel?: string;
  /** Layout to capture. Defaults to "auto", matching every on-screen preview. */
  variant?: "invoice" | "receipt" | "auto";
  /** Additional totals rows and content blocks rendered inside the invoice. */
  extras?: DocumentExtras;
};

const A4_W = 210;
const A4_H = 297;

/** Capture resolution bounds. 4x puts an A4 sheet near 384 DPI so small type
 *  stays crisp in print; the area budget keeps the canvas inside desktop
 *  browser limits, and capture retries at reduced scales absorb the tighter
 *  canvas caps on mobile browsers (16.7 Mpx on iOS). */
const MAX_SCALE = 4;
const MIN_SCALE = 1.25;
const MAX_CANVAS_AREA = 24_000_000;

/** Blank paper edge kept on continuation pages, in mm. */
const PAGE_GUTTER_MM = 8;

/** Never start the line-item table closer than this to the page bottom. */
const MIN_TABLE_KEEP_PX = 120;

function fileStem(n: string): string {
  return n.replace(/[^A-Za-z0-9-_]+/g, "-") || "invoice";
}

function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
}

async function waitForAssets(root: HTMLElement): Promise<void> {
  if (typeof document !== "undefined" && document.fonts?.ready) {
    await document.fonts.ready.catch(() => undefined);
  }
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) return resolve();
          const done = () => resolve();
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
          window.setTimeout(done, 4000);
        })
    )
  );
  await nextFrame();
}

type LeafRect = { top: number; bottom: number };
type TableLayout = {
  top: number;
  bottom: number;
  /** Bottom edge (CSS px, relative to the capture root) of every body row. */
  rows: number[];
  headerTop: number;
  headerBottom: number;
};

/** Leaf text blocks: the units a page break must never cut through. */
function measureTextBlocks(root: HTMLElement): LeafRect[] {
  const rootTop = root.getBoundingClientRect().top;
  const blocks: LeafRect[] = [];
  root.querySelectorAll<HTMLElement>("*").forEach((el) => {
    if (el.children.length > 0) return;
    if (!(el.textContent || "").trim()) return;
    const r = el.getBoundingClientRect();
    if (r.height <= 0) return;
    blocks.push({ top: r.top - rootTop, bottom: r.bottom - rootTop });
  });
  return blocks;
}

/** First table on the sheet: the invoice line items. Null on thermal receipts. */
function measureTable(root: HTMLElement): TableLayout | null {
  const table = root.querySelector("table");
  if (!table) return null;
  const rootTop = root.getBoundingClientRect().top;
  const box = table.getBoundingClientRect();
  if (box.height <= 0) return null;
  const head = table.querySelector("thead");
  const headBox = head ? head.getBoundingClientRect() : null;
  const rows = Array.from(table.querySelectorAll("tbody tr"))
    .map((row) => row.getBoundingClientRect())
    .filter((r) => r.height > 0)
    .map((r) => r.bottom - rootTop);
  return {
    top: box.top - rootTop,
    bottom: box.bottom - rootTop,
    rows,
    headerTop: headBox ? headBox.top - rootTop : 0,
    headerBottom: headBox ? headBox.bottom - rootTop : 0,
  };
}

function makeCutFinder(blocks: LeafRect[], table: TableLayout | null) {
  const bottoms = Array.from(new Set(blocks.map((b) => Math.round(b.bottom * 100) / 100))).sort(
    (a, b) => a - b
  );
  const insideText = (y: number) => blocks.some((b) => y > b.top + 0.75 && y < b.bottom - 0.75);
  return (start: number, nominalEnd: number, limit: number): number => {
    const cap = Math.min(nominalEnd, limit);

    // A break that lands inside the line-item table must fall between rows.
    if (table && cap > table.top + 1 && cap < table.bottom - 1) {
      const keep = start + MIN_TABLE_KEEP_PX;
      let row = -1;
      for (const y of table.rows) if (y > keep && y <= cap) row = Math.max(row, y);
      if (row > 0) return row;
      // Table would start too low: carry the whole table to the next page.
      if (table.top > keep) return table.top;
      let any = -1;
      for (const y of table.rows) if (y > start + 8 && y <= cap) any = Math.max(any, y);
      return any > 0 ? any : cap;
    }

    const floor = start + Math.max(80, (cap - start) * 0.55);
    let best = -1;
    for (const y of bottoms) {
      if (y <= floor) continue;
      if (y > cap) break;
      if (!insideText(y)) best = y;
    }
    return best > 0 ? best : cap;
  };
}

export async function downloadDocumentPdf(
  sale: Sale,
  settings: Settings,
  payments: SalePayment[] = [],
  opts: DocumentPdfOptions = {}
): Promise<void> {
  const pageW = opts.widthMm || A4_W;
  const pageH = opts.heightMm || A4_H;

  const host = document.createElement("div");
  host.setAttribute("data-pdf-capture", "1");
  host.style.cssText = [
    "position:fixed",
    "left:-10000px",
    "top:0",
    `width:${pageW}mm`,
    "background:#fff",
    "z-index:-1",
    "pointer-events:none",
  ].join(";");
  document.body.appendChild(host);

  let root: ReturnType<typeof createRoot> | null = null;
  try {
    root = createRoot(host);
    root.render(
      createElement(DocumentView, {
        sale,
        settings,
        payments,
        variant: opts.variant || "auto",
        docLabel: opts.docLabel,
        extras: opts.extras,
      })
    );
    await waitForAssets(host);

    const cssW = host.getBoundingClientRect().width;
    const cssH = host.scrollHeight;
    if (!cssW || !cssH) throw new Error("Nothing to render");

    const blocks = measureTextBlocks(host);
    const table = measureTable(host);
    const findCut = makeCutFinder(blocks, table);

    const scale = Math.max(
      MIN_SCALE,
      Math.min(MAX_SCALE, Math.sqrt(MAX_CANVAS_AREA / (cssW * cssH)))
    );

    const { default: html2canvas } = await import("html2canvas");
    const candidates = [scale, scale * 0.75, scale * 0.5]
      .map((s) => Math.max(1, s))
      .filter((s, i, arr) => arr.findIndex((x) => Math.abs(x - s) < 0.01) === i);
    let shot: HTMLCanvasElement | null = null;
    let captureError: unknown = null;
    for (const captureScale of candidates) {
      try {
        const attempt = await html2canvas(host, {
          scale: captureScale,
          backgroundColor: "#ffffff",
          useCORS: true,
          logging: false,
          imageTimeout: 8000,
          windowWidth: Math.max(document.documentElement.clientWidth, Math.ceil(cssW)),
          windowHeight: Math.ceil(cssH),
        });
        if (attempt.width && attempt.height) {
          shot = attempt;
          break;
        }
        captureError = new Error("Capture failed");
      } catch (err) {
        captureError = err;
      }
    }
    if (!shot) {
      throw captureError instanceof Error ? captureError : new Error("Capture failed");
    }
    const canvas = shot;

    const pxPerCss = shot.width / cssW;
    const mmPerCss = pageW / cssW;

    const doc = new jsPDF({ unit: "mm", format: [pageW, pageH], compress: true });
    doc.setProperties({
      title: `${sale.documentType === "invoice" ? "Invoice" : "Receipt"} ${sale.number}`,
      subject: settings.shopName || "Sales document",
      author: settings.shopName || "PixoBooks",
      creator: "PixoBooks",
    });

    const crop = (fromCss: number, toCss: number): string => {
      const sy = Math.max(0, Math.round(fromCss * pxPerCss));
      const sh = Math.max(1, Math.min(canvas.height - sy, Math.round((toCss - fromCss) * pxPerCss)));
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = sh;
      const ctx = slice.getContext("2d");
      if (!ctx) throw new Error("Canvas unavailable");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, sy, canvas.width, sh, 0, 0, canvas.width, sh);
      const data = slice.toDataURL("image/png");
      slice.width = slice.height = 0;
      return data;
    };

    const addSlice = (fromCss: number, toCss: number, yMm: number) => {
      const hMm = (toCss - fromCss) * mmPerCss;
      doc.addImage(crop(fromCss, toCss), "PNG", 0, yMm, pageW, hMm);
    };

    const headerMm =
      table && table.headerBottom > table.headerTop && table.headerBottom <= table.bottom
        ? (table.headerBottom - table.headerTop) * mmPerCss
        : 0;
    const addTableHeader = (yMm: number) => {
      if (!table || headerMm <= 0) return;
      doc.addImage(crop(table.headerTop, table.headerBottom), "PNG", 0, yMm, pageW, headerMm);
    };

    const fullPageCss = pageH / mmPerCss;

    // A one-page document stays pixel-identical to the preview: no gutters.
    if (cssH <= fullPageCss + 0.5) {
      addSlice(0, cssH, 0);
    } else {
      let yCss = 0;
      let pageIndex = 0;
      while (yCss < cssH - 0.5 && pageIndex < 40) {
        if (pageIndex > 0) doc.addPage([pageW, pageH]);
        const first = pageIndex === 0;

        const topMm = first ? 0 : PAGE_GUTTER_MM;
        const repeatHeader =
          !first && headerMm > 0 && !!table && yCss >= table.top - 1 && yCss < table.bottom - 1;
        const contentTopMm = topMm + (repeatHeader ? headerMm : 0);
        const usableCss = (pageH - contentTopMm) / mmPerCss;

        let cutCss: number;
        if (yCss + usableCss >= cssH - 0.5) {
          cutCss = cssH;
        } else {
          const breakableCss = Math.max(30, (pageH - contentTopMm - PAGE_GUTTER_MM) / mmPerCss);
          cutCss = findCut(yCss, yCss + breakableCss, cssH);
        }
        if (cutCss <= yCss + 1) cutCss = Math.min(cssH, yCss + usableCss);

        if (repeatHeader) addTableHeader(topMm);
        addSlice(yCss, cutCss, contentTopMm);

        yCss = cutCss;
        pageIndex += 1;
      }
    }

    doc.save(`${fileStem(sale.number)}.pdf`);
  } finally {
    root?.unmount();
    host.remove();
  }
}
