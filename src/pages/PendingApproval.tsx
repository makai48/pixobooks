import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Clock3, LogOut, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

/**
 * Landing screen shown to users whose account is awaiting admin approval.
 * The main entry point is via the Login form's blocked panel, but this
 * page is exposed so users can be linked directly (deep link / bookmark).
 */
export default function PendingApproval() {
  const nav = useNavigate();
  const { user, profile, loading, logout } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      nav("/login", { replace: true });
      return;
    }
    if (profile?.approvalStatus === "approved" && !profile.mustChangePassword) {
      nav("/", { replace: true });
    } else if (profile?.approvalStatus === "approved" && profile.mustChangePassword) {
      nav("/change-password", { replace: true });
    }
  }, [user, profile, loading, nav]);

  return (
    <div className="min-h-[100dvh] bg-paper flex items-center justify-center p-4 md:p-6">
      <div className="w-full max-w-md paper-card p-6 md:p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-yellow-reg/10 mx-auto flex items-center justify-center animate-pulse">
          <Clock3 className="w-8 h-8 text-yellow-reg" />
        </div>
        <div className="text-[11px] uppercase tracking-widest text-ink-mute mt-4">
          Awaiting approval
        </div>
        <h2 className="font-display text-2xl md:text-3xl font-bold mt-1">
          Your account is pending
        </h2>
        <p className="text-sm text-ink-mute mt-3 leading-relaxed">
          Thanks — your first sign-in has been logged. An approval request has
          been sent to the shop admin. As soon as they approve, sign in again
          and you'll be asked to set a permanent password.
        </p>

        <div className="mt-5 rounded-lg border border-line p-3 text-xs text-ink-mute bg-paper/40">
          <div className="uppercase tracking-widest text-[10px]">Signed in as</div>
          <div className="mt-1 font-semibold text-ink">{profile?.email || user?.email}</div>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <button
            onClick={() => window.location.reload()}
            className="btn btn-outline h-11"
          >
            <RefreshCw className="w-4 h-4" /> Check status again
          </button>
          <button
            onClick={async () => {
              await logout();
              nav("/login");
            }}
            className="btn btn-ghost h-10 text-ink-mute"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
