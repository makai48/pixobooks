import { PAYMENT_METHOD_META, type PaperSize, type Sale, type SaleLine, type SalePayment, type Settings } from "@/types";
import { EscPosWriter, type EscPosCodepage } from "./escpos";

const PAPER_TO_MM: Partial<Record<PaperSize, number>> = {
  "58mm": 58,
  "80mm": 80,
  "99x210mm": 99,
};

const DOC_TITLES: Record<string, string> = {
  receipt: "SALES RECEIPT",
  invoice: "TAX INVOICE",
};

export function paperWidthMm(settings: Settings): number {
  return PAPER_TO_MM[settings.printer.paperSize] ?? settings.receipt.paperWidthMm ?? 80;
}

export function receiptColumns(widthMm: number): number {
  if (widthMm <= 58) return 32;
  if (widthMm <= 80) return 48;
  return 64;
}

export function receiptCodepage(settings: Settings): EscPosCodepage {
  return settings.printer.codepage ?? "cp1252";
}

export function formatAmount(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  const rounded = Math.round(safe * 100) / 100;
  const [whole, cents] = Math.abs(rounded).toFixed(2).split(".");
  return `${rounded < 0 ? "-" : ""}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${cents}`;
}

export function formatPct(value: number): string {
  return `${Math.round((Number.isFinite(value) ? value : 0) * 100) / 100}%`;
}

export function formatQty(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  if (Number.isInteger(safe)) return String(safe);
  return String(Math.round(safe * 1000) / 1000);
}

export function formatStamp(iso: string, timeZone?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };
  try {
    const parts = new Intl.DateTimeFormat("en-GB", timeZone ? { ...options, timeZone } : options).formatToParts(date);
    const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    return `${pick("day")} ${pick("month")} ${pick("year")} ${pick("hour")}:${pick("minute")}`;
  } catch {
    return date.toISOString().slice(0, 16).replace("T", " ");
  }
}

export function wrapText(value: string, cols: number): string[] {
  const width = Math.max(8, Math.floor(cols));
  const out: string[] = [];
  for (const rawLine of value.split(/\r?\n/)) {
    const words = rawLine.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      if (!current) current = word;
      else if (current.length + 1 + word.length <= width) current = `${current} ${word}`;
      else {
        out.push(current);
        current = word;
      }
      while (current.length > width) {
        out.push(current.slice(0, width));
        current = current.slice(width);
      }
    }
    if (current) out.push(current);
  }
  return out;
}

export function padPair(left: string, right: string, cols: number): string {
  const width = Math.max(8, Math.floor(cols));
  const tail = right.length >= width ? right.slice(-width) : right;
  const room = width - tail.length - 1;
  if (room <= 0) return tail;
  const head = left.length > room ? left.slice(0, room) : left;
  return `${head}${" ".repeat(Math.max(1, width - head.length - tail.length))}${tail}`;
}

export function lineTotal(line: SaleLine): number {
  const gross = (Number(line.qty) || 0) * (Number(line.unitPrice) || 0);
  const pct = Math.max(0, Math.min(100, Number(line.discountPct) || 0));
  return gross * (1 - pct / 100);
}

export function hasCashPayment(sale: Sale, payments: readonly SalePayment[] = []): boolean {
  return sale.paymentMethod === "cash" || payments.some((payment) => payment.paymentMethod === "cash");
}

export type ReceiptBuildInput = {
  sale: Sale;
  settings: Settings;
  payments?: readonly SalePayment[];
  widthMm?: number;
  codepage?: EscPosCodepage;
  openDrawer?: boolean;
  timeZone?: string;
};

function rule(writer: EscPosWriter, cols: number): void {
  writer.align("left").line("-".repeat(cols));
}

