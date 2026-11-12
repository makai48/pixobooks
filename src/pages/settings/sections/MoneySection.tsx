import PhoneInput from "@/components/common/PhoneInput";
import GlassSelect from "@/components/ui/GlassSelect";
import AmountInput from "@/components/ui/AmountInput";
import {
  CURRENCIES,
  DATE_FORMAT_OPTIONS,
  GROUPING_SYSTEMS,
  SEPARATOR_PRESETS,
} from "@/lib/referenceData";
import { DEFAULT_TXN_ALLOWANCE_POLICY } from "@/types";
import type { DateFormat } from "@/types";
import { formatDateByPreference } from "@/lib/dateFormat";
import { useIsCompact } from "@/hooks/useMediaQuery";
import { safeNum } from "../constants";
import { CheckboxRow, Section, SField } from "../fields";
import { useSettings } from "../settingsContext";

/** A fixed sample so the preview shows the shape, not today's date. */
const PREVIEW_DATE = new Date(2026, 11, 31);

/** "1,234,567.89 (US / UK)" → "1,234,567.89" — the chip never carries the
 *  bracketed detail; the open list still shows it. */
function stripBrackets(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

export default function MoneySection() {
  const { form, setForm, errors, canShop, canTaxes, moneyExample } = useSettings();
  const compact = useIsCompact();
  const policy = form.transactionAllowancePolicy ?? DEFAULT_TXN_ALLOWANCE_POLICY;
  const setPolicy = (patch: Partial<typeof policy>) =>
    setForm({ ...form, transactionAllowancePolicy: { ...policy, ...patch } });

  const dateExample = formatDateByPreference(PREVIEW_DATE, form.dateFormat);

  // The preset that matches the separators currently in force.
  const activePreset = SEPARATOR_PRESETS.find(
    (p) =>
      p.thousand === form.thousandSeparator &&
      p.decimal === form.decimalSeparator,
  );

  return (
    <>
          {(canShop || canTaxes) && (
            <Section
              id="money"
              title="2. Money & Number Format"
              desc="Currency, decimal precision, tax computation, separators and date format for the whole workspace"
              required
            >
              <div className="money-grid">
                <SField
                  label="Base Operating Currency"
                  htmlFor="set-currency"
                  req
                  className="money-wide m-currency"
                >
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

                <SField
                  label="Default VAT / Tax Rate (%)"
                  htmlFor="set-tax"
                  error={errors.taxRate}
                  className="m-tax"
                >
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

                <SField
                  label="Decimal Precision"
                  htmlFor="set-decimals"
                  className="m-decimals"
                >
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

                <SField
                  label="Thousand Separator"
                  htmlFor="set-thousand"
                  error={errors.separators}
                  className="m-thousand"
                >
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

                <SField
                  label="Decimal Point Mark"
                  htmlFor="set-decimal"
                  className="m-decimalpoint"
                >
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

                <SField
                  label="Digit Grouping Standard"
                  htmlFor="set-grouping"
                  className="m-grouping"
                >
                  <GlassSelect
                    id="set-grouping"
                    value={form.digitGrouping}
                    // The chip shows the digits it produces; the open list
                    // keeps the type name beside them.
                    selectedLabel={
                      GROUPING_SYSTEMS.find((g) => g.id === form.digitGrouping)
                        ?.example ?? form.digitGrouping
                    }
                    onChange={(v) =>
                      setForm({ ...form, digitGrouping: v as "western" | "indian" })
                    }
                    ariaLabel="Digit grouping standard"
                    options={GROUPING_SYSTEMS.map((g) => ({ value: g.id, label: g.label }))}
                    className="input select-glass"
                  />
                </SField>

                <SField
                  label="Separator Preset"
                  htmlFor="set-separator-preset"
                  className="m-preset"
                >
                  <GlassSelect
                    id="set-separator-preset"
                    value={activePreset?.id ?? ""}
                    // The chip shows the preset in force — never the "apply a
                    // preset" placeholder — and on a phone it drops the
                    // country so the chip fits. The list keeps the full label.
                    selectedLabel={
                      compact
                        ? stripBrackets(activePreset?.label ?? "Custom separators")
                        : activePreset?.label ?? "Custom separators"
                    }
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

                <SField
                  label="Date Format"
                  htmlFor="set-date-format"
                  className="money-wide m-dateformat"
                >
                  <GlassSelect
                    id="set-date-format"
                    value={form.dateFormat}
                    onChange={(v) => setForm({ ...form, dateFormat: v as DateFormat })}
                    ariaLabel="Date format"
                    options={DATE_FORMAT_OPTIONS.map((option) => ({
                      value: option.value,
                      label: option.label,
                    }))}
                    className="input select-glass"
                  />
                  <div className="field-hint">
                    Used for report, transaction and document dates across the
                    whole app.
                  </div>
                </SField>

                <SField
                  label="Legacy Till Line (printed on receipts)"
                  htmlFor="set-phone"
                  className="money-wide m-till"
                >
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

              <div className="format-preview">
                <div className="format-preview-copy">
                  <div className="format-preview-label">Format Preview</div>
                  <div className="format-preview-sub">
                    The applied number and date format — this is exactly what
                    the ledger, the POS ticket and every report print.
                  </div>
                </div>
                <div className="format-preview-figures">
                  <div className="format-preview-value num">{moneyExample}</div>
                  <div className="format-preview-date">
                    <span className="format-preview-date-label">
                      Date format
                    </span>
                    <span className="num">{dateExample}</span>
                  </div>
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
                <div className="allow-grid">
                  <SField
                    label="Transactions Required"
                    htmlFor="set-txn-threshold"
                    hint="Sales entered in one period that trigger the allowance."
                    className="al-threshold"
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
                  <SField label="Period" htmlFor="set-txn-period" className="al-period">
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
                  <SField label="Allowance Name" htmlFor="set-txn-name" className="al-name">
                    <input
                      id="set-txn-name"
                      className="input"
                      value={policy.allowanceName}
                      onChange={(e) =>
                        setPolicy({ allowanceName: e.target.value })
                      }
                      placeholder="Transaction bonus"
                      maxLength={60}
                    />
                  </SField>
                  <SField
                    label="Amount"
                    htmlFor="set-txn-amount"
                    className="al-amount flat-field"
                  >
                    <AmountInput
                      id="set-txn-amount"
                      className="input num"
                      value={policy.amount}
                      onChange={(v) => setPolicy({ amount: Math.max(0, v) })}
                      min={0}
                      step={0.01}
                      ariaLabel="Allowance amount"
                    />
                  </SField>
                  <SField
                    label="Amount Type"
                    htmlFor="set-txn-amount-type"
                    className="al-type"
                  >
                    <GlassSelect
                      id="set-txn-amount-type"
                      value={policy.amountType}
                      // On a phone the chip shows the type only — "Fixed",
                      // not "Fixed (UGX)". The list keeps the currency.
                      selectedLabel={
                        compact
                          ? stripBrackets(
                              policy.amountType === "fixed"
                                ? `Fixed (${form.currency})`
                                : "% of base salary",
                            )
                          : undefined
                      }
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
                  <SField label="Approver" htmlFor="set-txn-approver" className="al-approver">
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
