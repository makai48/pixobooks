// Identity resolution — one place that decides WHO performed an action.
// Root cause of "Unknown" cashiers: call sites used `profile?.name || "Unknown"`,
// but profile is null when the user_profiles row is missing (deleted account,
// RLS hiccup, or load failure) even though an auth user is logged in.
// Rule: a logged-in user is NEVER "Unknown" — fall back to the auth email
// prefix. Only return undefined when there is no session at all.
import type { User } from "@supabase/supabase-js";
import type { Employee } from "@/types";

export type Actor = { id: string; name: string; role?: string };

export function resolveActor(
  profile: Employee | null | undefined,
  user: User | null | undefined
): Actor | undefined {
  const email = profile?.email || user?.email || "";
  const id = profile?.id || user?.id || "";
  if (!id && !email) return undefined;
  const name =
    (profile?.name || "").trim() || email.split("@")[0] || "Unknown";
  return { id, name, role: profile?.role };
}
