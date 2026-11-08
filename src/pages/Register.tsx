import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  ChevronDown,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { authService } from "@/lib/auth";
import { useAppAdminStatus } from "@/hooks/useAuth";
import { TERMS_TEXT, PRIVACY_TEXT, TERMS_VERSION, PRIVACY_VERSION } from "@/lib/legal";
import PhoneInput from "@/components/common/PhoneInput";
import CountrySelect from "@/components/common/CountrySelect";
import GlassSelect from "@/components/ui/GlassSelect";
import AuthShell from "@/components/auth/AuthShell";
import AuthField from "@/components/auth/AuthField";
import AuthModal from "@/components/auth/AuthModal";
import { RegisterSkeletonBody } from "@/components/auth/RegisterSkeleton";
import {
  CURRENCIES,
  BUSINESS_TYPES,
  GROUPING_SYSTEMS,
  SEPARATOR_PRESETS,
  TIMEZONES,
  TIMEZONE_OPTIONS,
  countryByIso2,
  currencyByCode,
  isValidPhone,
  formatPhone,
  splitPhone,
  joinPhone,
} from "@/lib/referenceData";
import { businessNameHint } from "@/lib/businessClues";
import "@/styles/auth.css";

type Step = "details" | "otp";
type Mode = "signin" | "create";

/* ------------------------------------------------------------------ */
/* Form primitives                                                    */
/* ------------------------------------------------------------------ */

