import PhoneInput from "@/components/common/PhoneInput";
import GlassSelect from "@/components/ui/GlassSelect";
import { CURRENCIES, GROUPING_SYSTEMS, SEPARATOR_PRESETS } from "@/lib/referenceData";
import { DEFAULT_TXN_ALLOWANCE_POLICY } from "@/types";
import { safeNum } from "../constants";
import { CheckboxRow, Section, SField } from "../fields";
import { useSettings } from "../settingsContext";

export default function MoneySection() {
  const { form, setForm, errors, canShop, canTaxes, moneyExample } = useSettings();
  const policy = form.transactionAllowancePolicy ?? DEFAULT_TXN_ALLOWANCE_POLICY;
  const setPolicy = (patch: Partial<typeof policy>) =>
    setForm({ ...form, transactionAllowancePolicy: { ...policy, ...patch } });

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
                  <GlassSelect
                    id="set-currency"
                    value={form.currency}
                    onChange={(v) => setForm({ ...form, currency: v })}
                    ariaLabel="Base operating currency"
                    options={CURRENCIES.map((c) => ({
                      value: c.code,
                      label: `${c.symbol} - ${c.code} · ${c.name}`,
                    }))}
                    className="input select-glass"
                  />
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
                  <GlassSelect
                    id="set-decimals"
                    value={String(form.decimalPlaces)}
                    onChange={(v) => setForm({ ...form, decimalPlaces: Number(v) })}
                    ariaLabel="Decimal precision"
                    options={[0, 1, 2, 3, 4].map((n) => ({
                      value: String(n),
                      label: `${n}${n === 0 ? " (Integer round)" : n === 2 ? " (Standard)" : ""}`,
                    }))}
                    className="input select-glass"
                  />
                </SField>
              </div>

              <div className="grid-3" style={{ marginTop: 14 }}>
                <SField label="Digit Grouping Standard" htmlFor="set-grouping">
                  <GlassSelect
                    id="set-grouping"
                    value={form.digitGrouping}
                    onChange={(v) =>
                      setForm({ ...form, digitGrouping: v as "western" | "indian" })
                    }
                    ariaLabel="Digit grouping standard"
                    options={GROUPING_SYSTEMS.map((g) => ({ value: g.id, label: g.label }))}
                    className="input select-glass"
                  />
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
                  <GlassSelect
                    id="set-separator-preset"
                    value=""
                    onChange={(v) => {
                      const p = SEPARATOR_PRESETS.find((s) => s.id === v);
                      if (p) {
                        setForm({
                          ...form,
                          thousandSeparator: p.thousand,
                          decimalSeparator: p.decimal,
                        });
                      }
                    }}
                    ariaLabel="Separator preset"
                    options={[
                      { value: "", label: "Apply a preset…" },
                      ...SEPARATOR_PRESETS.map((s) => ({ value: s.id, label: s.label })),
                    ]}
                    className="input select-glass"
                  />
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

              <div style={{ marginTop: 18 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "var(--ink-muted)",
                    marginBottom: 4,
                  }}
                >
                  Transaction Allowance Policy
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-secondary)", marginBottom: 10 }}>
                  When an employee enters the target number of transactions in a
                  day, week or month, their allowance is auto-considered — either
                  posted straight to Staff Allowance or held for approval.
                </div>
                <CheckboxRow
                  checked={policy.enabled}
                  onChange={(v) => setPolicy({ enabled: v })}
                  label="Enable transaction-based allowance"
                />
                <div className="grid-3" style={{ marginTop: 10 }}>
                  <SField
                    label="Transactions Required"
                    htmlFor="set-txn-threshold"
                    hint="Sales entered in one period that trigger the allowance."
                  >
                    <input
                      id="set-txn-threshold"
                      type="number"
                      min={1}
                      step={1}
                      className="input num"
                      style={{ textAlign: "right" }}
                      value={policy.threshold}
                      onChange={(e) =>
                        setPolicy({ threshold: Math.max(1, Math.trunc(safeNum(e.target.value, 1))) })
                      }
                    />
                  </SField>
                  <SField label="Period" htmlFor="set-txn-period">
                    <GlassSelect
                      id="set-txn-period"
                      value={policy.period}
                      onChange={(v) =>
                        setPolicy({ period: v as "daily" | "weekly" | "monthly" })
                      }
                      ariaLabel="Allowance period"
                      options={[
                        { value: "daily", label: "Daily" },
                        { value: "weekly", label: "Weekly (Mon–Sun)" },
                        { value: "monthly", label: "Monthly" },
                      ]}
                      className="input select-glass"
                    />
                  </SField>
                  <SField label="Allowance Name" htmlFor="set-txn-name">
                    <input
                      id="set-txn-name"
                      className="input"
                      value={policy.allowanceName}
                      onChange={(e) => setPolicy({ allowanceName: e.target.value })}
                      placeholder="Transaction bonus"
                      maxLength={60}
                    />
                  </SField>
                </div>
                <div className="grid-3" style={{ marginTop: 14 }}>
                  <SField label="Amount" htmlFor="set-txn-amount">
                    <input
                      id="set-txn-amount"
                      type="number"
                      min={0}
                      step="0.01"
                      className="input num"
                      style={{ textAlign: "right" }}
                      value={policy.amount}
                      onChange={(e) => setPolicy({ amount: Math.max(0, safeNum(e.target.value, 0)) })}
                    />
                  </SField>
                  <SField label="Amount Type" htmlFor="set-txn-amount-type">
                    <GlassSelect
                      id="set-txn-amount-type"
                      value={policy.amountType}
                      onChange={(v) =>
                        setPolicy({ amountType: v as "fixed" | "percentage" })
                      }
                      ariaLabel="Allowance amount type"
                      options={[
                        { value: "fixed", label: `Fixed (${form.currency})` },
                        { value: "percentage", label: "% of base salary" },
                      ]}
                      className="input select-glass"
                    />
                  </SField>
                  <SField label="Approver" htmlFor="set-txn-approver">
                    <GlassSelect
                      id="set-txn-approver"
                      value={policy.approverRole}
                      onChange={(v) =>
                        setPolicy({ approverRole: v as "manager" | "accountant" })
                      }
                      ariaLabel="Allowance approver"
                      options={[
                        { value: "manager", label: "Manager" },
                        { value: "accountant", label: "Accounting party" },
                      ]}
                      className="input select-glass"
                    />
                  </SField>
                </div>
                <div style={{ marginTop: 10 }}>
                  <CheckboxRow
                    checked={policy.requireApproval}
                    onChange={(v) => setPolicy({ requireApproval: v })}
                    label="Require approval — hold the award for a manager/accountant instead of posting it automatically"
                  />
                </div>
              </div>
            </Section>
          )}
    </>
  );
}
