import type {
  ClientInvoice,
  ClientInvoicePayment,
  ClientPaymentDetails,
  PaymentMethod,
  Sale,
  SaleLine,
  SalePayment,
  Settings,
} from "@/types";
import { amountInWords } from "@/types";
import { formatCurrency } from "@/lib/utils";
import { downloadDocumentPdf } from "@/lib/documentPdf";
import type { DocumentExtraBlock, DocumentExtraTotals } from "@/components/features/receipts/DocumentView";

function atNoon(value: string | null | undefined): string {
  if (!value) return new Date().toISOString();
  const day = value.slice(0, 10);
  const d = new Date(`${day}T12:00:00`);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function money(n: number, currency: string): string {
  try {
    return formatCurrency(n, currency);
  } catch {
    return n.toFixed(2);
  }
}

function toSaleLines(invoice: ClientInvoice): SaleLine[] {
  const breakdown = Array.isArray(invoice.breakdown) ? invoice.breakdown : [];
  const lines = Array.isArray(invoice.lines) ? invoice.lines : [];
  const rows =
    breakdown.length > 0
      ? breakdown.map((b) => ({
          officer: b.officer,
          serviceName: b.serviceName,
          description: null as string | null,
          qty: b.qty,
          unit: b.unit,
          unitPrice: b.unitPrice,
          amount: b.amount,
        }))
      : lines.map((l) => ({
          officer: l.officer ?? "—",
          serviceName: l.serviceName,
          description: l.description ?? null,
          qty: l.qty,
          unit: l.unit,
          unitPrice: l.unitPrice,
          amount: l.amount,
        }));

  return rows.map((row, idx) => {
    const gross = row.qty * row.unitPrice;
    const pct = gross > 0 ? Math.min(100, Math.max(0, ((gross - row.amount) / gross) * 100)) : 0;
    const name = [
      row.serviceName,
      row.description || null,
      row.officer && row.officer !== "—" ? `· ${row.officer}` : null,
    ]
      .filter(Boolean)
      .join(" ");
    return {
      itemId: `client-line-${idx + 1}`,
      name,
      qty: row.qty,
      unit: row.unit || undefined,
      unitPrice: row.unitPrice,
      discountPct: pct,
    };
  });
}

function toSalePayments(invoice: ClientInvoice, payments: ClientInvoicePayment[]): SalePayment[] {
  const list = Array.isArray(payments) ? payments : [];
  return list.map((p) => ({
    id: p.id,
    saleId: invoice.id,
    amount: p.amount,
    paymentMethod: (p.cancelled
      ? `${p.paymentMethod} (cancelled)`
      : p.paymentMethod) as PaymentMethod,
    receivedBy: p.receivedBy ?? null,
    receivedByName: p.receivedByName ?? null,
    notes: p.notes ?? null,
    createdAt: atNoon(p.paymentDate),
  }));
}

function paymentDetailsBlock(invoice: ClientInvoice): DocumentExtraBlock | null {
  const loose = invoice as ClientInvoice & {
    paymentDetails?: ClientPaymentDetails | null;
    clientSnapshot?: Record<string, unknown> | null;
  };
  const sources: unknown[] = [loose.paymentDetails, loose.clientSnapshot?.paymentDetails];
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    const pd = source as ClientPaymentDetails;
    const lines = [
      pd.bankName ? `Bank: ${pd.bankName}` : null,
      pd.accountName ? `Account name: ${pd.accountName}` : null,
      pd.accountNumber ? `Account number: ${pd.accountNumber}` : null,
      pd.branch ? `Branch: ${pd.branch}` : null,
      pd.momo ? `Mobile Money: ${pd.momo}` : null,
      pd.instructions || null,
    ].filter(Boolean) as string[];
    if (lines.length > 0) return { title: "Payment details", lines };
  }
  return null;
}

export async function downloadClientInvoicePdf(
  invoice: ClientInvoice,
  settings: Settings,
  payments: ClientInvoicePayment[] = [],
  currency = settings.currency || "USD"
): Promise<void> {
  const taxable = invoice.subtotal + invoice.otherCharges;
  const rate = taxable > 0 && invoice.tax > 0 ? (invoice.tax / taxable) * 100 : 0;

  const totals: DocumentExtraTotals[] = [];
  if (invoice.discount > 0) {
    totals.push({
      label: "Discount",
      value: `− ${money(invoice.discount, currency)}`,
      negative: true,
    });
  }
  if (invoice.otherCharges > 0) {
    totals.push({ label: "Other charges", value: money(invoice.otherCharges, currency) });
  }

  const blocks: DocumentExtraBlock[] = [];
  if (invoice.status === "cancelled") {
    blocks.push({ title: "Status", lines: ["CANCELLED"] });
  }
  const words = invoice.amountInWords || amountInWords(invoice.total, currency);
  if (words) blocks.push({ title: "Amount in words", lines: [words], tone: "strong" });
  const details = paymentDetailsBlock(invoice);
  if (details) blocks.push(details);
  if (invoice.notes) blocks.push({ title: "Notes", lines: [invoice.notes] });

  const sale: Sale = {
    id: invoice.id,
    number: invoice.number,
    createdAt: atNoon(invoice.issueDate),
    cashierId: null,
    cashierName: invoice.createdByName || "—",
    customerId: invoice.clientId,
    customerName: invoice.clientSnapshot?.name || invoice.clientName || "—",
    lines: toSaleLines(invoice),
    subtotal: invoice.subtotal,
    lineDiscountTotal: 0,
    orderDiscountPct: 0,
    orderDiscountValue: 0,
    tax: invoice.tax,
    total: invoice.total,
    cost: 0,
    profit: 0,
    paymentMethod: invoice.amountPaid > 0 ? "partial" : "credit",
    paymentStatus:
      invoice.amountDue <= 0 ? "paid" : invoice.amountPaid > 0 ? "partial" : "credit",
    documentType: "invoice",
    amountPaid: invoice.amountPaid,
    amountDue: invoice.amountDue,
    dueDate: invoice.dueDate ? atNoon(invoice.dueDate) : undefined,
    loyaltyEarned: 0,
    loyaltyRedeemed: 0,
  };

  await downloadDocumentPdf(sale, settings, toSalePayments(invoice, payments), {
    variant: "invoice",
    extras: {
      taxLabel: rate > 0 ? `Tax (${Number(rate.toFixed(2))}%)` : "Tax",
      totals,
      blocks,
    },
  });
}
