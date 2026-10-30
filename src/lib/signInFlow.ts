/**
 * Pure first-sign-in decisions.
 *
 * The login flow has several branches (temp password expiry, rejected, two
 * pending states, forced password change). Keeping the decision table here —
 * instead of spread through JSX in Login — makes it unit-testable and keeps the
 * page focused on navigation.
 */

export type SignInGate =
  | { type: "rejected"; notes?: string | null }
  | { type: "expired" }
  | { type: "pending_first_login"; requestedAt?: string | null }
  | { type: "pending_approval"; requestedAt?: string | null }
  | { type: "approved"; mustChangePassword: boolean };

export type SignInProfile = {
  approvalStatus?: string | null;
  mustChangePassword?: boolean | null;
  tempPasswordExpiresAt?: string | null;
  approvalRequestedAt?: string | null;
  notes?: string | null;
};

/** True only for a parseable timestamp in the past (never blocks on junk data). */
export function isTempPasswordExpired(
  iso: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!iso) return false;
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return false;
  return at < now.getTime();
}

export function resolveSignInGate(
  profile: SignInProfile,
  now: Date = new Date()
): SignInGate {
  const status = (profile.approvalStatus || "approved").toLowerCase();
  const mustChangePassword = !!profile.mustChangePassword;
  const expired = isTempPasswordExpired(profile.tempPasswordExpiresAt, now);

  // Rejection is final — show it even when the temp password also lapsed.
  if (status === "rejected") {
    return { type: "rejected", notes: profile.notes ?? null };
  }

  if (status === "pending_first_login") {
    // The temp password is the only way in; an expired one is a hard stop.
    if (expired) return { type: "expired" };
    return {
      type: "pending_first_login",
      requestedAt: profile.approvalRequestedAt ?? null,
    };
  }

  if (status === "pending_approval") {
    // Approval refreshes the temp-password window, so there is nothing the
    // employee can do (and no reset to request) until the owner acts.
    return {
      type: "pending_approval",
      requestedAt: profile.approvalRequestedAt ?? null,
    };
  }

  // Approved: they still need the temp credential until they replace it.
  if (mustChangePassword && expired) {
    return { type: "expired" };
  }

  return { type: "approved", mustChangePassword };
}

/**
 * Turn raw Supabase/GoTrue sign-in failures into actionable copy.
 * Unknown errors are passed through unchanged so nothing is hidden.
 */
export function describeSignInError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const msg = raw.toLowerCase();

  if (!raw) return "Sign in failed";

  if (msg.includes("database error querying schema")) {
    return "This account's sign-in record is incomplete, so PixoBooks could not finish the login. Ask the shop owner to re-issue your temporary password.";
  }
  if (msg.includes("email not confirmed")) {
    return "This email is not confirmed yet. Ask the shop owner to re-issue your temporary password.";
  }
  if (msg.includes("invalid login credentials")) {
    return "Email or temporary password is incorrect. Temporary passwords are case-sensitive — copy it exactly as it was shared.";
  }
  if (msg.includes("failed to fetch") || msg.includes("networkerror")) {
    return "Could not reach PixoBooks. Check your connection and try again.";
  }

  return raw;
}

/**
 * Only real credential failures should increment the lockout counter. A schema
 * or network fault must never lock an employee out of a fresh account.
 */
export function isWrongPasswordError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  return msg.includes("invalid login credentials") || msg.includes("invalid_grant");
}

/**
 * Explain failures from `supabase.auth.updateUser({ password, current_password })`.
 *
 * Projects with GoTrue's `SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD`
 * return the same "Current password required when setting new password."
 * message for both a missing and a wrong current password, so the copy has to
 * cover both without blaming the user for a missing field we do send.
 */
export function describePasswordUpdateError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const msg = raw.toLowerCase();

  if (!raw) return "Could not update your password.";

  if (msg.includes("current password")) {
    return "That current password is not right. Enter the temporary password you signed in with — it is case-sensitive.";
  }
  if (msg.includes("different from the old password") || msg.includes("same password")) {
    return "Your new password must be different from your current one.";
  }
  if (msg.includes("failed to fetch") || msg.includes("networkerror")) {
    return "Could not reach PixoBooks. Check your connection and try again.";
  }
  if (msg.includes("session") && (msg.includes("missing") || msg.includes("expired"))) {
    return "Your session expired. Sign in again to set a new password.";
  }

  return raw;
}
