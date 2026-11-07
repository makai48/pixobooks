import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, Lock, ShieldCheck, LogOut, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { describePasswordUpdateError } from "@/lib/signInFlow";

/**
 * Forced password-change screen. Users land here on their first login after
 * the admin approves their account (must_change_password = true).
 *
 * WHY THE CURRENT PASSWORD IS ASKED FOR
 * -------------------------------------
 * Projects with `SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD` enabled
 * (GoTrue's default for hosted projects) reject `updateUser({ password })`
 * with "Current password required when setting new password." unless
 * `current_password` is sent with it. On this screen the "current" password is
 * the temporary one the employee just signed in with.
 */
export default function ChangePassword() {
  const nav = useNavigate();
  const { user, profile, loading, refreshProfile, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      nav("/login", { replace: true });
      return;
    }
    // If user doesn't actually need to change password, bounce them home.
    if (profile && !profile.mustChangePassword) {
      nav("/", { replace: true });
    }
  }, [user, profile, loading, nav]);

  const validate = () => {
    if (!currentPassword) return "Enter the temporary password you signed in with";
    if (password.length < 8) return "Password must be at least 8 characters";
    if (!/[A-Z]/.test(password)) return "Include at least one uppercase letter";
    if (!/[a-z]/.test(password)) return "Include at least one lowercase letter";
    if (!/[0-9]/.test(password)) return "Include at least one digit";
    if (password !== confirm) return "Passwords do not match";
    if (password === currentPassword)
      return "Your new password must be different from the current one";
    if (profile?.email && password.toLowerCase().includes(profile.email.split("@")[0].toLowerCase()))
      return "Password should not contain your email";
    return null;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) return toast.error(err);
    if (!user) return;

    setSubmitting(true);
    try {
      // 1. Change the auth-level password. `current_password` is required by
      //    GoTrue when update-password-require-current-password is enabled.
      const { error: authErr } = await supabase.auth.updateUser({
        password,
        current_password: currentPassword,
      });
      if (authErr) throw authErr;

      // 2. Clear the must_change_password + temp expiry flags on the profile
      const { error: profErr } = await supabase
        .from("user_profiles")
        .update({
          must_change_password: false,
          temp_password_expires_at: null,
        })
        .eq("id", user.id);
      if (profErr) throw profErr;

      await refreshProfile();
      toast.success("Password updated. Welcome to PixoBooks.");
      nav("/", { replace: true });
    } catch (err) {
      toast.error(describePasswordUpdateError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const strength = passwordStrength(password);

  return (
    <div className="min-h-[100dvh] bg-paper flex items-center justify-center p-4 md:p-6">
      <div className="w-full max-w-md paper-card p-6 md:p-8">
        <div className="w-14 h-14 rounded-full bg-magenta-reg/10 flex items-center justify-center">
          <KeyRound className="w-7 h-7 text-magenta-reg" />
        </div>
        <div className="text-[11px] uppercase tracking-widest text-ink-mute mt-4">
          First sign-in after approval
        </div>
        <h2 className="font-display text-2xl md:text-3xl font-bold mt-1">
          Set your permanent password
        </h2>
        <p className="text-sm text-ink-mute mt-2">
          Signed in as <span className="font-semibold text-ink">{profile?.email || user?.email}</span>.
          For your security, please replace the temporary password with a permanent one before continuing.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="cp-current-password" className="label">
              Current password
            </label>
            <div className="mt-1 relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
              <input
                id="cp-current-password"
                autoFocus
                type={show ? "text" : "password"}
                required
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="The temporary password you signed in with"
                className="input pl-9"
              />
            </div>
            <div className="text-[11px] text-ink-mute mt-1">
              Paste the temporary password you just used to sign in. It is
              case-sensitive.
            </div>
          </div>

          <div>
            <label htmlFor="cp-new-password" className="label">New password</label>
            <div className="mt-1 relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
              <input
                id="cp-new-password"
                type={show ? "text" : "password"}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="input pl-9 pr-9"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-mute hover:text-ink"
                tabIndex={-1}
              >
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {password && <StrengthMeter score={strength.score} label={strength.label} />}
          </div>

          <div>
            <label htmlFor="cp-confirm-password" className="label">Confirm new password</label>
            <div className="mt-1 relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
              <input
                id="cp-confirm-password"
                type={show ? "text" : "password"}
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="input pl-9"
                placeholder="Type it again"
              />
            </div>
            {confirm && password && confirm !== password && (
              <div className="text-[11px] text-danger mt-1">Passwords do not match</div>
            )}
          </div>

          <ul className="text-[11px] text-ink-mute space-y-1 border-l-2 border-line pl-3">
            <li>• At least 8 characters</li>
            <li>• Contains upper and lower case letters</li>
            <li>• Contains at least one digit</li>
            <li>• Does not contain your email prefix</li>
          </ul>

          <button
            type="submit"
            disabled={submitting}
            className="btn btn-primary w-full h-11"
          >
            <ShieldCheck className="w-4 h-4" />
            {submitting ? "Saving..." : "Save new password & continue"}
          </button>

          <button
            type="button"
            onClick={async () => {
              await logout();
              nav("/login");
            }}
            className="btn btn-ghost w-full h-10 text-ink-mute"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </form>
      </div>
    </div>
  );
}

function passwordStrength(pw: string) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ["Very weak", "Weak", "Fair", "Good", "Strong", "Excellent"];
  return { score, label: labels[score] || "Very weak" };
}

function StrengthMeter({ score, label }: { score: number; label: string }) {
  const colors = ["bg-danger", "bg-danger", "bg-yellow-reg", "bg-yellow-reg", "bg-success", "bg-success"];
  return (
    <div className="mt-1.5">
      <div className="flex gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded ${i < score ? colors[score] : "bg-line"}`}
          />
        ))}
      </div>
      <div className="text-[10px] text-ink-mute mt-1">Strength: {label}</div>
    </div>
  );
}
