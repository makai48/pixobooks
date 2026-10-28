import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  LogIn,
  Mail,
  Lock,
  KeyRound,
  X,
  ShieldQuestion,
  ShieldAlert,
  Clock3,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { authService } from "@/lib/auth";
import { useAuth } from "@/hooks/useAuth";
import { useCreatePasswordResetRequest } from "@/hooks/usePasswordResets";
import { createAccountApprovalRequest } from "@/hooks/useAccountApprovals";
import { supabase } from "@/lib/supabase";
import { mapEmployee } from "@/lib/mappers";
import {
  describeSignInError,
  resolveSignInGate,
} from "@/lib/signInFlow";

type Blocked =
  | { type: "pending_first"; email: string; ownerHint?: string }
  | { type: "pending_still"; email: string; requestedAt?: string }
  | { type: "rejected"; email: string; notes?: string }
  | { type: "expired"; email: string }
  | { type: "request_failed"; email: string; message: string }
  | null;

export default function Login() {
  const nav = useNavigate();
  const { user, profile, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
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
          // The request is what puts the account in the owner's Approvals
          // queue. Never swallow a failure here — that would strand the
          // employee as "pending" with nothing for the owner to approve.
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
            ownerHint: prof.invited_by_name || undefined,
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
      toast.error(describeSignInError(err));
      setLoading(false);
    }
  };

  if (authLoading) return null;

  return (
    // 100dvh + flex-column keeps the form vertically bounded on every
    // viewport (mobile browser chrome, installed PWA, keyboard open).
    // The outer container never scrolls; the form column does.
    <div className="h-[100dvh] w-full bg-paper flex flex-col md:flex-row overflow-hidden">
      {/* Full brand hero: DESKTOP ONLY. On mobile we surface a compact
          brand header inside the scrollable form column so the password
          field is always reachable without scrolling past a decorative
          hero. */}
      <div className="hidden md:flex md:w-[45%] bg-ink text-paper p-8 md:p-14 flex-col justify-center relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-white overflow-hidden flex items-center justify-center border-4 border-white/25 shadow-lg shrink-0">
              <img
                src={`${import.meta.env.BASE_URL}app-logo.png`}
                alt="PixoBooks"
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
            <div>
              <div className="font-display text-3xl font-bold leading-none">PixoBooks</div>
              <div className="text-[11px] uppercase tracking-widest text-paper/60 mt-1">
                Print Shop OS · Cloud PWA
              </div>
            </div>
          </div>

          <div className="mt-10 md:mt-16 max-w-md">
            <h1 className="font-display text-3xl md:text-5xl font-bold leading-tight">
              Every counter,
              <br />
              every device,
              <br />
              <span className="text-magenta-reg">in perfect register.</span>
            </h1>
            <p className="mt-4 md:mt-6 text-paper/70 text-base md:text-lg">
              Sell, quote, hold tickets, order stock and track spend from any device.
              Your team, your data — synced live and installable as a native app.
            </p>
          </div>

          <div className="mt-8 md:mt-14 grid grid-cols-3 gap-3 max-w-md">
            <Bullet color="bg-cyan-reg" label="Real-time sync" />
            <Bullet color="bg-magenta-reg" label="Credit sales & partial" />
            <Bullet color="bg-yellow-reg" label="Full ERP" />
          </div>
        </div>

        <div className="absolute -bottom-24 -right-24 w-72 h-72 rounded-full border border-paper/10" />
        <div className="absolute bottom-10 right-10 w-32 h-32 rounded-full border border-paper/10" />
      </div>

      {/* Form column: always scrollable, safe-area padded, keyboard-safe. */}
      <div
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain flex flex-col"
        style={{
          paddingTop: "max(env(safe-area-inset-top), 0px)",
          paddingBottom: "max(env(safe-area-inset-bottom), 0px)",
        }}
      >
        <div className="flex-1 flex items-start md:items-center justify-center px-4 py-6 md:p-8">
          <div className="w-full max-w-sm">
            {/* Compact mobile brand — visible ONLY on mobile */}
            <div className="md:hidden mb-5 flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-ink flex items-center justify-center overflow-hidden shrink-0">
                <img
                  src={`${import.meta.env.BASE_URL}app-logo.png`}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
              <div className="min-w-0">
                <div className="font-display text-xl font-bold leading-tight">
                  PixoBooks
                </div>
                <div className="text-[10px] uppercase tracking-widest text-ink-mute">
                  Print Shop OS
                </div>
              </div>
            </div>

            {blocked ? (
              <BlockedPanel
                blocked={blocked}
                onReset={() => setBlocked(null)}
                onForgot={() => setForgotOpen(true)}
              />
            ) : (
              <>
                <div className="text-[11px] uppercase tracking-widest text-ink-mute">
                  Welcome back
                </div>
                <h2 className="font-display text-2xl md:text-3xl font-bold mt-1">
                  Sign in to your shop
                </h2>
                <p className="text-ink-mute text-sm mt-2">
                  New team members receive a temporary password from the shop
                  owner. Sign in with it once — the owner will approve your
                  account, then you'll set a permanent password. If you're
                  stuck, tap{" "}
                  <button
                    type="button"
                    onClick={() => setForgotOpen(true)}
                    className="text-ink font-semibold underline"
                  >
                    Forgot password
                  </button>
                  .
                </p>

                <form onSubmit={submit} className="mt-5 space-y-4">
                  <div>
                    <label htmlFor="login-email" className="label">Email address</label>
                    <div className="mt-1 relative">
                      <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
                      <input
                        id="login-email"
                        autoFocus
                        type="email"
                        required
                        autoComplete="username"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@printshop.co"
                        className="input pl-9"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <label htmlFor="login-password" className="label">
                        Password / temporary password
                      </label>
                      <button
                        type="button"
                        onClick={() => setForgotOpen(true)}
                        className="text-[11px] font-semibold text-ink-mute hover:text-ink"
                      >
                        Forgot?
                      </button>
                    </div>
                    <div className="mt-1 relative">
                      <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
                      <input
                        id="login-password"
                        type="password"
                        required
                        minLength={6}
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="input pl-9"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="btn btn-primary w-full h-11 mt-2"
                  >
                    <LogIn className="w-4 h-4" />
                    {loading ? "Signing in..." : "Sign in"}
                  </button>
                </form>

                <p className="text-[11px] text-ink-mute mt-4 text-center">
                  After 3 failed attempts the account is locked until the owner
                  approves a reset.
                </p>

                <div className="flex items-center gap-3 mt-5" aria-hidden="true">
                  <span className="flex-1 border-t border-line" />
                  <span className="text-[11px] uppercase tracking-widest text-ink-mute">
                    New here?
                  </span>
                  <span className="flex-1 border-t border-line" />
                </div>
                <Link to="/register" className="btn btn-outline w-full h-11 mt-3">
                  <ArrowRight className="w-4 h-4" />
                  Create new workplace
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {forgotOpen && <ForgotPasswordModal onClose={() => setForgotOpen(false)} />}
    </div>
  );
}

function Bullet({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-paper/80">
      <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
      {label}
    </div>
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
          icon: <Clock3 className="w-7 h-7 text-yellow-reg" />,
          tint: "bg-yellow-reg/10 border-yellow-reg/40",
          title: "Approval request sent",
          body: (
            <>
              Your first sign-in with the temporary password has been logged. An
              approval request was just sent to{" "}
              <span className="font-semibold text-ink">
                {blocked.ownerHint || "the shop owner"}
              </span>
              . As soon as they approve, sign in again — you'll then set a
              permanent password.
            </>
          ),
        };
      case "pending_still":
        return {
          icon: <Clock3 className="w-7 h-7 text-yellow-reg" />,
          tint: "bg-yellow-reg/10 border-yellow-reg/40",
          title: "Still awaiting owner approval",
          body: (
            <>
              Your account for{" "}
              <span className="font-semibold text-ink">{blocked.email}</span> is
              still pending. Please wait for the shop owner to approve, then
              try again.
            </>
          ),
        };
      case "rejected":
        return {
          icon: <ShieldAlert className="w-7 h-7 text-danger" />,
          tint: "bg-danger/10 border-danger/40",
          title: "Account request rejected",
          body: (
            <>
              The owner has declined the account request for{" "}
              <span className="font-semibold text-ink">{blocked.email}</span>.
              {blocked.notes && (
                <span className="block mt-2 italic text-ink-mute">
                  "{blocked.notes}"
                </span>
              )}
              Please contact the shop owner if you believe this is an error.
            </>
          ),
        };
      case "expired":
        return {
          icon: <KeyRound className="w-7 h-7 text-danger" />,
          tint: "bg-danger/10 border-danger/40",
          title: "Temporary password expired",
          body: (
            <>
              The temporary password for{" "}
              <span className="font-semibold text-ink">{blocked.email}</span>{" "}
              has expired. Tap "Request a new one" below and the owner will
              re-issue one.
            </>
          ),
        };
      case "request_failed":
        return {
          icon: <ShieldAlert className="w-7 h-7 text-danger" />,
          tint: "bg-danger/10 border-danger/40",
          title: "Approval request not sent",
          body: (
            <>
              You signed in, but your approval request for{" "}
              <span className="font-semibold text-ink">{blocked.email}</span>{" "}
              could not be filed, so the shop owner would not see it.
              <span className="block mt-2 text-ink-mute">{blocked.message}</span>
              Sign in again to retry — your temporary password is still valid.
            </>
          ),
        };
    }
  })();

  return (
    <div className={`paper-card p-6 border-2 ${cfg.tint}`}>
      <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center border">
        {cfg.icon}
      </div>
      <h2 className="font-display text-xl md:text-2xl font-bold mt-3">
        {cfg.title}
      </h2>
      <p className="text-sm text-ink mt-2 leading-relaxed">{cfg.body}</p>
      <div className="mt-5 flex flex-col gap-2">
        <button onClick={onReset} className="btn btn-primary h-11">
          <ArrowRight className="w-4 h-4" /> Back to sign in
        </button>
        {blocked.type === "expired" && (
          <button onClick={onForgot} className="btn btn-outline h-11">
            <KeyRound className="w-4 h-4" /> Request a new one
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
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-end md:items-center justify-center p-0 md:p-4 animate-fade-in">
      <div className="paper-card w-full max-w-sm overflow-hidden max-h-[95dvh] flex flex-col rounded-t-2xl md:rounded-xl">
        <div className="p-5 border-b flex items-center justify-between shrink-0">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-ink-mute">
              Password help
            </div>
            <h2 className="font-display text-xl font-bold">Forgot password</h2>
          </div>
          <button onClick={onClose} className="btn btn-ghost h-9 w-9 p-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto scroll-lined">
          {sent ? (
            <div className="p-6 text-center space-y-3">
              <div className="w-14 h-14 rounded-full bg-success/10 mx-auto flex items-center justify-center">
                <ShieldQuestion className="w-6 h-6 text-success" />
              </div>
              <h3 className="font-display text-lg font-bold">Request sent</h3>
              <p className="text-sm text-ink-mute">
                A reset request for{" "}
                <span className="font-semibold text-ink">{sent}</span> was sent
                to the shop owner. Once approved a temporary password will be
                shared with you directly by the owner.
              </p>
              <button onClick={onClose} className="btn btn-primary w-full">
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="p-5 space-y-4">
              <p className="text-sm text-ink-mute">
                Enter the work email registered on your employee account. The
                shop owner will receive an approval request and, once approved,
                will share a temporary password with you directly.
              </p>
              <div>
                <label htmlFor="login-forgot-email" className="label">Registered work email</label>
                <div className="mt-1 relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
                  <input
                    id="login-forgot-email"
                    autoFocus
                    type="email"
                    required
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input pl-9"
                    placeholder="you@printshop.co"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary w-full h-11"
              >
                <KeyRound className="w-4 h-4" />
                {loading ? "Submitting..." : "Send request to shop owner"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
