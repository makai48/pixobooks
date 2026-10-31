import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Printer,
  ArrowRight,
  Mail,
  KeyRound,
  Lock,
  LogIn,
  Eye,
  EyeOff,
  User,
  ShieldCheck,
  ShieldAlert,
  Building2,
  Clock3,
  Briefcase,
  Coins,
  Hash,
  FileText,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { authService } from "@/lib/auth";
import { useAppOwnerStatus } from "@/hooks/useAuth";
import { TERMS_TEXT, PRIVACY_TEXT, TERMS_VERSION, PRIVACY_VERSION } from "@/lib/legal";
import PhoneInput from "@/components/common/PhoneInput";
import CountrySelect from "@/components/common/CountrySelect";
import GlassSelect from "@/components/ui/GlassSelect";
import {
  CURRENCIES,
  BUSINESS_TYPES,
  GROUPING_SYSTEMS,
  SEPARATOR_PRESETS,
  TIMEZONES,
    countryByIso2,
    currencyByCode,
    isValidPhone,
    formatPhone,
    splitPhone,
    joinPhone,
} from "@/lib/referenceData";

type Step = "details" | "otp";

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
      value={joinPhone(dial, number)}
      onChange={(full) => {
        const p = splitPhone(full);
        setDial(p.dial);
        setNumber(p.number);
      }}
    />
  );
}

function LegalModal({ kind, onClose }: { kind: "terms" | "privacy"; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50" onClick={onClose}>
      <div
        className="paper-card max-w-lg w-full max-h-[80dvh] flex flex-col p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-bold flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {kind === "terms" ? `Terms & Conditions (v${TERMS_VERSION})` : `Privacy Policy (v${PRIVACY_VERSION})`}
          </h3>
          <button onClick={onClose} className="btn btn-ghost h-8 w-8 p-0" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <pre className="mt-4 text-xs whitespace-pre-wrap overflow-auto flex-1 text-ink-soft">
          {kind === "terms" ? TERMS_TEXT : PRIVACY_TEXT}
        </pre>
        <button onClick={onClose} className="btn btn-primary w-full h-10 mt-4">
          Close
        </button>
      </div>
    </div>
  );
}

type Mode = "signin" | "create";

