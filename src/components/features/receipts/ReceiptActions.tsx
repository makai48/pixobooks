import { useMemo, useState } from "react";
import { Receipt, Download, Check } from "lucide-react";
import { toast } from "sonner";
import type { DocKind, Sale, SalePayment, Settings } from "@/types";
import { downloadReceiptPdf, quickSizes, corporateSizes } from "@/lib/receiptPdf";
import { describePrintError, printSaleReceipt } from "@/lib/printing";
import { cn } from "@/lib/utils";
import GlassSelect from "@/components/ui/GlassSelect";

/**
 * Uniform receipt footer: output options + Print + PDF download + Done.
 * Quick = thermal (58/80/99×210, mirrors the on-screen receipt);
 * Corporate = sheets (A4/A5/Letter/custom). Same design prints and downloads.
 * Corporate PDF defaults to the exact preview design; "Classic" keeps the
 * older vector layout available.
 */
export default function ReceiptActions({
  sale,
  settings,
  payments = [],
  onClose,
  extra,
}: {
  sale: Sale;
  settings: Settings;
  payments?: SalePayment[];
  onClose: () => void;
  extra?: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<DocKind>(
    sale.documentType === "invoice" || sale.amountDue > 0 ? "corporate" : "quick"
  );
  const [sizeId, setSizeId] = useState<string>(() =>
    sale.documentType === "invoice" || sale.amountDue > 0
      ? ["A4", "A5", "Letter"].includes(settings.printer.paperSize)
        ? settings.printer.paperSize
        : "A4"
      : String(settings.receipt.paperWidthMm || 80)
  );
  const [customW, setCustomW] = useState(99);
  const [customH, setCustomH] = useState(210);
  const [design, setDesign] = useState<"preview" | "classic">(() => {
    try {
      return localStorage.getItem("pixobooks:pdf-design") === "classic" ? "classic" : "preview";
    } catch {
      return "preview";
    }
  });

  const pickDesign = (d: "preview" | "classic") => {
    setDesign(d);
    try {
      localStorage.setItem("pixobooks:pdf-design", d);
    } catch {
      /* private mode */
    }
  };

  const sizes = kind === "quick" ? quickSizes() : corporateSizes();

  const resolved = useMemo(() => {
    if (sizeId === "custom") {
      return {
        w: Math.min(500, Math.max(30, Number(customW) || 80)),
        h: Math.min(500, Math.max(50, Number(customH) || 200)),
        paper: "custom" as const,
      };
    }
    const s = sizes.find((x) => x.id === sizeId) || sizes[0];
    return { w: s.w, h: s.h, paper: s.id as "A4" | "A5" | "Letter" };
  }, [sizeId, customW, customH, sizes]);

  const switchKind = (k: DocKind) => {
    setKind(k);
    setSizeId(
      k === "quick"
        ? String(settings.receipt.paperWidthMm || 80)
        : ["A4", "A5", "Letter"].includes(settings.printer.paperSize)
          ? settings.printer.paperSize
          : "A4"
    );
  };

  const printViaBrowser = () => {
    // @page size drives the print dialog's paper for this job only.
    const style = document.createElement("style");
    style.setAttribute("data-receipt-page", "1");
    style.textContent = `@page { size: ${resolved.w}mm ${resolved.h}mm; margin: 3mm; }`;
    document.head.appendChild(style);
    const cleanup = () => style.remove();
    window.addEventListener("afterprint", cleanup, { once: true });
    window.setTimeout(cleanup, 5000);
    window.print();
  };

  const printWithSize = () => {
    if (settings.printer.printerType === "system") {
      printViaBrowser();
      return;
    }
    setBusy(true);
    void printSaleReceipt(sale, settings, payments)
      .then((outcome) => toast.success(`Sent to ${outcome.label}`))
      .catch((err) => {
        toast.error(describePrintError(err));
        printViaBrowser();
      })
      .finally(() => setBusy(false));
  };

  const downloadPdf = async () => {
    setBusy(true);
    try {
      await downloadReceiptPdf(sale, settings, payments, {
        kind,
        widthMm: resolved.w,
        heightMm: resolved.h,
        paper: resolved.paper,
        design,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "PDF failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t bg-gray-50 shrink-0">
      <div className="px-3 pt-2 flex flex-wrap items-center gap-2 text-[11px] text-gray-600">
        <div className="flex rounded-md border border-gray-300 overflow-hidden">
          {(["quick", "corporate"] as DocKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => switchKind(k)}
              className={cn(
                "h-7 px-2.5 font-semibold capitalize transition",
                kind === k ? "bg-gray-900 text-white" : "hover:bg-gray-100"
              )}
            >
              {k}
            </button>
          ))}
        </div>
        <GlassSelect
          value={sizeId}
          onChange={setSizeId}
          ariaLabel="Paper size"
          options={[
            ...sizes.map((s) => ({ value: s.id, label: s.label })),
            { value: "custom", label: "Custom…" },
          ]}
          className="input select-glass h-7 text-[11px] font-semibold"
        />
        {kind === "corporate" && (
          <div className="flex rounded-md border border-gray-300 overflow-hidden">
            {(
              [
                ["preview", "Preview"],
                ["classic", "Classic"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => pickDesign(id)}
                title={
                  id === "preview"
                    ? "Exact copy of the on-screen invoice (default)"
                    : "Classic vector layout"
                }
                className={cn(
                  "h-7 px-2.5 font-semibold transition",
                  design === id ? "bg-gray-900 text-white" : "hover:bg-gray-100"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {sizeId === "custom" && (
          <span className="inline-flex items-center gap-1">
            <input
              type="number"
              min={30}
              max={500}
              value={customW}
              onChange={(e) => setCustomW(Number(e.target.value))}
              className="h-7 w-14 rounded-md border border-gray-300 bg-white px-1 text-[11px] text-right"
              aria-label="Custom width mm"
            />
            ×
            <input
              type="number"
              min={50}
              max={500}
              value={customH}
              onChange={(e) => setCustomH(Number(e.target.value))}
              className="h-7 w-14 rounded-md border border-gray-300 bg-white px-1 text-[11px] text-right"
              aria-label="Custom height mm"
            />
            <span>mm</span>
          </span>
        )}
      </div>
      <div className="p-3 flex gap-2">
        <button
          type="button"
          className="btn btn-outline flex-1 h-10 text-xs sm:text-sm !text-gray-900 !border-gray-300"
          onClick={printWithSize}
          disabled={busy}
        >
          <Receipt className="w-4 h-4 shrink-0" /> Print
        </button>
        <button
          type="button"
          className="btn btn-outline flex-1 h-10 text-xs sm:text-sm !text-gray-900 !border-gray-300"
          onClick={downloadPdf}
          disabled={busy}
        >
          <Download className="w-4 h-4 shrink-0" /> {busy ? "…" : "PDF"}
        </button>
        {extra}
        <button
          type="button"
          className="btn btn-primary flex-1 h-10 text-xs sm:text-sm"
          onClick={onClose}
        >
          <Check className="w-4 h-4 shrink-0" /> Done
        </button>
      </div>
    </div>
  );
}
