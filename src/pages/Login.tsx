import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowBigUp,
  ArrowRight,
  Clock3,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
} from "lucide-react";
import { toast } from "sonner";
import { authService } from "@/lib/auth";
import { useAuth } from "@/hooks/useAuth";
import { useCreatePasswordResetRequest } from "@/hooks/usePasswordResets";
import { createAccountApprovalRequest } from "@/hooks/useAccountApprovals";
import { supabase } from "@/lib/supabase";
import { mapEmployee } from "@/lib/mappers";
import { describeSignInError, resolveSignInGate } from "@/lib/signInFlow";
import AuthShell from "@/components/auth/AuthShell";
import AuthHighlights from "@/components/auth/AuthHighlights";
import AuthField from "@/components/auth/AuthField";
import AuthModal from "@/components/auth/AuthModal";
import { cn } from "@/lib/utils";
import "@/styles/auth.css";

type Blocked =
  | { type: "pending_first"; email: string; adminHint?: string }
  | { type: "pending_still"; email: string; requestedAt?: string }
  | { type: "rejected"; email: string; notes?: string }
  | { type: "expired"; email: string }
  | { type: "request_failed"; email: string; message: string }
  | null;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  const nav = useNavigate();
  const { user, profile, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
  }>({});
  // A rejected credential pair is an error on BOTH fields (either could be
  // wrong), but there is only one message — shown under Password.
  const [credentialsError, setCredentialsError] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [blocked, setBlocked] = useState<Blocked>(null);
  const submittingRef = useRef(false);

  // Only auto-navigate away from /login when the user is fully approved &
  // does not need to change their password. Otherwise the post-signin gate
  // in submit() will handle routing.
  useEffect(() => {
    if (submittingRef.current) return;
    if (!user || !profile) return;
    if (profile.approvalStatus === "approved" && !profile.mustChangePassword) {
      nav("/", { replace: true });
    } else if (profile.approvalStatus === "approved" && profile.mustChangePassword) {
      nav("/change-password", { replace: true });
    }
  }, [user, profile, nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBlocked(null);
    setCredentialsError(null);
    // V3 mandatory-field warnings: asterisked fields warn inline when empty.
    const errors: { email?: string; password?: string } = {};
    if (!email.trim()) errors.email = "Enter your email address.";
    else if (!EMAIL_RE.test(email.trim()))
      errors.email = "Enter a valid email address.";
    if (!password) errors.password = "Enter your password.";
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setLoading(true);
    submittingRef.current = true;
    try {
      await authService.signIn(email, password);
      const {
        data: { user: signedUser },
      } = await supabase.auth.getUser();
      if (!signedUser) throw new Error("Sign in failed");

      const { data: prof, error: profErr } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("id", signedUser.id)
        .maybeSingle();

      if (profErr || !prof) {
        throw new Error(profErr?.message || "Your profile could not be loaded.");
      }

      const gate = resolveSignInGate({
        approvalStatus: prof.approval_status,
        mustChangePassword: prof.must_change_password,
        tempPasswordExpiresAt: prof.temp_password_expires_at,
        approvalRequestedAt: prof.approval_requested_at,
        notes: prof.notes,
      });
      const emp = mapEmployee(prof);

      const stop = (next: Blocked) => {
        setBlocked(next);
        setLoading(false);
        submittingRef.current = false;
      };

      switch (gate.type) {
        case "rejected":
          await supabase.auth.signOut();
          stop({
            type: "rejected",
            email: prof.email,
            notes: gate.notes ?? undefined,
          });
          return;

        case "expired":
          await supabase.auth.signOut();
          stop({ type: "expired", email: prof.email });
          return;

        case "pending_first_login":
          // The request is what puts the account in the admin's Approvals
          // queue. Never swallow a failure here — that would strand the
          // employee as "pending" with nothing for the admin to approve.
          try {
            await createAccountApprovalRequest(emp);
          } catch (err) {
            await supabase.auth.signOut();
            stop({
              type: "request_failed",
              email: prof.email,
              message:
                err instanceof Error
                  ? err.message
                  : "Your approval request could not be submitted.",
            });
            return;
          }
          await supabase.auth.signOut();
          stop({
            type: "pending_first",
            email: prof.email,
            adminHint: prof.invited_by_name || undefined,
          });
          return;

        case "pending_approval":
          await supabase.auth.signOut();
          stop({
            type: "pending_still",
            email: prof.email,
            requestedAt: gate.requestedAt ?? undefined,
          });
          return;

        case "approved":
          if (gate.mustChangePassword) {
            toast.success("Please set a new permanent password to continue.");
            submittingRef.current = false;
            nav("/change-password", { replace: true });
            return;
          }
          toast.success("Welcome back");
          submittingRef.current = false;
          nav("/", { replace: true });
          return;
      }
    } catch (err) {
      submittingRef.current = false;
      // V3 style: a rejected credential pair is one inline error, but BOTH
      // fields are invalid because either value could be wrong.
      setCredentialsError(describeSignInError(err));
      setLoading(false);
    }
  };

  return (
    <AuthShell
      loading={authLoading}
      loadingLabel="Preparing sign in…"
      footer={
        <p className="register-footer">
          New to PixoBooks?{" "}
          <Link to="/register?mode=create" className="reg-link">
            Create a new business
          </Link>
        </p>
      }
      overlay={
        forgotOpen ? (
          <ForgotPasswordModal onClose={() => setForgotOpen(false)} />
        ) : null
      }
    >
      <AuthHighlights />

      {blocked ? (
        <div className="reg-card">
          <BlockedPanel
            blocked={blocked}
            onReset={() => {
              setBlocked(null);
              setPassword("");
            }}
            onForgot={() => setForgotOpen(true)}
          />
        </div>
      ) : (
        <>
          <div className="reg-intro">
            <h1 className="reg-title">Welcome back</h1>
            <p className="reg-lede">
              Sign in to access your business workspace.
            </p>
          </div>

          <div className="reg-card">
            <form onSubmit={submit} noValidate className="reg-form">
              <fieldset
                disabled={loading}
                aria-busy={loading}
                className="reg-fieldset"
              >
                <div className="reg-fields">
                  <AuthField
                    htmlFor="login-email"
                    label="Email address"
                    required
                    icon={Mail}
                    error={fieldErrors.email}
                  >
                    <input
                      id="login-email"
                      autoFocus
                      type="email"
                      required
                      autoComplete="email"
                      aria-invalid={
                        !!fieldErrors.email || !!credentialsError
                      }
                      aria-describedby={
                        fieldErrors.email
                          ? "login-email-error"
                          : credentialsError
                            ? "login-password-error"
                            : undefined
                      }
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setCredentialsError(null);
                        if (fieldErrors.email)
                          setFieldErrors((prev) => ({
                            ...prev,
                            email: undefined,
                          }));
                      }}
                      placeholder="you@company.com"
                      className="input reg-input reg-with-icon"
                    />
                  </AuthField>

                  <AuthField
                    htmlFor="login-password"
                    label="Password"
                    required
                    icon={Lock}
                    error={
                      fieldErrors.password ?? credentialsError ?? undefined
                    }
                  >
                    <input
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={6}
                      autoComplete="current-password"
                      aria-invalid={
                        !!fieldErrors.password || !!credentialsError
                      }
                      aria-describedby={
                        fieldErrors.password || credentialsError
                          ? "login-password-error"
                          : undefined
                      }
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setCredentialsError(null);
                        if (fieldErrors.password)
                          setFieldErrors((prev) => ({
                            ...prev,
                            password: undefined,
                          }));
                      }}
                      onKeyDown={(e) =>
                        setCapsOn(e.getModifierState?.("CapsLock") ?? false)
                      }
                      onKeyUp={(e) =>
                        setCapsOn(e.getModifierState?.("CapsLock") ?? false)
                      }
                      onBlur={() => setCapsOn(false)}
                      placeholder="Enter your password"
                      className="input reg-input reg-with-icon reg-with-eye"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="reg-eye"
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      aria-pressed={showPassword}
                    >
                      {showPassword ? (
                        <EyeOff aria-hidden="true" />
                      ) : (
                        <Eye aria-hidden="true" />
                      )}
                    </button>
                  </AuthField>

                  {capsOn && (
                    <p className="reg-caps" role="status">
                      <ArrowBigUp aria-hidden="true" />
                      Caps Lock is on
                    </p>
                  )}
                </div>

                <div className="reg-auth-row">
                  <label className="reg-remember">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                      className="reg-remember-input"
                    />
                    <span
                      aria-hidden="true"
                      className="reg-remember-box"
                    >
                      <svg
                        viewBox="0 0 12 12"
                        aria-hidden="true"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                      >
                        <path d="M2.5 6.2 5 8.5l4.5-5" />
                      </svg>
                    </span>
                    Remember me
                  </label>
                  <button
                    type="button"
                    onClick={() => setForgotOpen(true)}
                    className="reg-forgot reg-forgot-link"
                  >
                    Forgot password?
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="reg-submit reg-submit-login"
                >
                  {loading ? (
                    <Loader2 className="reg-spin" aria-hidden="true" />
                  ) : null}
                  {loading ? "Signing in…" : "Sign in"}
                </button>
              </fieldset>

              <p className="reg-secure">
                <ShieldCheck aria-hidden="true" />
                Your business data is protected and secure.
              </p>
            </form>
          </div>
        </>
      )}
    </AuthShell>
  );
}

