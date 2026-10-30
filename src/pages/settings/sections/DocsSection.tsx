import type { ReceiptWidthMm } from "@/types";
import { safeNum } from "../constants";
import { CheckboxRow, Section, SField } from "../fields";
import { useSettings } from "../settingsContext";

export default function DocsSection() {
  const { form, setForm, errors, canReceipt, canInvoice } = useSettings();

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
                className={canReceipt && canInvoice ? "grid-3" : "grid-2"}
                style={{ marginTop: 14 }}
              >
                {canReceipt && (
                  <SField label="Thermal Width" htmlFor="set-receipt-width">
                    <select
                      id="set-receipt-width"
                      className="input"
                      value={form.receipt.paperWidthMm}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          receipt: {
                            ...form.receipt,
                            paperWidthMm: Number(e.target.value) as ReceiptWidthMm,
                          },
                        })
                      }
                    >
                      <option value={58}>58 mm (Compact Mobile)</option>
                      <option value={80}>80 mm (Standard POS Desk)</option>
                      <option value={99}>99 mm (Full Slip)</option>
                    </select>
                  </SField>
                )}
                {canInvoice && (
                  <>
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
                    <SField label="Next Serial Sequence" htmlFor="set-invoice-next" error={errors.nextNumber}>
                      <input
                        id="set-invoice-next"
                        type="number"
                        min={1}
                        step={1}
                        className="input num"
                        style={{ textAlign: "right" }}
                        value={form.invoice.nextNumber}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            invoice: {
                              ...form.invoice,
                              nextNumber: Math.max(1, Math.round(safeNum(e.target.value, 1))),
                            },
                          })
                        }
                      />
                    </SField>
                  </>
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
                    label="Print Shop Logo on Top of Receipt"
                  />
                </div>
              )}
            </Section>
          )}
    </>
  );
}