export default function Register() {
  const nav = useNavigate();
  const { data: ownerStatus, isLoading } = useAppOwnerStatus();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState<Step>("details");
  const [loading, setLoading] = useState(false);
  const [legal, setLegal] = useState<"terms" | "privacy" | null>(null);
  // Workplace gateway (register screen only): explicit choice between joining
  // an existing workplace and creating a new one. Defaults from backend state
  // (fresh install -> create; existing shop -> sign in), overridable via
  // ?mode=signin|create and by tapping the chooser.
  const [mode, setMode] = useState<Mode | null>(() => {
    const m = searchParams.get("mode");
    return m === "signin" || m === "create" ? m : null;
  });
  useEffect(() => {
    if (mode === null && !isLoading) {
      setMode(ownerStatus?.hasOwner ? "signin" : "create");
    }
  }, [mode, isLoading, ownerStatus]);

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
  const [businessType, setBusinessType] = useState("Printshop");
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

  const wasOwnerless = useMemo(() => !ownerStatus?.hasOwner, [ownerStatus]);

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
    if (ownerStatus?.hasOwner) {
      toast.error("This shop already has an owner. Branches join via owner invite — ask the shop owner to add you.");
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
      if (wasOwnerless) {
        // Belt-and-braces: the signup trigger already bootstrapped the shop
        // from metadata; confirm the full form values as the new owner.
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
        toast.success("Shop created — welcome, owner");
      } else {
        toast.success("Account created — waiting for owner approval");
      }
      nav("/");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verification failed");
      setLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-paper text-ink-mute text-sm">
        Preparing setup...
      </div>
    );
  }

  const hasOwner = ownerStatus?.hasOwner;

  return (
    <div className="h-[100dvh] bg-paper flex justify-center overflow-y-auto overscroll-contain p-4 md:p-6">
      <div className="w-full max-w-md m-auto">
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 rounded-lg bg-ink overflow-hidden flex items-center justify-center">
            <div className="absolute inset-0 flex opacity-90">
              <span className="flex-1 bg-cyan-reg" />
              <span className="flex-1 bg-magenta-reg" />
              <span className="flex-1 bg-yellow-reg" />
              <span className="flex-1 bg-ink" />
            </div>
            <Printer className="relative z-10 w-5 h-5 text-paper mix-blend-difference" />
          </div>
          <div>
            <div className="font-display text-lg font-bold">PixoBooks</div>
            <div className="text-[11px] uppercase tracking-widest text-ink-mute">
              Shop setup
            </div>
          </div>
        </div>

        {mode && (
          <div className="mt-6 grid grid-cols-2 gap-1 p-1 rounded-xl border border-line bg-ink/5" role="tablist" aria-label="Workplace access">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "signin"}
              onClick={() => setMode("signin")}
              className={`h-11 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition ${
                mode === "signin" ? "bg-paper shadow text-ink" : "text-ink-mute hover:text-ink"
              }`}
            >
              <LogIn className="w-4 h-4" />
              Sign in to your Workplace
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "create"}
              onClick={() => setMode("create")}
              className={`h-11 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition ${
                mode === "create" ? "bg-paper shadow text-ink" : "text-ink-mute hover:text-ink"
              }`}
            >
              <Building2 className="w-4 h-4" />
              Create New Workplace
            </button>
          </div>
        )}

        {mode === null ? (
          <div className="paper-card p-8 mt-6 text-center text-sm text-ink-mute">
            Preparing…
          </div>
        ) : mode === "signin" ? (
          <div className="paper-card p-8 mt-6 text-center">
            <div className="w-12 h-12 rounded-full bg-cyan-reg/10 flex items-center justify-center mx-auto">
              <LogIn className="w-6 h-6 text-cyan-reg" />
            </div>
            <h2 className="font-display text-2xl font-bold mt-4">
              Sign in to your Workplace
            </h2>
            <p className="text-ink-mute text-sm mt-2">
              Already have an account on this or another workplace? Sign in
              with your work email and password. New shops start under
              Create New Workplace.
            </p>
            <Link to="/login" className="btn btn-primary w-full h-11 mt-6">
              <LogIn className="w-4 h-4" />
              Go to sign in
            </Link>
          </div>
        ) : hasOwner ? (
          <div className="paper-card p-8 mt-6">
            <div className="w-12 h-12 rounded-full bg-danger/10 flex items-center justify-center">
              <ShieldAlert className="w-6 h-6 text-danger" />
            </div>
            <h2 className="font-display text-2xl font-bold mt-4">
              This shop already has an owner
            </h2>
            <p className="text-ink-mute text-sm mt-2">
              The shop owner account exists. Branches and team members join only
              through the owner: ask the shop owner to invite you from their
              dashboard, then sign in. If you requested access, wait for the
              owner's approval or use{" "}
              <span className="font-semibold text-ink">Set / reset password</span>.
            </p>
            <div className="mt-6">
              <Link to="/login" className="btn btn-primary w-full h-11">
                Go to sign in
              </Link>
            </div>
          </div>
        ) : step === "details" ? (
          <div className="paper-card p-6 md:p-8 mt-6">
            <div className="flex items-start gap-2 rounded-md bg-yellow-reg/10 border border-yellow-reg/30 p-3 mb-5 text-xs text-ink-soft">
              <ShieldCheck className="w-4 h-4 text-yellow-reg shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-ink">First registration owns this shop</div>
                <div className="mt-1">
                  Any email can register first — that account becomes the shop
                  owner. Afterwards, branches and staff join only via owner
                  invite or approval.
                </div>
              </div>
            </div>

            <h2 className="font-display text-2xl font-bold">Set up your shop</h2>
            <p className="text-ink-mute text-sm mt-1">
              Your account, business profile and contacts — then we verify your email.
            </p>
            <form onSubmit={sendCode} className="mt-6 space-y-4">
              <div>
                <label htmlFor="reg-email" className="label">Your email <span className="text-danger">*</span></label>
                <div className="mt-1 relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
                  <input id="reg-email" autoFocus type="email" required value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@yourshop.com" className="input pl-9" />
                </div>
              </div>
              <div>
                <label htmlFor="reg-name" className="label">Your name</label>
                <div className="mt-1 relative">
                  <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
                  <input id="reg-name" value={username} onChange={(e) => setUsername(e.target.value)}
                    placeholder="Owner name" className="input pl-9" />
                </div>
              </div>
              <div>
                <label htmlFor="reg-business" className="label">Business name <span className="text-danger">*</span></label>
                <div className="mt-1 relative">
                  <Building2 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
                  <input id="reg-business" required value={businessName} onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="e.g. Pixo Printshop" className="input pl-9" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <CountrySelect
                  label="Country"
                  required
                  valueIso2={countryIso}
                  onChange={setCountryIso}
                />
                <div>
                  <label htmlFor="reg-biz-type" className="label">Business type</label>
                  <div className="mt-1 relative">
                    <Briefcase className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
                    <GlassSelect
                      id="reg-biz-type"
                      value={businessType}
                      onChange={setBusinessType}
                      options={BUSINESS_TYPES.map((t) => ({ value: t, label: t }))}
                      ariaLabel="Business type"
                      className="input select-glass pl-9"
                    />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="reg-tz" className="label">Time zone</label>
                  <div className="mt-1 relative">
                    <Clock3 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
                    <GlassSelect
                      id="reg-tz"
                      value={timezone}
                      onChange={setTimezone}
                      options={TIMEZONES.map((z) => ({ value: z, label: z }))}
                      ariaLabel="Time zone"
                      className="input select-glass pl-9"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="reg-currency" className="label">Currency</label>
                  <div className="mt-1 relative">
                    <Coins className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
                    <GlassSelect
                      id="reg-currency"
                      value={currency}
                      onChange={setCurrency}
                      options={CURRENCIES.map((c) => ({
                        value: c.code,
                        label: `${c.code} ${c.symbol} - ${c.name}`,
                      }))}
                      ariaLabel="Currency"
                      className="input select-glass pl-9"
                    />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="reg-grouping" className="label">Digit grouping</label>
                  <GlassSelect
                    id="reg-grouping"
                    value={grouping}
                    onChange={(v) => setGrouping(v as "western" | "indian")}
                    options={GROUPING_SYSTEMS.map((g) => ({ value: g.id, label: g.label }))}
                    ariaLabel="Digit grouping"
                    className="input select-glass mt-1"
                  />
                </div>
                <div>
                  <label htmlFor="reg-decimals" className="label">Decimal places</label>
                  <div className="mt-1 relative">
                    <Hash className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
                    <GlassSelect
                      id="reg-decimals"
                      value={String(decimalPlaces)}
                      onChange={(v) => setDecimalPlaces(Number(v))}
                      options={[0, 1, 2, 3, 4].map((n) => ({ value: String(n), label: String(n) }))}
                      ariaLabel="Decimal places"
                      className="input select-glass pl-9"
                    />
                  </div>
                </div>
              </div>
              <div>
                <label htmlFor="reg-separator" className="label">Separator format</label>
                <GlassSelect
                  id="reg-separator"
                  value={separatorId}
                  onChange={setSeparatorId}
                  options={SEPARATOR_PRESETS.map((s) => ({ value: s.id, label: s.label }))}
                  ariaLabel="Separator format"
                  className="input select-glass mt-1"
                />
              </div>
              <PhoneRow label="Mobile" dial={mobileDial} setDial={setMobileDial}
                number={mobileNumber} setNumber={setMobileNumber} required />
              <PhoneRow label="Office (optional)" dial={officeDial} setDial={setOfficeDial}
                number={officeNumber} setNumber={setOfficeNumber} />
              <PhoneRow label="WhatsApp (optional)" dial={waDial} setDial={setWaDial}
                number={waNumber} setNumber={setWaNumber} />
              <label className="flex items-start gap-2 text-xs text-ink-soft cursor-pointer">
                <input type="checkbox" checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  I have read and accept the{" "}
                  <button type="button" onClick={() => setLegal("terms")}
                    className="underline font-semibold text-ink">Terms &amp; Conditions (v{TERMS_VERSION})</button>{" "}
                  and the{" "}
                  <button type="button" onClick={() => setLegal("privacy")}
                    className="underline font-semibold text-ink">Privacy Policy (v{PRIVACY_VERSION})</button>.
                </span>
              </label>
              <button type="submit" disabled={loading || !acceptedTerms}
                className="btn btn-primary w-full h-11 disabled:opacity-50">
                {loading ? "Sending code..." : "Save & send verification code"}
                <ArrowRight className="w-4 h-4" />
              </button>
              {!acceptedTerms && (
                <p className="text-[11px] text-ink-mute text-center">
                  Tick the box above to save and proceed.
                </p>
              )}
            </form>
          </div>
        ) : (
          <div className="paper-card p-6 md:p-8 mt-6">
            <h2 className="font-display text-2xl font-bold">Verify &amp; set a password</h2>
            <p className="text-ink-mute text-sm mt-1">
              Check <span className="font-semibold text-ink">{email}</span> for the
              email — enter the <span className="font-semibold text-ink">6-digit code</span> below
              (not the button link).
            </p>
            <form onSubmit={verify} className="mt-6 space-y-4">
              <div>
                <label htmlFor="reg-otp" className="label">Verification code</label>
                <div className="mt-1 relative">
                  <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
                  <input id="reg-otp" autoFocus inputMode="numeric" required value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000" maxLength={6}
                    className="input pl-9 tracking-[0.5em] text-center num text-lg" />
                </div>
              </div>
              <div>
                <label htmlFor="reg-password" className="label">Set a password (6+ characters)</label>
                <div className="mt-1 relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
                  <input id="reg-password" type={showPassword ? "text" : "password"} required minLength={6} value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••" className="input pl-9 pr-10" autoComplete="new-password" />
                  <button type="button" onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-ink-mute hover:text-ink"
                    aria-label={showPassword ? "Hide password" : "Show password"}>
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label htmlFor="reg-confirm" className="label">Confirm password</label>
                <div className="mt-1 relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
                  <input id="reg-confirm" type={showPassword ? "text" : "password"} required minLength={6} value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••" className="input pl-9 pr-10" autoComplete="new-password" />
                  <button type="button" onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-ink-mute hover:text-ink"
                    aria-label={showPassword ? "Hide password" : "Show password"}>
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirmPassword && password !== confirmPassword && (
                  <p className="mt-1 text-[11px] text-danger">Passwords do not match.</p>
                )}
              </div>
              <button type="submit" disabled={loading} className="btn btn-primary w-full h-11">
                {loading ? "Creating shop..." : wasOwnerless ? "Create my shop" : "Create account"}
              </button>
              <button type="button" onClick={() => setStep("details")} className="btn btn-ghost w-full">
                Back to details
              </button>
            </form>
          </div>
        )}

        {legal && <LegalModal kind={legal} onClose={() => setLegal(null)} />}

        <p className="text-center text-sm text-ink-mute mt-4">
          Already have an account?{" "}
          <Link to="/login" className="text-ink font-semibold underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
