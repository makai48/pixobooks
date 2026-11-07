import { supabase } from "./supabase";
import { MAX_FAILED_LOGINS, isShopAdmin } from "@/types";
import { isWrongPasswordError } from "./signInFlow";

/**
 * Create the signed-in user's own `user_profiles` row if it does not exist.
 *
 * WHY THIS EXISTS IN THE APP, NOT A TRIGGER
 * ----------------------------------------
 * `user_profiles` had no INSERT policy, so any insert not made by the service
 * role was rejected. An earlier fix added an `on_auth_user_created` trigger,
 * but GoTrue runs that trigger inside the user-creation transaction — any error
 * in it aborts the whole signup with `500 "Database error saving new user"`.
 * A trigger also cannot be made schema-agnostic from the app, so it is safer
 * to let the app create the row, where we can read the real columns back
 * first and only write the ones that exist.
 *
 * Idempotent: safe to call on every sign-in.
 */
export async function ensureOwnProfile(user: { id: string; email?: string | null }) {
  if (!user?.id) return;

  const { data: existing, error: readErr } = await supabase
    .from("user_profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  // RLS or a transient failure — never block sign-in on this.
  if (readErr || existing) return;

  // Read one real row to learn the actual column set (the schema is not
  // available to us at build time).
  const { data: sample } = await supabase
    .from("user_profiles")
    .select("*")
    .limit(1)
    .maybeSingle();
  const cols = sample ? Object.keys(sample) : ["id", "email", "username", "role"];

  const row: Record<string, unknown> = { id: user.id };
  if (cols.includes("email")) row.email = user.email || "";
  if (cols.includes("username")) row.username = (user.email || "user").split("@")[0];
  if (cols.includes("role")) row.role = "Staff";
  if (cols.includes("active")) row.active = true;
  if (cols.includes("approval_status")) row.approval_status = "approved";

  const { error } = await supabase.from("user_profiles").insert(row);
  if (error) {
    // Not fatal: the account exists, only the profile row is missing. The
    // admin's invite flow will create it.
    console.warn("[auth] could not create own profile:", error.message);
  }
}

export const authService = {
  /** data = onboarding metadata attached to the auth user (fanned out to profile + shop by trigger). */
  async sendOtp(email: string, data?: Record<string, unknown>) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, ...(data ? { data } : {}) },
    });
    if (error) throw error;
  },

  async verifyOtpAndSetPassword(
    email: string,
    token: string,
    password: string,
    username?: string,
    contact?: { displayName?: string; phone?: string }
  ) {
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "email",
    });
    if (error) throw error;

    // Display name + phone land in Supabase user metadata (visible in the
    // dashboard Users list) AND on user_profiles (via trigger + update below).
    // IMPORTANT: never clobber the invite-time username / display name unless
    // the caller explicitly supplied a new one. Blindly writing metadata here
    // used to overwrite user_profiles.username via the auth trigger — the
    // "user accounts kept losing their name / matched admin" bug.
    // display_name/full_name are only ever written here (invites set
    // username/role/permissions), so they can always be stored. username
    // stays conditional to preserve invite-time names (see above).
    const displayName =
      contact?.displayName?.trim() || username?.trim() || email.split("@")[0];
    const meta: Record<string, unknown> = {
      display_name: displayName,
      full_name: displayName,
    };
    if (username && username.trim()) meta.username = username.trim();
    if (contact?.phone) meta.phone = contact.phone;
    const payload: { password: string; data?: Record<string, unknown> } = {
      password,
      data: meta,
    };
    const { error: updErr } = await supabase.auth.updateUser(payload);
    if (updErr) throw updErr;
    return data.user;
  },

  /**
   * Sign in with credentials. If the credentials are wrong the user's
   * `failed_login_count` is incremented; hitting `MAX_FAILED_LOGINS` locks the
   * account (admin exempt). Locked accounts refuse to sign in until an admin
   * clears the counter via the password-reset approval flow.
   */
  async signIn(email: string, password: string) {
    const trimmed = email.trim().toLowerCase();

    // Look up current lockout state (best effort — RLS-friendly)
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("id, email, failed_login_count, locked_until, role")
      .ilike("email", trimmed)
      .maybeSingle();

    const isAdmin = isShopAdmin(trimmed, profile?.role);
    if (profile && !isAdmin) {
      const locked = (profile.failed_login_count || 0) >= MAX_FAILED_LOGINS;
      const timeLocked = profile.locked_until
        ? new Date(profile.locked_until) > new Date()
        : false;
      if (locked || timeLocked) {
        throw new Error(
          "This account is locked after too many failed sign-in attempts. Please tap 'Forgot password' below so the shop admin can approve a reset."
        );
      }
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: trimmed,
      password,
    });

    if (error) {
      // Only real credential failures count towards the lockout. A schema or
      // network fault must never lock an employee out of a fresh account.
      if (profile && !isAdmin && isWrongPasswordError(error)) {
        const next = (profile.failed_login_count || 0) + 1;
        const payload: Record<string, unknown> = { failed_login_count: next };
        if (next >= MAX_FAILED_LOGINS) {
          payload.locked_until = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
        }
        await supabase
          .from("user_profiles")
          .update(payload)
          .eq("id", profile.id);
        if (next >= MAX_FAILED_LOGINS) {
          throw new Error(
            "Account locked after " +
              MAX_FAILED_LOGINS +
              " failed attempts. Please tap 'Forgot password' — the shop admin will approve a reset."
          );
        }
      }
      throw error;
    }

    // Success — clear failed counter, and make sure a profile row exists.
    if (data.user) {
      await supabase
        .from("user_profiles")
        .update({ failed_login_count: 0, locked_until: null })
        .eq("id", data.user.id);

      // Best-effort: a self-registered account has no invite to create its
      // profile row, so create it here. Never blocks sign-in on failure.
      await ensureOwnProfile({
        id: data.user.id,
        email: data.user.email ?? null,
      });
    }
    return data.user;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },
};