function BlockedPanel({
  blocked,
  onReset,
  onForgot,
}: {
  blocked: Exclude<Blocked, null>;
  onReset: () => void;
  onForgot: () => void;
}) {
  const cfg = (() => {
    switch (blocked.type) {
      case "pending_first":
        return {
          Icon: Clock3,
          tone: "warning" as const,
          title: "Approval request sent",
          body: (
            <>
              Your first sign-in with the temporary password has been logged. An
              approval request was just sent to{" "}
              <strong>{blocked.adminHint || "the workspace admin"}</strong>. As
              soon as they approve, sign in again — you'll then set a permanent
              password.
            </>
          ),
        };
      case "pending_still":
        return {
          Icon: Clock3,
          tone: "warning" as const,
          title: "Still awaiting admin approval",
          body: (
            <>
              Your account for <strong>{blocked.email}</strong> is still pending.
              Please wait for the workspace admin to approve, then try again.
            </>
          ),
        };
      case "rejected":
        return {
          Icon: ShieldAlert,
          tone: "danger" as const,
          title: "Account request rejected",
          body: (
            <>
              The admin has declined the account request for{" "}
              <strong>{blocked.email}</strong>.
              {blocked.notes && (
                <span className="reg-blocked-note">"{blocked.notes}"</span>
              )}
              Please contact the workspace admin if you believe this is an error.
            </>
          ),
        };
      case "expired":
        return {
          Icon: KeyRound,
          tone: "danger" as const,
          title: "Temporary password expired",
          body: (
            <>
              The temporary password for <strong>{blocked.email}</strong> has
              expired. Tap "Request a new one" below and the admin will re-issue
              one.
            </>
          ),
        };
      case "request_failed":
        return {
          Icon: ShieldAlert,
          tone: "danger" as const,
          title: "Approval request not sent",
          body: (
            <>
              You signed in, but your approval request for{" "}
              <strong>{blocked.email}</strong> could not be filed, so the
              workspace admin would not see it.
              <span className="reg-blocked-note">{blocked.message}</span>
              Sign in again to retry — your temporary password is still valid.
            </>
          ),
        };
    }
  })();

  const Icon = cfg.Icon;

  return (
    <div className="reg-blocked">
      <div
        className={cn(
          "reg-blocked-badge",
          cfg.tone === "warning" ? "is-warning" : "is-danger"
        )}
      >
        <Icon aria-hidden="true" />
      </div>
      <h2 className="reg-blocked-title">{cfg.title}</h2>
      <p className="reg-blocked-body">{cfg.body}</p>
      <div className="reg-blocked-actions">
        <button type="button" onClick={onReset} className="reg-submit">
          <ArrowRight aria-hidden="true" />
          Back to sign in
        </button>
        {blocked.type === "expired" && (
          <button type="button" onClick={onForgot} className="reg-secondary">
            <KeyRound aria-hidden="true" />
            Request a new one
          </button>
        )}
      </div>
    </div>
  );
}

function ForgotPasswordModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const create = useCreatePasswordResetRequest();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return toast.error("Enter your registered work email");
    setLoading(true);
    try {
      const rec = await create.mutateAsync(email.trim());
      setSent(rec.email);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthModal
      kicker="Password help"
      title="Forgot password"
      onClose={onClose}
      footer={
        sent ? (
          <button type="button" onClick={onClose} className="reg-submit">
            Done
          </button>
        ) : undefined
      }
    >
      {sent ? (
        <div className="reg-modal-state">
          <div className="reg-modal-badge">
            <ShieldQuestion aria-hidden="true" />
          </div>
          <h3 className="reg-blocked-title">Request sent</h3>
          <p className="reg-modal-copy">
            A reset request for <strong>{sent}</strong> was sent to the
            workspace admin. Once approved, a temporary password will be shared
            with you directly by the admin.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="reg-form">
          <p className="reg-modal-copy">
            Enter the work email registered on your account. The workspace admin
            will receive an approval request and, once approved, will share a
            temporary password with you directly.
          </p>
          <AuthField
            htmlFor="login-forgot-email"
            label="Registered work email"
            required
            icon={Mail}
          >
            <input
              id="login-forgot-email"
              autoFocus
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input reg-input reg-with-icon"
              placeholder="you@business.co"
            />
          </AuthField>
          <button type="submit" disabled={loading} className="reg-submit">
            {loading ? (
              <Loader2 className="reg-spin" aria-hidden="true" />
            ) : (
              <KeyRound aria-hidden="true" />
            )}
            {loading ? "Submitting…" : "Send request to admin"}
          </button>
        </form>
      )}
    </AuthModal>
  );
}
