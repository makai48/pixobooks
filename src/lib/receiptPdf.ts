import { jsPDF } from "jspdf";
import type { DocKind, Sale, SalePayment, Settings } from "@/types";
import { formatCurrency } from "@/lib/utils";
import { formatDateByPreference, formatDateTimeByPreference } from "@/lib/dateFormat";
import { formatPlainNumber } from "@/lib/numberFormat";
import { supabase, SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase";

export type PdfOptions = {
  kind: DocKind;
  /** Quick-thermal page width in mm (58 | 80 | 99). Defaults from settings. */
  widthMm?: number;
  /** Corporate page height in mm (custom sizes). Defaults per paper. */
  heightMm?: number;
  /** Corporate paper id for stock sizes. */
  paper?: "A4" | "A5" | "Letter" | "custom";
  /** Corporate rendering: preview-faithful capture (default) or the classic
   *  vector layout. */
  design?: "preview" | "classic";
};

const M = 14;

function money(n: number, currency: string): string {
  try {
    return formatCurrency(n, currency);
  } catch {
    return n.toFixed(2);
  }
}

function plain(n: number, s: Settings): string {
  return formatPlainNumber(n, {
    thousand: s.thousandSeparator || ",",
    decimal: s.decimalSeparator || ".",
    places: Math.min(4, Math.max(0, s.decimalPlaces ?? 2)),
    grouping: s.digitGrouping || "western",
    currency: s.currency,
  });
}

function fileStem(n: string): string {
  return n.replace(/[^A-Za-z0-9-_]+/g, "-") || "receipt";
}

export function quickSizes(): { id: string; label: string; w: number; h: number }[] {
  return [
    { id: "58", label: "58 mm", w: 58, h: 200 },
    { id: "80", label: "80 mm", w: 80, h: 200 },
    { id: "99", label: "99 × 210 mm", w: 99, h: 210 },
  ];
}

export function corporateSizes(): { id: string; label: string; w: number; h: number }[] {
  return [
    { id: "A4", label: "A4 (210 × 297)", w: 210, h: 297 },
    { id: "A5", label: "A5 (148 × 210)", w: 148, h: 210 },
    { id: "Letter", label: "Letter (216 × 279)", w: 216, h: 279 },
  ];
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

/** Fetch image bytes: direct first (same-origin/data URLs), else the authed
 *  proxy-image edge (defeats hotlink CORS blocks). Null when unreachable. */
async function fetchImageBlob(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) throw new Error("not an image");
    return blob;
  } catch {
    /* fall through to proxy */
  }
  try {
    const base = SUPABASE_URL;
    const key = SUPABASE_KEY;
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!base || !key || !token) return null;
    const res = await fetch(`${base.replace(/\/$/, "")}/functions/v1/proxy-image`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) return null;
    return blob;
  } catch {
    return null;
  }
}

/**
 * Logo for PDFs: circular crop mirroring the round on-screen logo.
 * Returns { cropped } and, when cropping is impossible but bytes exist,
 * { raw } (corporate letterhead uses it; thermal requires the circle).
 */
export async function loadLogo(url: string, px = 160): Promise<{ cropped: string | null; raw: string | null }> {
  const none = { cropped: null, raw: null };
  try {
    const blob = await fetchImageBlob(url);
    if (!blob) return none;
    const raw = await blobToDataUrl(blob).catch(() => null);
    if (typeof createImageBitmap === "undefined" || typeof document === "undefined") {
      return { cropped: null, raw };
    }
    try {
      const bmp = await createImageBitmap(blob);
      const c = document.createElement("canvas");
      c.width = c.height = px;
      const g = c.getContext("2d");
      if (!g) return { cropped: null, raw };
      g.beginPath();
      g.arc(px / 2, px / 2, px / 2, 0, Math.PI * 2);
      g.closePath();
      g.clip();
      const s = Math.max(px / bmp.width, px / bmp.height);
      const w = bmp.width * s;
      const h = bmp.height * s;
      g.drawImage(bmp, (px - w) / 2, (px - h) / 2, w, h);
      return { cropped: c.toDataURL("image/png"), raw };
    } catch {
      return { cropped: null, raw };
    }
  } catch {
    return none;
  }
}

