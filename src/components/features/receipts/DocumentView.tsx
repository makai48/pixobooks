import type { Sale, Settings, SalePayment } from "@/types";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { formatDateByPreference, formatDateTimeByPreference } from "@/lib/dateFormat";
import { formatPlainNumber } from "@/lib/numberFormat";
import type { GroupingSystem } from "@/lib/referenceData";

type Variant = "receipt" | "invoice" | "auto";

export type DocumentExtraTotals = {
  label: string;
  value: string;
  negative?: boolean;
};

export type DocumentExtraBlock = {
  title: string;
  lines: string[];
  /** "strong" prints block lines in full black; defaults to muted gray. */
  tone?: "muted" | "strong";
};

export type DocumentExtras = {
  taxLabel?: string;
  totals?: DocumentExtraTotals[];
  blocks?: DocumentExtraBlock[];
};

type Props = {
  sale: Sale;
  settings: Settings;
  payments?: SalePayment[];
  variant?: Variant;
  /** Override the printed document title for the A4 invoice layout.
   *  Defaults to "Invoice". Pass e.g. "Proforma Invoice" when previewing
   *  a quote-derived proforma. Never affects data — only the label. */
  docLabel?: string;
  extras?: DocumentExtras;
};

/**
 * Realistic receipt (thermal 58/80mm) and invoice (A4/Letter) renderer used
 * both for on-screen preview and for print output. When printing, only the
 * .print-page element is visible (see index.css @media print block).
 */
export default function DocumentView({ sale, settings, payments = [], variant = "auto", docLabel, extras }: Props) {
  const kind =
    variant === "auto"
      ? sale.documentType === "invoice" || sale.amountDue > 0
        ? "invoice"
        : "receipt"
      : variant;
  if (kind === "invoice") {
    return (
      <InvoiceLayout
        sale={sale}
        settings={settings}
        payments={payments}
        docLabel={docLabel}
        extras={extras}
      />
    );
  }
  return <ReceiptLayout sale={sale} settings={settings} payments={payments} />;
}

/* ------------------------------ Thermal Receipt ------------------------------ */

