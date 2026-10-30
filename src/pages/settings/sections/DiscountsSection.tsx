import { Coins, Percent } from "lucide-react";
import { cn } from "@/lib/utils";
import { safeNum } from "../constants";
import { CheckboxRow, Section, SField } from "../fields";
import { useSettings } from "../settingsContext";

export default function DiscountsSection() {
  const { form, setForm, errors, canLoyalty, canDiscount, currencySymbol } = useSettings();

  return (
    <>
          {(canDiscount || canLoyalty) && (
            <Section
              id="discounts"
              title="6. Discounts & Customer Loyalty"
              desc="Cashier discount caps, percentage ceilings, and customer reward point ratios"
            >
              {canDiscount && (
                <>
                  <div>
                    <label className="field-label" style={{ marginBottom: 8 }}>
                      Discount Input Style
                    </label>
                    <div className="opt-cards-grid" style={{ maxWidth: 420 }}>
                      {(
                        [
                          { k: "percentage", label: "Percentage (%)", icon: Percent },
                          { k: "amount", label: `Amount (${currencySymbol})`, icon: Coins },
                        ] as const
                      ).map(({ k, label, icon: Icon }) => (
                        <button
                          key={k}
                          type="button"
                          className={cn("opt-card", form.discount.type === k && "selected")}
                          onClick={() =>
                            setForm({
                              ...form,
                              discount: { ...form.discount, type: k },
                            })
                          }
                        >
                          <span className="opt-title"><Icon className="icon" /> {label}</span>
                          <span className="opt-sub">
                            {k === "percentage" ? "Percent off the line or order" : "Fixed money value off"}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid-2" style={{ marginTop: 14 }}>
                    <SField label="Maximum Cashier Discount (%)" htmlFor="set-max-pct" error={errors.maxPct}>
                      <input
                        id="set-max-pct"
                        type="number"
                        min={0}
                        max={100}
                        className="input num"
                        style={{ textAlign: "right" }}
                        value={form.discount.maxPct}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            discount: { ...form.discount, maxPct: safeNum(e.target.value, 0) },
                          })
                        }
                      />
                    </SField>
                    <SField
                      label={`Absolute Order Amount Cap (${currencySymbol})`}
                      htmlFor="set-max-amount"
                      error={errors.maxAmount}
                    >
                      <input
                        id="set-max-amount"
                        type="number"
                        min={0}
                        step="0.01"
                        className="input num"
                        style={{ textAlign: "right" }}
                        value={form.discount.maxAmount}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            discount: { ...form.discount, maxAmount: safeNum(e.target.value, 0) },
                          })
                        }
                      />
                    </SField>
                  </div>

                  <div className="checkbox-group">
                    <CheckboxRow
                      checked={form.discount.allowLine}
                      onChange={(v) =>
                        setForm({ ...form, discount: { ...form.discount, allowLine: v } })
                      }
                      label="Allow per-line discounts"
                    />
                    <CheckboxRow
                      checked={form.discount.allowOrder}
                      onChange={(v) =>
                        setForm({ ...form, discount: { ...form.discount, allowOrder: v } })
                      }
                      label="Allow whole-order discounts"
                    />
                  </div>
                </>
              )}

              {canLoyalty && (
                <div className="teal-banner-box" style={{ marginTop: canDiscount ? 16 : 14 }}>
                  <div className="teal-header">
                    <div className="teal-badge-icon">★</div>
                    <div>
                      <div className="teal-title">Loyalty Points Program</div>
                      <div className="teal-sub">
                        Customers accumulate points for repeat purchases redeemable at checkout.
                      </div>
                    </div>
                  </div>
                  <CheckboxRow
                    checked={form.loyalty.enabled}
                    onChange={(v) =>
                      setForm({ ...form, loyalty: { ...form.loyalty, enabled: v } })
                    }
                    label="Enable loyalty points"
                  />
                  <div className="grid-2">
                    <SField
                      label={`Points Earned per ${currencySymbol}1 Spent`}
                      htmlFor="set-points-earned"
                    >
                      <input
                        id="set-points-earned"
                        type="number"
                        step="0.1"
                        min={0}
                        className="input num"
                        style={{ textAlign: "right" }}
                        value={form.loyalty.pointsPerDollar}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            loyalty: { ...form.loyalty, pointsPerDollar: safeNum(e.target.value, 0) },
                          })
                        }
                        disabled={!form.loyalty.enabled}
                      />
                    </SField>
                    <SField
                      label={`Redemption Cash Value per Point (${currencySymbol})`}
                      htmlFor="set-points-value"
                    >
                      <input
                        id="set-points-value"
                        type="number"
                        step="0.0001"
                        min={0}
                        className="input num"
                        style={{ textAlign: "right" }}
                        value={form.loyalty.dollarPerPoint}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            loyalty: { ...form.loyalty, dollarPerPoint: safeNum(e.target.value, 0) },
                          })
                        }
                        disabled={!form.loyalty.enabled}
                      />
                    </SField>
                  </div>
                </div>
              )}
            </Section>
          )}
    </>
  );
}
