import { supabase } from "./supabase";
import { MAX_FAILED_LOGINS, isShopOwner } from "@/types";

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
    // "user accounts kept losing their name / matched owner" bug.
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
   * account (owner exempt). Locked accounts refuse to sign in until an admin
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

    const isOwner = isShopOwner(trimmed, profile?.role);
    if (profile && !isOwner) {
      const locked = (profile.failed_login_count || 0) >= MAX_FAILED_LOGINS;
      const timeLocked = profile.locked_until
        ? new Date(profile.locked_until) > new Date()
        : false;
      if (locked || timeLocked) {
        throw new Error(
          "This account is locked after too many failed sign-in attempts. Please tap 'Forgot password' below so the shop owner can approve a reset."
        );
      }
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: trimmed,
      password,
    });

    if (error) {
      // Bump failed count (unless owner)
      if (profile && !isOwner) {
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
              " failed attempts. Please tap 'Forgot password' — the shop owner will approve a reset."
          );
        }
      }
      throw error;
    }

    // Success — clear failed counter
    if (data.user) {
      await supabase
        .from("user_profiles")
        .update({ failed_login_count: 0, locked_until: null })
        .eq("id", data.user.id);
    }
    return data.user;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },
};
