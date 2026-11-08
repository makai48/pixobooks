import { Image as ImageIcon } from "lucide-react";
import CountrySelect from "@/components/common/CountrySelect";
import PhoneInput from "@/components/common/PhoneInput";
import GlassSelect from "@/components/ui/GlassSelect";
import { BUSINESS_TYPES, COUNTRIES, TIMEZONES, TIMEZONE_OPTIONS } from "@/lib/referenceData";
import { DEFAULT_WEEK_START, WEEK_START_OPTIONS } from "@/lib/week";
import {
  addressHint,
  businessNameHint,
  emailHint,
} from "@/lib/businessClues";
import type { WeekStart } from "@/types";
import { Section, SField } from "../fields";
import { useSettings } from "../settingsContext";

export default function BusinessSection() {
  const { form, setForm, errors, canShop, countryIso2, uploading, handleLogoFile, logoError, setLogoError } = useSettings();

  return (
    <>
          {canShop && (
            <Section
              id="business"
              title="1. Business Profile"
              desc="Commercial identity, legal name, and contacts displayed on receipts and invoices"
              required
            >
              <div className="grid-2">
                <SField label="Shop Legal Name" htmlFor="set-shop-name" req error={errors.shopName}>
                  <input
                    id="set-shop-name"
                    className="input"
                    value={form.shopName}
                    onChange={(e) => setForm({ ...form, shopName: e.target.value })}
                    placeholder={businessNameHint(form.businessType)}
                  />
                </SField>
                <SField label="Commercial Category" htmlFor="set-business-type" req>
                  <GlassSelect
                    id="set-business-type"
                    value={form.businessType}
                    onChange={(v) => setForm({ ...form, businessType: v })}
                    ariaLabel="Commercial category"
                    options={[
                      { value: "", label: "- Select -" },
                      ...(form.businessType && !BUSINESS_TYPES.includes(form.businessType)
                        ? [{ value: form.businessType, label: form.businessType }]
                        : []),
                      ...BUSINESS_TYPES.map((t) => ({ value: t, label: t })),
                    ]}
                    className="input select-glass"
                  />
                </SField>
              </div>

              <div className="grid-3" style={{ marginTop: 14 }}>
                <SField label="Primary Country" htmlFor="set-country">
                  <CountrySelect
                    id="set-country"
                    ariaLabel="Primary Country"
                    valueIso2={countryIso2}
                    fallbackLabel={form.country && !countryIso2 ? form.country : undefined}
                    onChange={(iso2) =>
                      setForm({
                        ...form,
                        country: COUNTRIES.find((c) => c.iso2 === iso2)?.name || "",
                      })
                    }
                  />
                </SField>
                <SField label="Operating Time Zone" htmlFor="set-timezone">
                  <GlassSelect
                    id="set-timezone"
                    value={form.timezone}
                    onChange={(v) => setForm({ ...form, timezone: v })}
                    ariaLabel="Operating time zone"
                    options={[
                      ...(!TIMEZONES.includes(form.timezone)
                        ? [{ value: form.timezone, label: form.timezone }]
                        : []),
                      ...TIMEZONE_OPTIONS,
                    ]}
                    className="input select-glass"
                  />
                </SField>
                <SField label="Week Starts On" htmlFor="set-week-start">
                  <GlassSelect
                    id="set-week-start"
                    value={form.weekStart ?? DEFAULT_WEEK_START}
                    onChange={(v) => setForm({ ...form, weekStart: v as WeekStart })}
                    ariaLabel="Week starts on"
                    options={WEEK_START_OPTIONS}
                    className="input select-glass"
                  />
                  <div className="field-hint" style={{ marginTop: 4 }}>
                    Drives This Week and Last Week in reports. Defaults to Monday.
                  </div>
                </SField>
              </div>

              <div className="grid-2" style={{ marginTop: 14 }}>
                <SField label="Support Email" htmlFor="set-email" req>
                  <input
                    id="set-email"
                    type="email"
                    className="input"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder={emailHint(form.shopName)}
                  />
                </SField>
                <SField label="Physical Shop Address" htmlFor="set-address">
                  <input
                    id="set-address"
                    className="input"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder={addressHint(form.businessType, form.country)}
                  />
                </SField>
              </div>

              <div className="grid-3" style={{ marginTop: 14 }}>
                <SField label="Primary Mobile" htmlFor="set-mobile">
                  <PhoneInput
                    id="set-mobile"
                    ariaLabel="Primary Mobile"
                    inputClassName="num"
                    value={form.mobile}
                    onChange={(mobile) => setForm({ ...form, mobile })}
                    placeholder="712 345 678"
                  />
                </SField>
                <SField label="Office Telephone" htmlFor="set-office">
                  <PhoneInput
                    id="set-office"
                    ariaLabel="Office Telephone"
                    inputClassName="num"
                    value={form.officePhone}
                    onChange={(officePhone) => setForm({ ...form, officePhone })}
                    placeholder="414 555 012"
                  />
                </SField>
                <SField label="Official WhatsApp" htmlFor="set-whatsapp">
                  <PhoneInput
                    id="set-whatsapp"
                    ariaLabel="Official WhatsApp"
                    inputClassName="num"
                    value={form.whatsapp}
                    onChange={(whatsapp) => setForm({ ...form, whatsapp })}
                    placeholder="712 345 678"
                  />
                </SField>
              </div>

              <div className="teal-banner-box">
                <div className="teal-header">
                  <div className="teal-badge-icon">◈</div>
                  <div>
                    <div className="teal-title">Brand Identity &amp; POS Emblems</div>
                    <div className="teal-sub">
                      Logos appear on 80mm thermal receipts, customer invoices, and the top navigation switcher.
                    </div>
                  </div>
                </div>
                <div className="logo-upload-cluster">
                  <label className="logo-avatar-thumb" title="Click to browse image">
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleLogoFile(f);
                        e.target.value = "";
                      }}
                    />
                    {form.logoUrl && !logoError ? (
                      <img
                        src={form.logoUrl}
                        alt="Shop logo"
                        onError={() => setLogoError(true)}
                      />
                    ) : (
                      <span style={{ textAlign: "center", fontSize: 11, fontWeight: 600, lineHeight: 1.2 }}>
                        <ImageIcon className="icon" style={{ width: 20, height: 20, marginBottom: 2 }} />
                        <br />
                        {uploading ? "Uploading…" : "Browse"}
                      </span>
                    )}
                  </label>
                  <div className="logo-meta">
                    <SField label="Image URL / Asset Identifier" htmlFor="set-logo-url">
                      <input
                        id="set-logo-url"
                        className="input"
                        value={form.logoUrl || ""}
                        onChange={(e) => {
                          setForm({ ...form, logoUrl: e.target.value });
                          setLogoError(false);
                        }}
                        placeholder="https://cdn.pixobooks.com/logo.png or data:image/..."
                      />
                    </SField>
                    <div className="logo-remove-row">
                      <div className="field-hint" style={{ marginTop: 0 }}>
                        Tap the circular frame to upload a file directly. Recommends 512×512px square PNG.
                      </div>
                      {form.logoUrl && (
                        <button
                          type="button"
                          className="btn btn-ghost-danger btn-sm"
                          onClick={() => setForm({ ...form, logoUrl: "" })}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {(form.termsVersion || form.privacyVersion) && (
                <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {form.termsVersion && (
                    <span className="badge-hq">Terms v{form.termsVersion} accepted</span>
                  )}
                  {form.privacyVersion && (
                    <span className="badge-hq">Privacy v{form.privacyVersion} accepted</span>
                  )}
                </div>
              )}
            </Section>
          )}
    </>
  );
}