/** One design for screen, print and PDF: receipts print thermal, invoices corporate. */
export async function downloadReceiptPdf(
  sale: Sale,
  settings: Settings,
  payments: SalePayment[] = [],
  opts?: PdfOptions
): Promise<void> {
  const kind: DocKind =
    opts?.kind || (sale.documentType === "invoice" || sale.amountDue > 0 ? "corporate" : "quick");
  const needsLogo = kind === "quick" || opts?.design === "classic";
  const loaded =
    needsLogo && settings.receipt.showLogo !== false && settings.logoUrl
      ? await loadLogo(settings.logoUrl)
      : { cropped: null, raw: null };
  if (kind === "quick") {
    const w = opts?.widthMm || settings.receipt.paperWidthMm || 80;
    const h = opts?.heightMm || (w >= 99 ? 210 : 200);
    return downloadThermalPdf(sale, settings, payments, w, h, loaded.cropped);
  } else if ((opts?.design || "preview") === "preview") {
    const w = opts?.widthMm || 210;
    const h = opts?.heightMm || 297;
    try {
      const { downloadDocumentPdf } = await import("@/lib/documentPdf");
      await downloadDocumentPdf(sale, settings, payments, { widthMm: w, heightMm: h });
    } catch (err) {
      // Never leave the user empty-handed: fall back to the classic layout.
      console.error("Preview PDF capture failed, using classic layout", err);
      return downloadCorporatePdf(sale, settings, payments, opts, loaded.cropped || loaded.raw);
    }
  } else {
    return downloadCorporatePdf(sale, settings, payments, opts, loaded.cropped || loaded.raw);
  }
}

/* ------------------------- Thermal (quick) PDF ------------------------- */

/* ------------------------- Thermal (quick) PDF ------------------------- */
// Pixel-twin of the on-screen thermal receipt: same order, same emphasis
// (bold/regular/red/tracked), same embedded JetBrains Mono, and paper height
// measured from the content (two passes: measure dry, then ink).

let monoCache: { regular: string; bold: string } | null = null;
let monoFailed = false;

function b64encode(bytes: ArrayBuffer): string {
  const u = new Uint8Array(bytes);
  let s = "";
  const CH = 0x8000;
  for (let i = 0; i < u.length; i += CH) s += String.fromCharCode(...u.subarray(i, i + CH));
  return btoa(s);
}

/** Embedded JetBrains Mono (preview family). Falls back to courier when offline. */
async function monoFont(doc: jsPDF): Promise<string> {
  if (monoFailed) return "courier";
  try {
    if (!monoCache) {
      const base = import.meta.env.BASE_URL;
      const load = async (f: string) => {
        const r = await fetch(`${base}fonts/${f}`);
        if (!r.ok) throw new Error(f);
        return b64encode(await r.arrayBuffer());
      };
      const [regular, bold] = await Promise.all([
        load("JetBrainsMono-Regular.ttf"),
        load("JetBrainsMono-Bold.ttf"),
      ]);
      monoCache = { regular, bold };
    }
    doc.addFileToVFS("JBM-Regular.ttf", monoCache.regular);
    doc.addFileToVFS("JBM-Bold.ttf", monoCache.bold);
    doc.addFont("JBM-Regular.ttf", "JBM", "normal");
    doc.addFont("JBM-Bold.ttf", "JBM", "bold");
    return "JBM";
  } catch {
    monoFailed = true;
    return "courier";
  }
}

type TLay = {
  doc: jsPDF;
  F: string;
  w: number;
  h: number;
  y: number;
  ink: boolean;
  s: Settings;
  sale: Sale;
  payments: SalePayment[];
  logo: string | null;
  condensed: boolean;
  L: number;
  cols: ThermalCols;
};

/** Column geometry for the thermal receipt. The header, every line item and
 *  the totals block all read their x positions from this one object, so a
 *  value can never drift away from the header it belongs to. */
export type ThermalCols = {
  /** Left edge of the item description. */
  itemX: number;
  /** Width available to the item description before the QTY column. */
  itemWidth: number;
  /** Centre of the QTY column — header and values share it. */
  qtyCenterX: number;
  /** Right edge of the unit-price column; null on condensed paper. */
  priceRightX: number | null;
  /** Right edge of the line total and of every totals amount. */
  amountRightX: number;
};

export function thermalColumns(w: number): ThermalCols {
  const condensed = w < 70;
  const amountRightX = w - 4;
  return {
    itemX: 4,
    itemWidth: condensed ? w - 30 : w - 46,
    qtyCenterX: condensed ? w - 22 : w - 34,
    priceRightX: condensed ? null : w - 20,
    amountRightX,
  };
}

