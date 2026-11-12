import type { ReceiptWidthMm } from "@/types";
import GlassSelect from "@/components/ui/GlassSelect";
import { receiptFooterHint, receiptHeaderHint } from "@/lib/businessClues";
import { cn } from "@/lib/utils";
import { CheckboxRow, Section, SField } from "../fields";
import { useSettings } from "../settingsContext";

export default function DocsSection() {
  const { form, setForm, canReceipt, canInvoice } = useSettings();

  return (
    <>
          {(canReceipt || canInvoice) && (
            <Section
              id="docs"
              title="4. Receipt & Invoice Documents"
              desc="Thermal POS receipts, serial invoice prefixing, and standard payment terms"
              required
            >
              {canReceipt && (
                <div className="grid-2">
                  <SField label="Receipt Header Greeting" htmlFor="set-receipt-header">
                    <input
                      id="set-receipt-header"
                      className="input"
                      value={form.receipt.header}
                      placeholder={receiptHeaderHint(form.businessType)}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          receipt: { ...form.receipt, header: e.target.value },
                        })
                      }
                    />
                  </SField>
                  <SField label="Receipt Footer Message" htmlFor="set-receipt-footer">
                    <input
                      id="set-receipt-footer"
                      className="input"
                      value={form.receipt.footer}
                      placeholder={receiptFooterHint(form.businessType)}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          receipt: { ...form.receipt, footer: e.target.value },
                        })
                      }
                    />
                  </SField>
                </div>
              )}

              <div
                className={cn(
                  canReceipt && canInvoice ? "grid-3" : "grid-2",
                  "pair-mobile",
                )}
                style={{ marginTop: 14 }}
              >
                {canReceipt && (
                  <SField label="Thermal Width" htmlFor="set-receipt-width">
                    <GlassSelect
                      id="set-receipt-width"
                      value={String(form.receipt.paperWidthMm)}
                      onChange={(v) =>
                        setForm({
                          ...form,
                          receipt: {
                            ...form.receipt,
                            paperWidthMm: Number(v) as ReceiptWidthMm,
                          },
                        })
                      }
                      ariaLabel="Thermal width"
                      options={[
                        { value: "58", label: "58 mm (Compact Mobile)" },
                        { value: "80", label: "80 mm (Standard POS Desk)" },
                        { value: "99", label: "99 mm (Full Slip)" },
                      ]}
                      className="input select-glass"
                    />
                  </SField>
                )}
                {canInvoice && (
                  <SField label="Invoice Prefix" htmlFor="set-invoice-prefix" req>
                    <input
                      id="set-invoice-prefix"
                      className="input num"
                      value={form.invoice.prefix}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          invoice: { ...form.invoice, prefix: e.target.value },
                        })
                      }
                    />
                  </SField>
                )}
              </div>

              {canInvoice && (
                <div style={{ marginTop: 14 }}>
                  <SField label="Commercial Payment Terms & Conditions" htmlFor="set-invoice-terms">
                    <textarea
                      id="set-invoice-terms"
                      className="input"
                      style={{ minHeight: 96 }}
                      value={form.invoice.terms}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          invoice: { ...form.invoice, terms: e.target.value },
                        })
                      }
                    />
                  </SField>
                </div>
              )}

              {canReceipt && (
                <div className="checkbox-group">
                  <CheckboxRow
                    checked={form.receipt.showLogo}
                    onChange={(v) =>
                      setForm({ ...form, receipt: { ...form.receipt, showLogo: v } })
                    }
                    label="Business Logo on Top of Receipt"
                  />
                </div>
              )}
            </Section>
          )}
    </>
  );
}