function PhoneRow({
  label,
  dial,
  setDial,
  number,
  setNumber,
  required,
  placeholder,
}: {
  label: string;
  dial: string;
  setDial: (v: string) => void;
  number: string;
  setNumber: (v: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <PhoneInput
      label={label}
      required={required}
      placeholder={placeholder}
      value={joinPhone(dial, number) || (dial ? `+${dial}` : "")}
      keepDialWhenEmpty
      onChange={(full) => {
        const p = splitPhone(full);
        setDial(p.dial);
        setNumber(p.number);
      }}
    />
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="reg-group">
      <p className="reg-group-title">{title}</p>
      <div className="reg-fields">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                               */
/* ------------------------------------------------------------------ */

export default function Register() {
  const nav = useNavigate();
  const { data: adminStatus, isLoading } = useAppAdminStatus();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState<Step>("details");
  const [loading, setLoading] = useState(false);
  const [legal, setLegal] = useState<"terms" | "privacy" | null>(null);
  // Workplace gateway: explicit choice between joining an existing workplace
  // and creating a new one. Derived from ?mode=signin|create when present,
  // otherwise from backend state (fresh install -> create; existing shop ->
  // sign in). Deriving (not state) keeps in-page Links like
  // /register?mode=create seamless when already on /register.
  const modeParam = searchParams.get("mode");
  const paramMode: Mode | null =
    modeParam === "signin" || modeParam === "create" ? modeParam : null;
  const mode: Mode | null =
    paramMode ?? (isLoading ? null : adminStatus?.hasAdmin ? "signin" : "create");

  // Reset the form step when the user jumps between create/sign-in surfaces
  // via the footer cross-link, so a stale OTP step never greets them.
  useEffect(() => {
    setStep("details");
  }, [mode]);

  // account
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // business
  const [businessName, setBusinessName] = useState("");
  const [countryIso, setCountryIso] = useState("UG");
  const [timezone, setTimezone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  );
  const [businessType, setBusinessType] = useState("Retail");
  const [currency, setCurrency] = useState("UGX");
  const [grouping, setGrouping] = useState<"western" | "indian">("western");
  const [decimalPlaces, setDecimalPlaces] = useState(2);
  const [separatorId, setSeparatorId] = useState("us");
  // contacts
  const [mobileDial, setMobileDial] = useState("256");
  const [mobileNumber, setMobileNumber] = useState("");
  const [officeDial, setOfficeDial] = useState("256");
  const [officeNumber, setOfficeNumber] = useState("");
  const [waDial, setWaDial] = useState("256");
  const [waNumber, setWaNumber] = useState("");
  // legal
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const hadNoAdmin = useMemo(() => !adminStatus?.hasAdmin, [adminStatus]);

  useEffect(() => {
    const c = countryByIso2(countryIso);
    if (c) {
      setMobileDial((d) => (d === "" ? c.dial : d));
      if (!currencyByCode(currency) || currency === "") setCurrency(c.currency);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryIso]);

  useEffect(() => {
    if (!TIMEZONES.includes(timezone)) setTimezone("UTC");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const separator = SEPARATOR_PRESETS.find((s) => s.id === separatorId) || SEPARATOR_PRESETS[0];

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (adminStatus?.hasAdmin) {
      toast.error("This shop already has an admin. Branches join via admin invite — ask the shop admin to add you.");
      return;
    }
    if (!acceptedTerms) {
      toast.error("Please read and accept the Terms & Conditions and Privacy Policy first.");
      return;
    }
    if (!businessName.trim()) {
      toast.error("Business name is required.");
      return;
    }
    if (!isValidPhone(mobileDial, mobileNumber)) {
      toast.error("Enter a valid mobile number (4–15 digits).");
      return;
    }
    if (officeNumber && !isValidPhone(officeDial, officeNumber)) {
      toast.error("Office number looks invalid.");
      return;
    }
    if (waNumber && !isValidPhone(waDial, waNumber)) {
      toast.error("WhatsApp number looks invalid.");
      return;
    }
    setLoading(true);
    try {
      await authService.sendOtp(email.trim().toLowerCase(), {
        username: username.trim() || email.split("@")[0],
        business_name: businessName.trim(),
        country: countryByIso2(countryIso)?.name || countryIso,
        timezone,
        business_type: businessType,
        currency,
        digit_grouping: grouping,
        decimal_places: String(decimalPlaces),
        thousand_separator: separator.thousand,
        decimal_separator: separator.decimal,
        mobile: formatPhone(mobileDial, mobileNumber),
        office_phone: officeNumber ? formatPhone(officeDial, officeNumber) : "",
        whatsapp: waNumber ? formatPhone(waDial, waNumber) : "",
        terms_version: TERMS_VERSION,
        privacy_version: PRIVACY_VERSION,
      });
      toast.success(`Verification code sent to ${email}`);
      setStep("otp");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send code");
    } finally {
      setLoading(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Passwords do not match — re-enter both fields.");
      return;
    }
    setLoading(true);
    try {
      const mobile = formatPhone(mobileDial, mobileNumber);
      const newUser = await authService.verifyOtpAndSetPassword(email, otp, password, username, {
        displayName: username.trim() || email.split("@")[0],
        phone: mobile,
      });
      // Confirm display name + phone on the profile (trigger already set them
      // from metadata; this is the visible guarantee).
      if (newUser) {
        await supabase
          .from("user_profiles")
          .update({
            ...(username.trim() ? { username: username.trim() } : {}),
            phone: mobile,
          })
          .eq("id", newUser.id);
      }
      if (hadNoAdmin) {
        // Belt-and-braces: the signup trigger already bootstrapped the shop
        // from metadata; confirm the full form values as the new admin.
        await supabase
          .from("shop_settings")
          .update({
            shop_name: businessName.trim(),
            currency,
            country: countryByIso2(countryIso)?.name || countryIso,
            timezone,
            business_type: businessType,
            digit_grouping: grouping,
            decimal_places: decimalPlaces,
            thousand_separator: separator.thousand,
            decimal_separator: separator.decimal,
            mobile: formatPhone(mobileDial, mobileNumber),
            office_phone: officeNumber ? formatPhone(officeDial, officeNumber) : "",
            whatsapp: waNumber ? formatPhone(waDial, waNumber) : "",
            terms_version: TERMS_VERSION,
            privacy_version: PRIVACY_VERSION,
          })
          .eq("id", "main");
        toast.success("Shop created — welcome, admin");
      } else {
        toast.success("Account created — waiting for admin approval");
      }
      nav("/");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verification failed");
      setLoading(false);
    }
  };

  const hasAdmin = adminStatus?.hasAdmin;

  if (isLoading) {
    return (
      <AuthShell className="register-wide" hideBrand footer={null}>
        <RegisterSkeletonBody />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      className="register-wide"
      hideBrand
      footer={
        <p className="register-footer">
          {mode === "signin" ? (
            hasAdmin ? (
              <>Need access? Ask your workspace admin for an invite.</>
            ) : (
              <>
                New to PixoBooks?{" "}
                <Link to="/register?mode=create" className="reg-link">
                  Create a business
                </Link>
              </>
            )
          ) : mode === "create" && hasAdmin ? (
            <>
              Already have access?{" "}
              <Link to="/login" className="reg-link">
                Sign in
              </Link>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <Link to="/login" className="reg-link">
                Sign in
              </Link>
            </>
          )}
        </p>
      }
    >
          {mode === null ? (
            <div className="reg-intro">
              <h1 className="reg-title">Preparing your workspace</h1>
              <p className="reg-lede">This will only take a moment.</p>
            </div>
          ) : mode === "signin" ? (
            <>
              <div className="reg-intro">
                <p className="reg-step">Workplace access</p>
                <h1 className="reg-title">Welcome back</h1>
                <p className="reg-lede">
                  Sign in to the workspace your admin already set up.
                </p>
              </div>
              <div className="reg-card">
                <div className="reg-state">
                  <p className="reg-state-text">
                    Use your work email and password. Access is managed by your
                    workspace admin.
                  </p>
                  <Link to="/login" className="reg-cta">
                    Continue to sign in
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </>
          ) : hasAdmin ? (
            <>
              <div className="reg-intro">
                <p className="reg-step">Workspace access</p>
                <h1 className="reg-title">This workspace is already set up</h1>
                <p className="reg-lede">
                  Ask your workspace admin for an invite, or sign in if you
                  already have an account.
                </p>
              </div>
              <div className="reg-card">
                <div className="reg-state">
                  <p className="reg-state-text">
                    New team members join through an admin invite.
                  </p>
                  <Link to="/login" className="reg-cta">
                    Go to sign in
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </>
          ) : step === "details" ? (
            <>
              <div className="reg-intro">
                <p className="reg-step">Step 1 of 2</p>
                <h1 className="reg-title">Create your business</h1>
                <p className="reg-lede">
                  One workspace for sales, stock, and books. Verify your email
                  next.
                </p>
              </div>

              <div className="reg-card">
                <form onSubmit={sendCode} className="reg-form">
                  <Group title="Account">
                    <AuthField htmlFor="reg-email" label="Email address" required icon={Mail}>
                      <input
                        id="reg-email"
                        autoFocus
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@company.com"
                        autoComplete="email"
                        className="input reg-input reg-with-icon"
                      />
                    </AuthField>
                    <AuthField htmlFor="reg-name" label="Your name" icon={User}>
                      <input
                        id="reg-name"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Admin name"
                        autoComplete="name"
                        className="input reg-input reg-with-icon"
                      />
                    </AuthField>
                  </Group>

                  <Group title="Business">
                    <AuthField
                      htmlFor="reg-business"
                      label="Business name"
                      required
                      icon={Building2}
                      className="reg-span-2"
                    >
                      <input
                        id="reg-business"
                        required
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        placeholder={businessNameHint(businessType)}
                        autoComplete="organization"
                        className="input reg-input reg-with-icon"
                      />
                    </AuthField>

                    <div className="reg-field">
                      <CountrySelect
                        label="Country"
                        required
                        valueIso2={countryIso}
                        onChange={setCountryIso}
                      />
                    </div>

                    <AuthField htmlFor="reg-biz-type" label="Business type">
                      <GlassSelect
                        id="reg-biz-type"
                        value={businessType}
                        onChange={setBusinessType}
                        options={BUSINESS_TYPES.map((t) => ({ value: t, label: t }))}
                        ariaLabel="Business type"
                        fullWidth
                        className="input select-glass reg-input"
                      />
                    </AuthField>

                    <AuthField htmlFor="reg-tz" label="Time zone">
                      <GlassSelect
                        id="reg-tz"
                        value={timezone}
                        onChange={setTimezone}
                        options={TIMEZONE_OPTIONS}
                        ariaLabel="Time zone"
                        fullWidth
                        className="input select-glass reg-input"
                      />
                    </AuthField>

                    <AuthField htmlFor="reg-currency" label="Currency">
                      <GlassSelect
                        id="reg-currency"
                        value={currency}
                        onChange={setCurrency}
                        options={CURRENCIES.map((c) => ({
                          value: c.code,
                          label: `${c.code} ${c.symbol} - ${c.name}`,
                        }))}
                        ariaLabel="Currency"
                        fullWidth
                        className="input select-glass reg-input"
                      />
                    </AuthField>

                    <details className="reg-advanced">
                      <summary>
                        <ChevronDown className="reg-chevron" aria-hidden="true" />
                        Regional and number format
                      </summary>
                      <div className="reg-advanced-fields">
                        <AuthField htmlFor="reg-grouping" label="Digit grouping">
                          <GlassSelect
                            id="reg-grouping"
                            value={grouping}
                            onChange={(v) => setGrouping(v as "western" | "indian")}
                            options={GROUPING_SYSTEMS.map((g) => ({
                              value: g.id,
                              label: g.label,
                            }))}
                            ariaLabel="Digit grouping"
                            fullWidth
                            className="input select-glass reg-input"
                          />
                        </AuthField>
                        <AuthField htmlFor="reg-decimals" label="Decimal places">
                          <GlassSelect
                            id="reg-decimals"
                            value={String(decimalPlaces)}
                            onChange={(v) => setDecimalPlaces(Number(v))}
                            options={[0, 1, 2, 3, 4].map((n) => ({
                              value: String(n),
                              label: String(n),
                            }))}
                            ariaLabel="Decimal places"
                            fullWidth
                            className="input select-glass reg-input"
                          />
                        </AuthField>
                        <AuthField htmlFor="reg-separator" label="Separator format">
                          <GlassSelect
                            id="reg-separator"
                            value={separatorId}
                            onChange={setSeparatorId}
                            options={SEPARATOR_PRESETS.map((s) => ({
                              value: s.id,
                              label: s.label,
                            }))}
                            ariaLabel="Separator format"
                            fullWidth
                            className="input select-glass reg-input"
                          />
                        </AuthField>
                      </div>
                    </details>
                  </Group>

                  <Group title="Contact">
                    <div className="reg-field">
                      <PhoneRow
                        label="Mobile number"
                        dial={mobileDial}
                        setDial={setMobileDial}
                        number={mobileNumber}
                        setNumber={setMobileNumber}
                        required
                      />
                    </div>
                    <div className="reg-field">
                      <PhoneRow
                        label="Office number"
                        dial={officeDial}
                        setDial={setOfficeDial}
                        number={officeNumber}
                        setNumber={setOfficeNumber}
                      />
                    </div>
                    <div className="reg-field reg-span-2">
                      <PhoneRow
                        label="WhatsApp"
                        dial={waDial}
                        setDial={setWaDial}
                        number={waNumber}
                        setNumber={setWaNumber}
                      />
                    </div>
                  </Group>

                  <div className="reg-actions">
                    <label className="reg-terms">
                      <input
                        type="checkbox"
                        checked={acceptedTerms}
                        onChange={(e) => setAcceptedTerms(e.target.checked)}
                        className="reg-check"
                      />
                      <span>
                        I accept the{" "}
                        <button
                          type="button"
                          onClick={() => setLegal("terms")}
                          className="reg-legal"
                        >
                          Terms
                        </button>{" "}
                        and{" "}
                        <button
                          type="button"
                          onClick={() => setLegal("privacy")}
                          className="reg-legal"
                        >
                          Privacy Policy
                        </button>
                        .
                      </span>
                    </label>
                    <button
                      type="submit"
                      disabled={loading || !acceptedTerms}
                      className="reg-submit"
                    >
                      {loading ? (
                        <Loader2 className="reg-spin" aria-hidden="true" />
                      ) : null}
                      {loading ? "Sending code…" : "Continue"}
                      {!loading && <ArrowRight aria-hidden="true" />}
                    </button>
                    <p className="reg-secure">
                      <ShieldCheck aria-hidden="true" />
                      The first account becomes the workspace admin.
                    </p>
                  </div>
                </form>
              </div>
            </>
          ) : (
            <>
              <div className="reg-intro">
                <p className="reg-step">Step 2 of 2</p>
                <h1 className="reg-title">Verify your email</h1>
                <p className="reg-lede">
                  Enter the 6-digit code sent to{" "}
                  <span className="reg-strong">{email}</span>.
                </p>
              </div>

              <div className="reg-card">
                <form onSubmit={verify} className="reg-form">
                  <Group title="Verification">
                    <AuthField
                      htmlFor="reg-otp"
                      label="Verification code"
                      hint="Use the code, not the email link."
                      className="reg-span-2"
                    >
                      <input
                        id="reg-otp"
                        autoFocus
                        inputMode="numeric"
                        required
                        value={otp}
                        onChange={(e) =>
                          setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                        }
                        placeholder="000000"
                        maxLength={6}
                        autoComplete="one-time-code"
                        className="input reg-input reg-code"
                      />
                    </AuthField>

                    <AuthField
                      htmlFor="reg-password"
                      label="Password"
                      required
                      icon={Lock}
                      hint="Use at least 6 characters."
                    >
                      <input
                        id="reg-password"
                        type={showPassword ? "text" : "password"}
                        required
                        minLength={6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        autoComplete="new-password"
                        className="input reg-input reg-with-icon reg-with-eye"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="reg-eye"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        aria-pressed={showPassword}
                      >
                        {showPassword ? (
                          <EyeOff aria-hidden="true" />
                        ) : (
                          <Eye aria-hidden="true" />
                        )}
                      </button>
                    </AuthField>

                    <AuthField
                      htmlFor="reg-confirm"
                      label="Confirm password"
                      required
                      icon={KeyRound}
                      error={
                        confirmPassword && password !== confirmPassword
                          ? "Passwords do not match."
                          : undefined
                      }
                    >
                      <input
                        id="reg-confirm"
                        type={showPassword ? "text" : "password"}
                        required
                        minLength={6}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        autoComplete="new-password"
                        className="input reg-input reg-with-icon"
                      />
                    </AuthField>
                  </Group>

                  <div className="reg-actions">
                    <button type="submit" disabled={loading} className="reg-submit">
                      {loading ? (
                        <Loader2 className="reg-spin" aria-hidden="true" />
                      ) : null}
                      {loading
                        ? "Creating workspace…"
                        : hadNoAdmin
                          ? "Create workspace"
                          : "Create account"}
                      {!loading && <ArrowRight aria-hidden="true" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep("details")}
                      className="reg-back"
                    >
                      <ArrowLeft aria-hidden="true" />
                      Back to details
                    </button>
                    <p className="reg-secure">
                      <ShieldCheck aria-hidden="true" />
                      Your business data is protected and secure.
                    </p>
                  </div>
                </form>
              </div>
            </>
          )}

      {legal && (
        <AuthModal
          kicker="Legal"
          title={
            legal === "terms"
              ? `Terms & Conditions (v${TERMS_VERSION})`
              : `Privacy Policy (v${PRIVACY_VERSION})`
          }
          wide
          onClose={() => setLegal(null)}
          footer={
            <button type="button" onClick={() => setLegal(null)} className="reg-submit">
              Close
            </button>
          }
        >
          <pre className="reg-modal-text">
            {legal === "terms" ? TERMS_TEXT : PRIVACY_TEXT}
          </pre>
        </AuthModal>
      )}
    </AuthShell>
  );
}