const T_RED: [number, number, number] = [185, 28, 28];

function tNeed(c: TLay, hh: number) {
  if (c.y + hh > c.h - 6) {
    if (c.ink) c.doc.addPage([c.w, c.h]);
    c.y = 8;
  }
}

function tCenter(c: TLay, text: string, size: number, bold = false, gap = 4, space = 0) {
  c.doc.setFont(c.F, bold ? "bold" : "normal");
  c.doc.setFontSize(size);
  if (c.ink) {
    // jsPDF's `align: "center"` ignores the tracking added by `charSpace`, which
    // pushed tracked lines (the title and the receipt number) to the right.
    // Measure the tracked line ourselves and draw it from the true centre.
    const tracked = c.doc.getTextWidth(text) + space * Math.max(0, text.length - 1);
    c.doc.text(text, (c.w - tracked) / 2, c.y, { charSpace: space });
  }
  c.y += gap;
}

function tRule(c: TLay, ch = "-") {
  c.doc.setFont(c.F, "normal");
  c.doc.setFontSize(7);
  const n = Math.max(8, Math.floor((c.w - 8) / 1.6));
  if (c.ink) c.doc.text(ch.repeat(n), c.w / 2, c.y, { align: "center" });
  c.y += 4;
}

function tRow(c: TLay, label: string, val: string, bold = false, red = false) {
  tNeed(c, 4);
  c.doc.setFont(c.F, bold ? "bold" : "normal");
  c.doc.setFontSize(bold ? 8 : 7);
  if (red) c.doc.setTextColor(...T_RED);
  if (c.ink) {
    c.doc.text(label, c.L, c.y);
    c.doc.text(val, c.cols.amountRightX, c.y, { align: "right" });
  }
  if (red) c.doc.setTextColor(0, 0, 0);
  c.doc.setFontSize(7);
  c.y += 4;
}

/** Centred text that wraps inside the paper instead of running off the edge.
 *  Long shop names, addresses and contact lines used to be clipped by the page
 *  boundary; splitTextToSize keeps every character on the receipt. */
function tCenterBlock(
  c: TLay,
  text: string,
  size: number,
  bold: boolean,
  lineGap: number,
  space = 0
) {
  c.doc.setFont(c.F, bold ? "bold" : "normal");
  c.doc.setFontSize(size);
  const lines = c.doc.splitTextToSize(text, c.w - 8);
  tNeed(c, lineGap * lines.length);
  for (const line of lines) {
    if (c.ink) c.doc.text(line, c.w / 2, c.y, { align: "center", charSpace: space });
    c.y += lineGap;
  }
}

