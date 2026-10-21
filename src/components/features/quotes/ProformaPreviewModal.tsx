import { useMemo } from "react";
import { X, Printer, Download, Check } from "lucide-react";
import { toast } from "sonner";
import { useShopSettings } from "@/hooks/useShopSettings";
import { useUpdateQuoteStatus } from "@/hooks/useQuotes";
import DocumentView from "@/components/features/receipts/DocumentView";
import PrintablePortal from "@/components/features/receipts/PrintablePortal";
import type {
  Quote,
  Sale,
  PaymentMethod,
  PaymentStatus,
  DocumentType,
} from "@/types";
import { cn } from "@/lib/utils";

type Props = {
  quote: Quote;
  onClose: () => void;
};

/**
 * Preview / Print / Download a Quote as a Proforma Invoice.
 *
 * Rendering reuses the existing invoice DocumentView so proformas keep
 * an identical, professional look to real invoices \u2014 only the document
 * title is changed to "Proforma Invoice" and no payment side effects
 * occur. Every applicable field from the source quote is preserved:
 * customer, lines, quantities, prices, discounts, taxes, totals and
 * metadata.
 *
 * On first Print or Download the quote is auto-saved with status
 * `proforma` so it appears in the Proforma Invoices filter and can be
 * revisited later. It DOES NOT create a credit transaction until the
 * user explicitly sets the status to "Ordered" from the Quotes page.
 */
export default function ProformaPreviewModal({ quote, onClose }: Props) {
  const { data: settings } = useShopSettings();
  const updStatus = useUpdateQuoteStatus();

  const previewSale = useMemo<Sale | null>(() => {
    if (!settings) return null;
    return {
      id: quote.id,
      number: quote.number,
      createdAt: quote.createdAt,
      cashierId: quote.createdBy,
      cashierName: quote.createdByName,
      customerId: quote.customerId || null,
      customerName: quote.customerName || null,
      lines: quote.lines,
      subtotal: quote.subtotal,
      lineDiscountTotal: quote.lines.reduce(
        (s, l) => s + l.qty * l.unitPrice * (l.discountPct / 100),
        0
      ),
      orderDiscountPct: 0,
      orderDiscountValue: 0,
      tax: quote.tax,
      total: quote.total,
      cost: 0,
      profit: 0,
      paymentMethod: "credit" as PaymentMethod,
      paymentStatus: "credit" as PaymentStatus,
      documentType: "invoice" as DocumentType,
      amountPaid: 0,
      amountDue: quote.total,
      dueDate: quote.validUntil || null,
      loyaltyEarned: 0,
      loyaltyRedeemed: 0,
    };
  }, [quote, settings]);

  const persistProforma = async () => {
    if (quote.status === "proforma" || quote.status === "ordered" || quote.status === "converted") {
      return; // already saved as proforma (or beyond)
    }
    await new Promise<void>((resolve, reject) => {
      updStatus.mutate(
        { id: quote.id, status: "proforma" },
        {
          onSuccess: () => resolve(),
          onError: (e) => reject(e),
        }
      );
    });
  };

  const doPrint = async () => {
    try {
      await persistProforma();
      window.print();
      toast.success("Proforma invoice saved & sent to printer");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Print failed");
    }
  };

  const doDownload = async () => {
    if (!previewSale || !settings) return;
    try {
      await persistProforma();
      // Reuse the browser's print-to-PDF as the download path so the
      // downloaded document matches exactly what will be printed.
      window.print();
      toast.success("Proforma invoice saved. Use 'Save as PDF' in the print dialog to download.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    }
  };

  if (!previewSale || !settings) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-4 animate-fade-in no-print">
        <div className={cn("bg-white rounded-lg w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95dvh]")}>
          <div className="p-4 border-b flex items-center justify-between shrink-0">
            <div>
              <div className="text-[11px] uppercase tracking-widest text-gray-500">
                Proforma invoice preview
              </div>
              <div className="font-display text-lg font-bold text-gray-900">
                {quote.number}
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-md h-8 w-8 flex items-center justify-center hover:bg-gray-100 text-gray-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="overflow-auto bg-gray-100">
            <DocumentView
              sale={previewSale}
              settings={settings}
              variant="invoice"
              docLabel="Proforma Invoice"
            />
          </div>
          <div className="p-4 border-t bg-gray-50 flex flex-wrap gap-2 shrink-0">
            <button
              className="btn btn-outline flex-1 !text-gray-900 !border-gray-300"
              onClick={doDownload}
              disabled={updStatus.isPending}
            >
              <Download className="w-4 h-4" /> Download PDF
            </button>
            <button
              className="btn btn-outline flex-1 !text-gray-900 !border-gray-300"
              onClick={doPrint}
              disabled={updStatus.isPending}
            >
              <Printer className="w-4 h-4" /> Print
            </button>
            <button className="btn btn-primary flex-1" onClick={onClose}>
              <Check className="w-4 h-4" /> Close
            </button>
          </div>
          <p className="px-4 pb-3 -mt-1 text-[11px] text-gray-500">
            A proforma is a non-binding document. It will NOT be recorded as a
            credit transaction until you change its status to "Ordered".
          </p>
        </div>
      </div>
      <PrintablePortal>
        <DocumentView
          sale={previewSale}
          settings={settings}
          variant="invoice"
          docLabel="Proforma Invoice"
        />
      </PrintablePortal>
    </>
  );
}
