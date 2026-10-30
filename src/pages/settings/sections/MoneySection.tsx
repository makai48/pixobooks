import PhoneInput from "@/components/common/PhoneInput";
import { CURRENCIES, GROUPING_SYSTEMS, SEPARATOR_PRESETS } from "@/lib/referenceData";
import { safeNum } from "../constants";
import { Section, SField } from "../fields";
import { useSettings } from "../settingsContext";

export default function MoneySection() {
  const { form, setForm, errors, canShop, canTaxes, moneyExample } = useSettings();

  return (
    <>
          {(canShop || canTaxes) && (
            <Section
              id="money"
              title="2. Money & Number Format"
              desc="Currency, decimal precision, tax computation and currency formatting"
              required
            >
              <div className="grid-3">
                <SField label="Base Operating Currency" htmlFor="set-currency" req>
                  <select
                    id="set-currency"
                    className="input"
                    value={form.currency}
                    onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.symbol} — {c.code} · {c.name}
                      </option>
                    ))}
                  </select>
                </SField>
                <SField label="Default VAT / Tax Rate (%)" htmlFor="set-tax" error={errors.taxRate}>
                  <input
                    id="set-tax"
                    type="number"
                    step="0.1"
                    min={0}
                    max={100}
                    className="input num"
                    style={{ textAlign: "right" }}
                    value={form.taxRate}
                    onChange={(e) => setForm({ ...form, taxRate: safeNum(e.target.value, 0) })}
                    disabled={!canTaxes}
                  />
                </SField>
                <SField label="Decimal Precision" htmlFor="set-decimals">
                  <select
                    id="set-decimals"
                    className="input"
                    value={form.decimalPlaces}
                    onChange={(e) => setForm({ ...form, decimalPlaces: Number(e.target.value) })}
                  >
                    {[0, 1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>
                        {n}{n === 0 ? " (Integer round)" : n === 2 ? " (Standard)" : ""}
                      </option>
                    ))}
                  </select>
                </SField>
              </div>

              <div className="grid-3" style={{ marginTop: 14 }}>
                <SField label="Digit Grouping Standard" htmlFor="set-grouping">
                  <select
                    id="set-grouping"
                    className="input"
                    value={form.digitGrouping}
                    onChange={(e) =>
                      setForm({ ...form, digitGrouping: e.target.value as "western" | "indian" })
                    }
                  >
                    {GROUPING_SYSTEMS.map((g) => (
                      <option key={g.id} value={g.id}>{g.label}</option>
                    ))}
                  </select>
                </SField>
                <SField label="Thousand Separator" htmlFor="set-thousand" error={errors.separators}>
                  <input
                    id="set-thousand"
                    className="input num"
                    style={{ textAlign: "center" }}
                    maxLength={1}
                    value={form.thousandSeparator}
                    onChange={(e) =>
                      setForm({ ...form, thousandSeparator: e.target.value.slice(0, 1) })
                    }
                  />
                </SField>
                <SField label="Decimal Point Mark" htmlFor="set-decimal">
                  <input
                    id="set-decimal"
                    className="input num"
                    style={{ textAlign: "center" }}
                    maxLength={1}
                    value={form.decimalSeparator}
                    onChange={(e) =>
                      setForm({ ...form, decimalSeparator: e.target.value.slice(0, 1) })
                    }
                  />
                </SField>
              </div>

              <div className="grid-2" style={{ marginTop: 14 }}>
                <SField label="Separator Preset" htmlFor="set-separator-preset">
                  <select
                    id="set-separator-preset"
                    className="input"
                    value=""
                    onChange={(e) => {
                      const p = SEPARATOR_PRESETS.find((s) => s.id === e.target.value);
                      if (p) {
                        setForm({
                          ...form,
                          thousandSeparator: p.thousand,
                          decimalSeparator: p.decimal,
                        });
                      }
                    }}
                  >
                    <option value="" disabled>Apply a preset…</option>
                    {SEPARATOR_PRESETS.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </SField>
                <SField label="Legacy Till Line (printed on receipts)" htmlFor="set-phone">
                  <PhoneInput
                    id="set-phone"
                    ariaLabel="Legacy Till Line"
                    inputClassName="num"
                    value={form.phone}
                    onChange={(phone) => setForm({ ...form, phone })}
                    placeholder="414 555 012"
                  />
                </SField>
              </div>

              <div
                style={{
                  marginTop: 14,
                  padding: "12px 18px",
                  borderRadius: 10,
                  background: "var(--bg-subtle)",
                  border: "1px solid var(--border-light)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "var(--ink-muted)",
                    }}
                  >
                    Format Preview
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink-secondary)" }}>
                    Real-time ledger and POS price ticket demonstration
                  </div>
                </div>
                <div className="num" style={{ fontSize: 20, fontWeight: 700, color: "var(--apple-blue)" }}>
                  {moneyExample}
                </div>
              </div>
            </Section>
          )}
    </>
  );
}