function ReceiptLayout({
  sale,
  settings,
  payments,
}: {
  sale: Sale;
  settings: Settings;
  payments: SalePayment[];
}) {
  const currency = settings.currency;
  const dt = formatDateTimeByPreference(sale.createdAt, settings.dateFormat);
  const change = Math.max(0, sale.amountPaid - sale.total);
  const isNarrow = settings.receipt.paperWidthMm === 58;
  const widthMm = `${settings.receipt.paperWidthMm}mm`;
  // One column template shared by the item header, every line and the totals.
  // Fixed tracks (instead of per-row `auto`) guarantee that a wider price or
  // quantity can never shift its column away from the header above it.
  const cols = isNarrow
    ? "grid grid-cols-[minmax(0,1fr)_2rem_4rem] gap-1"
    : "grid grid-cols-[minmax(0,1fr)_2rem_3.5rem_4rem] gap-1";
  // Totals rows reuse the same tracks: the label spans every column but the
  // amount one, so the amounts sit exactly under the TOTAL header.
  const labelSpan = isNarrow ? "col-span-2" : "col-span-3";
  // Thermal design: plain numbers everywhere (currency implied by the shop),
  // formatted with the shop's own separators/grouping — the same helper the
  // rest of the app uses, so a receipt can never disagree with the ledger.
  // Only the big TOTAL keeps the currency code so the amount is unambiguous
  // at a glance.
  const plain = (n: number): string =>
    formatPlainNumber(n, {
      thousand: settings.thousandSeparator || ",",
      decimal: settings.decimalSeparator || ".",
      places: Math.min(4, Math.max(0, settings.decimalPlaces ?? 2)),
      grouping: (settings.digitGrouping || "western") as GroupingSystem,
      currency: settings.currency,
    });

  return (
    <div
      className="mx-auto bg-white text-gray-900"
      style={{
        width: widthMm,
        maxWidth: "100%",
        padding: "5mm 4mm",
        fontFamily: "'JetBrains Mono', 'Courier New', ui-monospace, monospace",
        fontSize: "10px",
        lineHeight: 1.4,
      }}
    >
      {settings.receipt.showLogo && settings.logoUrl && (
        <div className="text-center mb-1.5">
          <img
            src={settings.logoUrl}
            alt=""
            className={`inline-block rounded-full object-cover border shrink-0 ${isNarrow ? "h-10 w-10" : "h-12 w-12"}`}
            onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
          />
        </div>
      )}
      <div className="text-center">
        <div className="font-bold text-[12px] uppercase tracking-wide break-words">
          {settings.shopName}
        </div>
        {settings.address && (
          <div className="text-[10px] leading-tight break-words">{settings.address}</div>
        )}
        {(settings.phone || settings.email) && (
          <div className="text-[10px] leading-tight break-words">
            {settings.phone && <>Tel: {settings.phone}</>}
            {settings.phone && settings.email && <> · </>}
            {settings.email && <span className="break-all">{settings.email}</span>}
          </div>
        )}
      </div>

      <Rule kind="double" />

      <div className="text-center">
        <div className="font-bold uppercase text-[11px] tracking-widest">
          Sales Receipt
        </div>
        <div className="text-[9px] font-mono">{sale.number}</div>
      </div>

      <Rule />

      <div className="text-[9px] space-y-0.5">
        <RowLabel label="Date" value={dt} />
        <RowLabel label="Cashier" value={sale.cashierName} />
        <RowLabel label="Payment" value={sale.paymentMethod.toUpperCase()} />
        <RowLabel label="Customer" value={sale.customerName || "Walk-in"} bold />
      </div>

      <Rule />

      {isNarrow ? (
        <>
          {/* --- Condensed 58mm layout: Item / Qty / Total only --- */}
          <div className={cn(cols, "text-[8px] uppercase font-bold border-b border-gray-400 pb-0.5")}>
            <span>Item</span>
            <span className="text-center">Qty</span>
            <span className="text-right">Total</span>
          </div>
          {sale.lines.map((l, i) => {
            const gross = l.qty * l.unitPrice;
            const discAmt = (gross * l.discountPct) / 100;
            const net = gross - discAmt;
            return (
              <div key={i} className="py-1 border-b border-dashed border-gray-300">
                <div className={cn(cols, "text-[9px]")}>
                  <span className="font-semibold pr-1 text-left break-words">
                    {l.name}
                  </span>
                  <span className="text-center num">{l.qty}</span>
                  <span className="text-right num font-bold whitespace-nowrap">
                    {plain(net)}
                  </span>
                </div>
                {l.discountPct > 0 && (
                  <div className="text-[8px] text-red-700 italic mt-0.5">
                    Disc {l.discountPct.toFixed(1)}%
                  </div>
                )}
              </div>
            );
          })}
        </>
      ) : (
        <>
          {/* --- Original full layout: Item / Qty / Price / Total --- */}
          <div className={cn(cols, "text-[8px] uppercase font-bold border-b border-gray-400 pb-0.5")}>
            <span>Item</span>
            <span className="text-center">Qty</span>
            <span className="text-right">Price</span>
            <span className="text-right">Total</span>
          </div>
          {sale.lines.map((l, i) => {
            const gross = l.qty * l.unitPrice;
            const discAmt = (gross * l.discountPct) / 100;
            const net = gross - discAmt;
            return (
              <div key={i} className="py-1 border-b border-dashed border-gray-300">
                <div className={cn(cols, "text-[9px] items-start")}>
                  <span className="font-semibold pr-1 text-left break-words">{l.name}</span>
                  <span className="text-center num">{l.qty}</span>
                  <span className="text-right num whitespace-nowrap">
                    {plain(l.unitPrice)}
                  </span>
                  <span className="text-right num font-bold whitespace-nowrap">
                    {plain(net)}
                  </span>
                </div>
                {l.discountPct > 0 && (
                  <div className="text-[8px] text-red-700 italic mt-0.5">
                    Disc {l.discountPct.toFixed(1)}% (−{plain(discAmt)})
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      <Rule />

      <div className="text-[9px] space-y-0.5">
        <TotalRow cols={cols} labelSpan={labelSpan} label="Subtotal" value={plain(sale.subtotal)} />
        {sale.lineDiscountTotal > 0 && (
          <TotalRow
            cols={cols}
            labelSpan={labelSpan}
            label="Line discount"
            value={`− ${plain(sale.lineDiscountTotal)}`}
            tone="danger"
          />
        )}
        {sale.orderDiscountValue > 0 && (
          <TotalRow
            cols={cols}
            labelSpan={labelSpan}
            label="Order discount"
            value={`− ${plain(sale.orderDiscountValue)}`}
            tone="danger"
          />
        )}
        <TotalRow
          cols={cols}
          labelSpan={labelSpan}
          label={`Tax (${settings.taxRate}%)`}
          value={plain(sale.tax)}
        />
      </div>

      <Rule kind="double" />

      <div className={cn(cols, "font-bold text-[12px]")}>
        <span className={labelSpan}>TOTAL</span>
        <span className="text-right num whitespace-nowrap">{formatCurrency(sale.total, currency)}</span>
      </div>

      <Rule kind="double" />

      <div className="text-[9px] space-y-0.5">
        <TotalRow
          cols={cols}
          labelSpan={labelSpan}
          label={isNarrow ? "Paid" : `Paid (${sale.paymentMethod.toUpperCase()})`}
          value={plain(sale.amountPaid)}
        />
        {change > 0 && (
          <TotalRow cols={cols} labelSpan={labelSpan} label="CHANGE" value={plain(change)} />
        )}
        {sale.amountDue > 0 && (
          <div className={cn(cols, "font-bold text-red-700 mt-0.5")}>
            <span className={labelSpan}>BALANCE DUE</span>
            <span className="text-right num whitespace-nowrap">{plain(sale.amountDue)}</span>
          </div>
        )}
      </div>

      {(sale.loyaltyEarned > 0 || sale.loyaltyRedeemed > 0) && (
        <>
          <Rule />
          <div className="text-[9px] space-y-0.5">
            {sale.loyaltyEarned > 0 && (
              <TotalRow
                cols={cols}
                labelSpan={labelSpan}
                label="Points earned"
                value={`+${sale.loyaltyEarned}`}
              />
            )}
            {sale.loyaltyRedeemed > 0 && (
              <TotalRow
                cols={cols}
                labelSpan={labelSpan}
                label="Points redeemed"
                value={`−${sale.loyaltyRedeemed}`}
              />
            )}
          </div>
        </>
      )}

      {payments.length > 1 && (
        <>
          <Rule />
          <div className="text-[8px] uppercase font-bold mb-1">Payment history</div>
          <div className="text-[8px] space-y-0.5">
            {payments.map((p) => (
              <div key={p.id} className="flex justify-between">
                <span>
                  {formatDateByPreference(p.createdAt, settings.dateFormat)} · {p.paymentMethod}
                </span>
                <span className="num whitespace-nowrap">{plain(p.amount)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <Rule kind="double" />

      {settings.receipt.header && (
        <div className="text-center text-[9px] italic mb-1">
          {settings.receipt.header}
        </div>
      )}
      {settings.receipt.footer && (
        <div className="text-center text-[8px] mt-1">{settings.receipt.footer}</div>
      )}

      <div className="text-center text-[7px] font-mono tracking-widest mt-3 letter-spacing-2">
        *{sale.number}*
      </div>
      <div className="text-center text-[7px] text-gray-500 mt-1">
        Powered by PixoBooks
      </div>
    </div>
  );
}

/* --------------------------------- Invoice --------------------------------- */

function InvoiceLayout({
  sale,
  settings,
  payments,
  docLabel,
  extras,
}: {
  sale: Sale;
  settings: Settings;
  payments: SalePayment[];
  docLabel?: string;
  extras?: DocumentExtras;
}) {
  const currency = settings.currency;
  const created = new Date(sale.createdAt);
  const due = sale.dueDate ? new Date(sale.dueDate) : null;

  return (
    <div
      className="bg-white text-gray-900 mx-auto"
      style={{
        width: "100%",
        maxWidth: "210mm",
        padding: "10mm 10mm 6mm",
        fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
        fontSize: "11px",
        lineHeight: 1.5,
      }}
    >
      {/* Letterhead */}
      <div className="flex items-start justify-between border-b-2 border-gray-900 pb-4">
        <div className="flex items-start gap-3">
          {settings.receipt.showLogo && settings.logoUrl && (
            <img
              src={settings.logoUrl}
              alt=""
              className="h-16 w-16 rounded-full object-cover border shrink-0"
              onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
            />
          )}
          <div>
            <div className="text-lg font-bold leading-tight">
              {settings.shopName}
            </div>
            {settings.address && (
              <div className="text-[10px] text-gray-600">{settings.address}</div>
            )}
            {settings.phone && (
              <div className="text-[10px] text-gray-600">Tel: {settings.phone}</div>
            )}
            {settings.email && (
              <div className="text-[10px] text-gray-600 break-all">
                {settings.email}
              </div>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold uppercase tracking-wide text-gray-900">
            {docLabel || "Invoice"}
          </div>
          <div className="text-sm font-mono text-gray-700">{sale.number}</div>
          <div className="text-[10px] mt-2 text-gray-700 space-y-0.5">
            <div>
              <strong>Issued:</strong> {formatDateByPreference(created, settings.dateFormat)}
            </div>
            {due && (
              <div>
                <strong>Due:</strong> {formatDateByPreference(due, settings.dateFormat)}
              </div>
            )}
            {/*
              Payment status badge is intentionally suppressed on documents
              rendered with a custom docLabel (e.g. Proforma Invoice), since
              a proforma is non-binding and has no payment state yet.
              Ordinary invoices continue to show the badge unchanged.
            */}
            {!docLabel && (
              <div className="inline-block mt-1 px-2 py-0.5 rounded-full text-[9px] uppercase tracking-widest font-bold"
                style={{
                  background: sale.amountDue > 0 ? "#fce7f3" : "#dcfce7",
                  color: sale.amountDue > 0 ? "#9d174d" : "#166534",
                }}
              >
                {sale.amountDue > 0 ? "Awaiting payment" : "Paid in full"}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bill To / Prepared By */}
      <div className="grid grid-cols-2 gap-6 mt-4">
        <div>
          <div className="text-[9px] uppercase tracking-widest text-gray-500 mb-1 font-bold">
            Bill To
          </div>
          <div className="font-semibold text-[13px]">
            {sale.customerName || "Walk-in Customer"}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[9px] uppercase tracking-widest text-gray-500 mb-1 font-bold">
            Prepared By
          </div>
          <div className="font-semibold text-[13px]">{sale.cashierName}</div>
        </div>
      </div>

      {/* Items table */}
      <table className="w-full mt-4">
        <thead>
          <tr className="bg-gray-900 text-white uppercase text-[9px] font-bold tracking-wider">
            <th className="p-2 text-left w-8">#</th>
            <th className="p-2 text-left">Description</th>
            <th className="p-2 text-center w-14">Qty</th>
            <th className="p-2 text-right w-24">Unit Price</th>
            <th className="p-2 text-right w-14">Disc.</th>
            <th className="p-2 text-right w-28">Amount</th>
          </tr>
        </thead>
        <tbody>
          {sale.lines.map((l, i) => {
            const gross = l.qty * l.unitPrice;
            const net = gross * (1 - l.discountPct / 100);
            return (
              <tr
                key={i}
                className={cn(
                  "border-b border-gray-200",
                  i % 2 === 1 && "bg-gray-50"
                )}
              >
                <td className="p-2 num text-gray-500">{i + 1}</td>
                <td className="p-2 font-semibold">{l.name}</td>
                <td className="p-2 text-center num">
                  {l.qty}
                  {l.unit ? ` ${l.unit}` : ""}
                </td>
                <td className="p-2 text-right num">
                  {formatCurrency(l.unitPrice, currency)}
                </td>
                <td className="p-2 text-right num">
                  {l.discountPct > 0 ? `${l.discountPct.toFixed(1)}%` : "—"}
                </td>
                <td className="p-2 text-right num font-bold">
                  {formatCurrency(net, currency)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Totals */}
      <div className="flex justify-end mt-4">
        <div className="w-72 text-[11px]">
          <PLRow label="Subtotal" value={formatCurrency(sale.subtotal, currency)} />
          {sale.lineDiscountTotal > 0 && (
            <PLRow
              label="Line discount"
              value={`− ${formatCurrency(sale.lineDiscountTotal, currency)}`}
              negative
            />
          )}
          {sale.orderDiscountValue > 0 && (
            <PLRow
              label="Order discount"
              value={`− ${formatCurrency(sale.orderDiscountValue, currency)}`}
              negative
            />
          )}
          {extras?.totals?.map((row) => (
            <PLRow
              key={row.label}
              label={row.label}
              value={row.value}
              negative={row.negative}
            />
          ))}
          <PLRow
            label={extras?.taxLabel || `Tax (${settings.taxRate}%)`}
            value={formatCurrency(sale.tax, currency)}
          />
          <div className="border-t-2 border-gray-900 mt-1 pt-1 flex justify-between font-bold text-[15px]">
            <span>TOTAL</span>
            <span className="num">{formatCurrency(sale.total, currency)}</span>
          </div>
          {sale.amountPaid > 0 && (
            <PLRow
              label="Amount Paid"
              value={formatCurrency(sale.amountPaid, currency)}
              positive
            />
          )}
          {sale.amountDue > 0 && (
            <div className="border-t border-gray-500 mt-1 pt-1 flex justify-between font-bold text-red-700 text-[13px]">
              <span>BALANCE DUE</span>
              <span className="num">{formatCurrency(sale.amountDue, currency)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Payment history */}
      {payments.length > 0 && (
        <div className="mt-6 border-t pt-3">
          <div className="text-[9px] uppercase tracking-widest text-gray-500 mb-2 font-bold">
            Payment History
          </div>
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-gray-500 text-[9px] uppercase border-b">
                <th className="p-1 text-left">Date</th>
                <th className="p-1 text-left">Method</th>
                <th className="p-1 text-left">Received By</th>
                <th className="p-1 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b border-gray-100">
                  <td className="p-1">
                    {formatDateByPreference(p.createdAt, settings.dateFormat)}
                  </td>
                  <td className="p-1 uppercase">{p.paymentMethod}</td>
                  <td className="p-1">{p.receivedByName || "—"}</td>
                  <td className="p-1 text-right num">
                    {formatCurrency(p.amount, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Extra blocks */}
      {extras?.blocks?.map((block) => (
        <div key={block.title} className="mt-6 border-t pt-3">
          <div className="text-[9px] uppercase tracking-widest text-gray-500 mb-2 font-bold">
            {block.title}
          </div>
          <div
            className={cn(
              "text-[10px] space-y-1",
              block.tone === "strong" ? "text-black" : "text-gray-700"
            )}
          >
            {block.lines.map((line, idx) => (
              <div key={idx}>{line}</div>
            ))}
          </div>
        </div>
      ))}

      {/* Terms */}
      <div className="mt-6 border-t pt-3 text-[10px]">
        <div className="uppercase tracking-widest text-gray-500 mb-1 font-bold text-[9px]">
          Terms & Conditions
        </div>
        <div className="text-gray-700">{settings.invoice.terms}</div>
      </div>

      {/* Signature */}
      <div className="mt-10 grid grid-cols-2 gap-6">
        <div>
          <div className="border-t border-gray-500 pt-1 text-center text-[9px] uppercase text-gray-500">
            Customer Signature
          </div>
        </div>
        <div>
          <div className="border-t border-gray-500 pt-1 text-center text-[9px] uppercase text-gray-500">
            Authorized Signature
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-[9px] text-gray-500 mt-6 border-t pt-2">
        {settings.receipt.footer || "Thank you for your business."} — Powered by PixoBooks
      </div>
    </div>
  );
}

/* -------------------------------- Helpers -------------------------------- */

function Rule({ kind = "dashed" }: { kind?: "dashed" | "double" }) {
  return (
    <div
      className="my-2 leading-none tracking-tighter text-gray-800 overflow-hidden whitespace-nowrap text-center"
      aria-hidden
    >
      {kind === "double" ? "================================" : "--------------------------------"}
    </div>
  );
}

function RowLabel({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-600 shrink-0">{label}:</span>
      <span className={cn("text-gray-900 text-right break-words min-w-0", bold && "font-bold")}>
        {value}
      </span>
    </div>
  );
}

function TotalRow({
  label,
  value,
  tone,
  cols,
  labelSpan,
}: {
  label: string;
  value: string;
  tone?: "danger";
  /** Shared column template so the amount lands under the TOTAL header. */
  cols?: string;
  labelSpan?: string;
}) {
  return (
    <div className={cn(cols ?? "flex justify-between", tone === "danger" && "text-red-700")}>
      <span className={labelSpan}>{label}</span>
      <span className="text-right num whitespace-nowrap">{value}</span>
    </div>
  );
}

function PLRow({
  label,
  value,
  negative,
  positive,
}: {
  label: string;
  value: string;
  negative?: boolean;
  positive?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex justify-between py-0.5",
        negative && "text-red-600",
        positive && "text-green-700"
      )}
    >
      <span>{label}</span>
      <span className="num">{value}</span>
    </div>
  );
}