export function buildReceiptBytes(input: ReceiptBuildInput): Uint8Array {
  const { sale, settings } = input;
  const payments = input.payments ?? [];
  const timeZone = input.timeZone ?? settings.timezone;
  const cols = receiptColumns(input.widthMm ?? paperWidthMm(settings));
  const writer = new EscPosWriter(input.codepage ?? receiptCodepage(settings)).init();
  const money = formatAmount;

  writer.align("center").size(2, 2).bold(true).line(settings.shopName.trim() || "PixoBooks");
  writer.size(1, 1).bold(false);

  const header = settings.receipt.header.trim();
  if (header) for (const line of wrapText(header, cols)) writer.line(line);
  if (settings.address.trim()) for (const line of wrapText(settings.address, cols)) writer.line(line);
  const contact = [settings.phone, settings.mobile].map((part) => part.trim()).filter(Boolean).join(" / ");
  if (contact) for (const line of wrapText(contact, cols)) writer.line(line);
  if (settings.email.trim()) for (const line of wrapText(settings.email, cols)) writer.line(line);

  writer.line();
  writer.align("center").bold(true).line(DOC_TITLES[sale.documentType] ?? "RECEIPT").bold(false);
  rule(writer, cols);

  writer.line(padPair("No", sale.number, cols));
  writer.line(padPair("Date", formatStamp(sale.createdAt, timeZone), cols));
  writer.line(padPair("Cashier", sale.cashierName, cols));
  if (sale.customerName) writer.line(padPair("Customer", sale.customerName, cols));
  writer.line(padPair("Method", PAYMENT_METHOD_META[sale.paymentMethod]?.label ?? sale.paymentMethod, cols));
  writer.line(padPair("Status", sale.paymentStatus.toUpperCase(), cols));
  if (sale.dueDate) writer.line(padPair("Due", formatStamp(sale.dueDate, timeZone), cols));
  rule(writer, cols);

  for (const line of sale.lines) {
    for (const text of wrapText(line.name, cols)) writer.line(text);
    const qty = `${formatQty(line.qty)}${line.unit ? ` ${line.unit}` : ""} x ${money(line.unitPrice)}`;
    writer.line(padPair(`  ${qty}`, money(lineTotal(line)), cols));
    if (line.discountPct > 0) writer.line(`  discount ${formatPct(line.discountPct)}`);
  }

  rule(writer, cols);
  writer.line(padPair("Subtotal", money(sale.subtotal), cols));
  if (sale.lineDiscountTotal > 0) writer.line(padPair("Line discount", `-${money(sale.lineDiscountTotal)}`, cols));
  if (sale.orderDiscountValue > 0) {
    const label = sale.orderDiscountPct > 0 ? `Order discount ${formatPct(sale.orderDiscountPct)}` : "Order discount";
    writer.line(padPair(label, `-${money(sale.orderDiscountValue)}`, cols));
  }
  writer.line(padPair(settings.taxRate > 0 ? `Tax ${formatPct(settings.taxRate)}` : "Tax", money(sale.tax), cols));
  writer.bold(true).line(padPair("TOTAL", money(sale.total), cols)).bold(false);
  if (sale.amountPaid > 0) writer.line(padPair("Paid", money(sale.amountPaid), cols));
  if (sale.amountDue > 0) writer.line(padPair("BALANCE DUE", money(sale.amountDue), cols));

  if (payments.length) {
    rule(writer, cols);
    writer.bold(true).line("PAYMENTS").bold(false);
    for (const payment of payments) {
      const label = PAYMENT_METHOD_META[payment.paymentMethod]?.short ?? payment.paymentMethod;
      const who = payment.receivedByName ? ` (${payment.receivedByName})` : "";
      writer.line(padPair(`${label}${who}`, money(payment.amount), cols));
    }
  }

  if (sale.loyaltyRedeemed > 0 || sale.loyaltyEarned > 0) {
    rule(writer, cols);
    if (sale.loyaltyRedeemed > 0) writer.line(padPair("Points redeemed", formatQty(sale.loyaltyRedeemed), cols));
    if (sale.loyaltyEarned > 0) writer.line(padPair("Points earned", formatQty(sale.loyaltyEarned), cols));
  }

  const footer = settings.receipt.footer.trim();
  writer.line();
  writer.align("center");
  if (footer) for (const line of wrapText(footer, cols)) writer.line(line);
  writer.align("left");
  writer.feed(3);

  const kickDrawer = input.openDrawer ?? (settings.printer.openDrawer && hasCashPayment(sale, payments));
  if (kickDrawer) writer.drawer();
  writer.cut();
  return writer.toBytes();
}

export type TestPrintOptions = {
  widthMm?: number;
  codepage?: EscPosCodepage;
  timeZone?: string;
};

export function buildTestPrintBytes(settings: Settings, options: TestPrintOptions = {}): Uint8Array {
  const width = options.widthMm ?? paperWidthMm(settings);
  const cols = receiptColumns(width);
  const codepage = options.codepage ?? receiptCodepage(settings);
  const writer = new EscPosWriter(codepage).init();

  writer.align("center").size(2, 2).bold(true).line(settings.shopName.trim() || "PixoBooks");
  writer.size(1, 1).bold(false).line("PRINTER TEST").line();
  rule(writer, cols);

  writer.align("left");
  writer.line(padPair("Device", settings.printer.deviceName || "Default Printer", cols));
  writer.line(padPair("Bus", settings.printer.printerType.toUpperCase(), cols));
  writer.line(padPair("Paper", `${settings.printer.paperSize} / ${cols} cols`, cols));
  writer.line(padPair("Codepage", codepage, cols));
  writer.line(padPair("Printed", formatStamp(new Date().toISOString(), options.timeZone ?? settings.timezone), cols));
  rule(writer, cols);

  writer.align("center");
  writer.line("Sample: ABC abc 123");
  writer.line("Accents: é ü ñ ç £ € °");
  writer.line();
  writer.line("If this text is readable and aligned,");
  writer.line("the printer is configured correctly.");
  writer.feed(3).cut();
  return writer.toBytes();
}