function layoutThermal(c: TLay): number {
  const { doc, s, sale, payments } = c;

  if (c.logo) {
    const d = c.w < 70 ? 11 : 13;
    if (c.ink) {
      try {
        doc.addImage(c.logo, "PNG", c.w / 2 - d / 2, c.y, d, d);
        doc.setDrawColor(170);
        doc.circle(c.w / 2, c.y + d / 2, d / 2, "D");
      } catch {
        /* decorative only */
      }
    }
    c.y += 17;
  }
  tCenterBlock(c, s.shopName || "Receipt", 10, true, 5);
  if (s.address) tCenterBlock(c, s.address, 7.5, false, 3.5);
  const contact = [s.phone && `Tel: ${s.phone}`, s.email].filter(Boolean).join(" · ");
  if (contact) tCenterBlock(c, contact, 7.5, false, 3.5);
  tRule(c, "=");

  tCenter(c, sale.documentType === "invoice" ? "SALES INVOICE" : "SALES RECEIPT", 9, true, 4.5, 0.5);
  tCenter(c, sale.number, 7.5, true, 4, 0.5);
  tRule(c);

  // Same date shape as the on-screen preview (saved preset, no seconds).
  const dt = formatDateTimeByPreference(sale.createdAt, s.dateFormat);
  const meta: [string, string, boolean][] = [
    ["Date", dt, false],
    ["Cashier", sale.cashierName || "—", false],
    ["Payment", sale.paymentMethod.toUpperCase(), false],
    ["Customer", sale.customerName || "Walk-in", true],
  ];
  for (const [k, v, b] of meta) {
    tNeed(c, 3.5);
    doc.setFont(c.F, b ? "bold" : "normal");
    doc.setFontSize(7.5);
    const prefix = `${k}: `;
    const valueX = c.L + doc.getTextWidth(prefix);
    // Wrap the value under itself instead of letting a long name run past the
    // paper edge (a 24-character customer name does not fit 58 mm).
    const valueLines: string[] = doc.splitTextToSize(v, Math.max(12, c.cols.amountRightX - valueX));
    tNeed(c, 3.5 * valueLines.length);
    if (c.ink) {
      doc.text(prefix, c.L, c.y);
      valueLines.forEach((line, i) => doc.text(line, valueX, c.y + i * 3.5));
    }
    c.y += 3.5 * valueLines.length;
  }
  tRule(c);

  doc.setFont(c.F, "bold");
  doc.setFontSize(7);
  const headY = c.y;
  if (c.ink) {
    if (c.condensed) {
      doc.text("ITEM", c.cols.itemX, headY);
      doc.text("QTY", c.cols.qtyCenterX, headY, { align: "center" });
      doc.text("TOTAL", c.cols.amountRightX, headY, { align: "right" });
    } else {
      doc.text("ITEM", c.cols.itemX, headY);
      doc.text("QTY", c.cols.qtyCenterX, headY, { align: "center" });
      doc.text("PRICE", c.cols.priceRightX ?? c.cols.amountRightX, headY, { align: "right" });
      doc.text("TOTAL", c.cols.amountRightX, headY, { align: "right" });
    }
  }
  c.y += 4;
  tRule(c);

  doc.setFontSize(7.5);
  for (const l of sale.lines || []) {
    const gross = l.qty * l.unitPrice;
    const net = gross * (1 - (l.discountPct || 0) / 100);
    const nameLines = doc.splitTextToSize(l.name || "", Math.max(10, c.cols.itemWidth));
    tNeed(c, 3.5 * nameLines.length + (l.discountPct > 0 ? 3.5 : 0) + 1);
    doc.setFont(c.F, "bold");
    if (c.ink) doc.text(nameLines, c.cols.itemX, c.y);
    doc.setFont(c.F, "normal");
    if (c.ink) doc.text(String(l.qty), c.cols.qtyCenterX, c.y, { align: "center" });
    if (!c.condensed && c.cols.priceRightX !== null && c.ink) {
      doc.text(plain(l.unitPrice, s), c.cols.priceRightX, c.y, { align: "right" });
    }
    doc.setFont(c.F, "bold");
    if (c.ink) doc.text(plain(net, s), c.cols.amountRightX, c.y, { align: "right" });
    c.y += 3.5 * nameLines.length;
    if (l.discountPct > 0) {
      doc.setFont(c.F, "normal");
      doc.setFontSize(7);
      doc.setTextColor(...T_RED);
      if (c.ink) doc.text(`Disc ${l.discountPct.toFixed(1)}% (-${plain(gross - net, s)})`, c.L + 2, c.y);
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(7.5);
      c.y += 3.5;
    }
    c.y += 0.5;
  }
  tRule(c);

  tRow(c, "Subtotal", plain(sale.subtotal, s));
  if (sale.lineDiscountTotal > 0) tRow(c, "Line discount", `- ${plain(sale.lineDiscountTotal, s)}`, false, true);
  if (sale.orderDiscountValue > 0) tRow(c, "Order discount", `- ${plain(sale.orderDiscountValue, s)}`, false, true);
  tRow(c, `Tax (${s.taxRate}%)`, plain(sale.tax, s));
  tRule(c, "=");
  tNeed(c, 5);
  doc.setFont(c.F, "bold");
  doc.setFontSize(10);
  if (c.ink) {
    doc.text("TOTAL", c.L, c.y);
    doc.text(money(sale.total, s.currency || "USD"), c.cols.amountRightX, c.y, { align: "right" });
  }
  doc.setFontSize(7.5);
  c.y += 5;
  tRule(c, "=");
  tRow(c, `Paid (${sale.paymentMethod.toUpperCase()})`, plain(sale.amountPaid, s));
  const change = Math.max(0, sale.amountPaid - sale.total);
  if (change > 0) tRow(c, "CHANGE", plain(change, s));
  if (sale.amountDue > 0) tRow(c, "BALANCE DUE", plain(sale.amountDue, s), true, true);

  if (sale.loyaltyEarned > 0 || sale.loyaltyRedeemed > 0) {
    tRule(c);
    if (sale.loyaltyEarned > 0) tRow(c, "Points earned", `+${sale.loyaltyEarned}`);
    if (sale.loyaltyRedeemed > 0) tRow(c, "Points redeemed", `-${sale.loyaltyRedeemed}`);
  }
  if (payments.length > 1) {
    tRule(c);
    tNeed(c, 4);
    doc.setFont(c.F, "bold");
    doc.setFontSize(7);
    if (c.ink) doc.text("PAYMENT HISTORY", c.L, c.y);
    c.y += 4;
    doc.setFont(c.F, "normal");
    for (const p of payments) {
      tNeed(c, 3.5);
      if (c.ink) {
        doc.text(`${formatDateByPreference(p.createdAt, s.dateFormat)} ${p.paymentMethod}`.slice(0, 30), c.L, c.y);
        doc.text(plain(p.amount, s), c.cols.amountRightX, c.y, { align: "right" });
      }
      c.y += 3.5;
    }
  }
  tRule(c, "=");
  if (s.receipt.header) {
    doc.setFont(c.F, "normal");
    doc.setFontSize(7.5);
    const lines = doc.splitTextToSize(s.receipt.header, c.w - 8);
    tNeed(c, 4 * lines.length);
    if (c.ink) doc.text(lines, c.w / 2, c.y, { align: "center" });
    c.y += 4 * lines.length;
  }
  if (s.receipt.footer) {
    doc.setFont(c.F, "normal");
    doc.setFontSize(7);
    const lines = doc.splitTextToSize(s.receipt.footer, c.w - 8);
    tNeed(c, 4 * lines.length);
    if (c.ink) doc.text(lines, c.w / 2, c.y, { align: "center" });
    c.y += 4 * lines.length;
  }
  tCenter(c, `*${sale.number}*`, 6, false, 3, 0.8);
  c.doc.setTextColor(130, 130, 130);
  tCenter(c, "Powered by PixoBooks", 6, false, 3);
  c.doc.setTextColor(0, 0, 0);
  return c.y;
}

async function downloadThermalPdf(
  sale: Sale,
  s: Settings,
  payments: SalePayment[],
  w: number,
  _hHint: number,
  logo: string | null
): Promise<void> {
  void _hHint;
  const CAP = 400;
  const measure = new jsPDF({ unit: "mm", format: [w, CAP], compress: true });
  const fm = await monoFont(measure);
  measure.setFont(fm, "normal");
  const mctx: TLay = {
    doc: measure, F: fm, w, h: CAP, y: 8, ink: false, s, sale, payments, logo,
    condensed: w < 70, L: 4, cols: thermalColumns(w),
  };
  const endY = layoutThermal(mctx);
  const h = Math.min(CAP, Math.max(40, endY + 4));
  const doc = new jsPDF({ unit: "mm", format: [w, h], compress: true });
  const F = await monoFont(doc);
  doc.setFont(F, "normal");
  const ctx: TLay = {
    doc, F, w, h, y: 8, ink: true, s, sale, payments, logo,
    condensed: w < 70, L: 4, cols: thermalColumns(w),
  };
  layoutThermal(ctx);
  doc.save(`${fileStem(sale.number)}.pdf`);
}

/* ------------------------ Corporate (A4/A5/…) PDF ------------------------ */

function downloadCorporatePdf(
  sale: Sale,
  settings: Settings,
  payments: SalePayment[],
  opts?: PdfOptions,
  logo?: string | null
): void {
  const paper = opts?.paper || "A4";
  const stock = corporateSizes().find((x) => x.id === paper);
  const w = opts?.widthMm || stock?.w || 210;
  const h = opts?.heightMm || stock?.h || 297;
  const named: "a4" | "a5" | "letter" | number[] =
    paper === "custom" || opts?.widthMm || opts?.heightMm ? [w, h]
    : paper === "A5" ? "a5" : paper === "Letter" ? "letter" : "a4";
  const doc = new jsPDF({ unit: "mm", format: named as never, compress: true });
  const R = w - M;
  let y = M + 2;
  const cur = settings.currency || "USD";
  const need = (hh: number) => {
    if (y + hh > h - 10) {
      doc.addPage(named as never);
      y = M + 2;
    }
  };

  const tx = M + (logo ? 21 : 0);
  if (logo) {
    try {
      // Square thumbnail (raw fallback may not be circularly cropped).
      doc.addImage(logo, "PNG", M, y - 1, 16, 16);
    } catch {
      /* decorative only */
    }
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(settings.shopName || "Invoice", tx, y + 5);
  y += 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90);
  for (const line of [settings.address, settings.phone, settings.email].filter(Boolean) as string[]) {
    doc.text(line, tx, y);
    y += 4.5;
  }
  doc.setTextColor(0);
  y += 2;
  doc.setDrawColor(200);
  doc.line(M, y, R, y);
  y += 6;

  // Clean receipt-no block.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(sale.documentType === "invoice" ? "INVOICE" : "RECEIPT", M, y);
  y += 6;
  doc.setFontSize(10);
  doc.text(sale.number, M, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const head: [string, string][] = [
    ["Issued", formatDateByPreference(sale.createdAt, settings.dateFormat)],
    ["Cashier", sale.cashierName || "—"],
    ...(sale.customerName ? [["Customer", sale.customerName] as [string, string]] : []),
    ...(sale.dueDate ? [["Due", formatDateByPreference(sale.dueDate, settings.dateFormat)] as [string, string]] : []),
  ];
  for (const [k, v] of head) {
    doc.text(k, M, y);
    doc.text(String(v), M + 24, y);
    y += 4.5;
  }
  if (sale.amountDue <= 0) {
    y += 1;
    doc.setFont("helvetica", "bold");
    doc.text("PAID IN FULL", M, y);
    doc.setFont("helvetica", "normal");
    y += 2;
  }
  y += 1;
  doc.line(M, y, R, y);
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.text("Item", M, y);
  doc.text("Qty", R - 62, y);
  doc.text("Price", R - 40, y, { align: "right" });
  doc.text("Amount", R, y, { align: "right" });
  y += 1.5;
  doc.line(M, y, R, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  for (const l of sale.lines || []) {
    const net = l.qty * l.unitPrice * (1 - (l.discountPct || 0) / 100);
    const nameLines = doc.splitTextToSize(String(l.name || ""), R - 70);
    need(6 * nameLines.length);
    doc.text(nameLines, M, y);
    doc.text(String(l.qty), R - 62, y);
    doc.text(money(l.unitPrice, cur), R - 40, y, { align: "right" });
    doc.text(money(net, cur), R, y, { align: "right" });
    y += 6 * nameLines.length;
  }
  doc.line(M, y, R, y);
  y += 6;

  const total: [string, number, boolean][] = [
    ["Subtotal", sale.subtotal, false],
    ...(sale.lineDiscountTotal > 0 ? [["Line discounts", -sale.lineDiscountTotal, false] as [string, number, boolean]] : []),
    ...(sale.orderDiscountValue > 0 ? [["Order discount", -sale.orderDiscountValue, false] as [string, number, boolean]] : []),
    ["Tax", sale.tax, false],
    ["TOTAL", sale.total, true],
    ["Paid", sale.amountPaid, false],
    ...(sale.amountDue > 0 ? [["Balance due", sale.amountDue, true] as [string, number, boolean]] : []),
  ];
  for (const [label, val, bold] of total) {
    need(6);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    if (bold) doc.setFontSize(11);
    doc.text(label, M, y);
    doc.text(money(val, cur), R, y, { align: "right" });
    doc.setFontSize(9);
    y += 6;
  }

  if (payments.length > 0) {
    y += 1;
    need(6);
    doc.setFont("helvetica", "bold");
    doc.text("Payments", M, y);
    doc.setFont("helvetica", "normal");
    y += 5;
    for (const p of payments) {
      need(4.5);
      doc.text(`${formatDateTimeByPreference(p.createdAt, settings.dateFormat)} — ${p.paymentMethod}`.slice(0, 80), M, y);
      doc.text(money(p.amount, cur), R, y, { align: "right" });
      y += 4.5;
    }
  }
  const foot = sale.documentType === "invoice" ? settings.invoice.terms : settings.receipt.footer;
  if (foot) {
    y += 3;
    need(10);
    doc.setFontSize(8);
    doc.setTextColor(90);
    doc.text(doc.splitTextToSize(foot, R - M), M, y);
    doc.setTextColor(0);
  }
  doc.save(`${fileStem(sale.number)}.pdf`);
}
