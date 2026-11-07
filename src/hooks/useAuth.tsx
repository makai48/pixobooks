import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { mapEmployee } from "@/lib/mappers";
import type { Employee, Permission } from "@/types";
import { isShopAdmin } from "@/types";

type AuthCtx = {
  user: User | null;
  profile: Employee | null;
  loading: boolean;
  can: (perm: Permission) => boolean;
  canViewCosts: boolean;
  isAdmin: boolean;
  isAppAdmin: boolean;
  /** @deprecated Use isAdmin. */
  isOwner: boolean;
  /** @deprecated Use isAppAdmin. */
  isAppOwner: boolean;
  refreshProfile: () => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

const PROFILE_SNAPSHOT_KEY = "pixobooks:profile_snapshot";

function readProfileSnapshot(): Employee | null {
  try {
    const raw = localStorage.getItem(PROFILE_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Employee;
    if (!parsed || typeof parsed !== "object" || !parsed.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeProfileSnapshot(p: Employee | null): void {
  try {
    if (!p) {
      localStorage.removeItem(PROFILE_SNAPSHOT_KEY);
      return;
    }
    localStorage.setItem(PROFILE_SNAPSHOT_KEY, JSON.stringify(p));
  } catch {
    // private mode — session just won't survive refresh
  }
}

/**
 * Runtime safeguard: fills a missing username. Access itself is
 * ROLE-based (any email can administer; the first registered user becomes Admin).
 * The database trigger `enforce_owner_role_trg` guards the admin tier at
 * the storage layer, so no client-side demotion happens here.
 */
function sanitizeProfile(raw: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!raw) return raw;
  const copy = { ...raw } as Record<string, unknown>;
  if (!copy.username || String(copy.username).trim().length === 0) {
    copy.username = (String((raw as { email?: unknown }).email || "").split("@")[0]) || "Employee";
  }
  return copy;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // Seed from the last-known snapshot so tabs/permissions render instantly
  // on hard refresh while offline; the live fetch below replaces it.
  const [profile, setProfile] = useState<Employee | null>(() =>
    typeof window === "undefined" ? null : readProfileSnapshot()
  );
  const [loading, setLoading] = useState(true);

  async function loadProfile(uid: string) {
    const { data, error } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("id", uid)
      .maybeSingle();
    if (error) {
      if (import.meta.env.DEV) console.error("loadProfile failed", error);
      return;
    }
    if (!data) {
      setProfile(null);
      writeProfileSnapshot(null);
      return;
    }
    // Extra safety: the row we got MUST match the requested uid. If it
    // doesn't (impossible under normal RLS but paranoid guard), refuse.
    if (data.id !== uid) {
      if (import.meta.env.DEV) console.warn("loadProfile: id mismatch, refusing to load", { requested: uid, got: data.id });
      setProfile(null);
      writeProfileSnapshot(null);
      return;
    }
    const clean = sanitizeProfile(data);
    if (!clean) {
      setProfile(null);
      writeProfileSnapshot(null);
      return;
    }
    const emp = mapEmployee(clean);
    setProfile(emp);
    writeProfileSnapshot(emp);
  }

  useEffect(() => {
    let mounted = true;
    // Safety: never trap the app on the loading screen — if session
    // lookup hangs (offline/storage failure), release after 8s.
    const safety = window.setTimeout(() => {
      if (mounted) setLoading(false);
    }, 8000);

    supabase.auth
      .getSession()
      .then(async ({ data: { session } }) => {
        if (!mounted) return;
        if (session?.user) {
          setUser(session.user);
          try {
            await loadProfile(session.user.id);
          } catch {
            // profile stays null — app still opens with safe defaults
          }
        }
        if (mounted) setLoading(false);
      })
      .catch(() => {
        if (mounted) setLoading(false);
      })
      .finally(() => window.clearTimeout(safety));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      if (event === "SIGNED_IN" && session?.user) {
        // Clear any stale profile from a previous session BEFORE loading
        // this user's profile, so we never briefly render another user's
        // data during the fetch. This kills "profile flashes as admin then
        // switches" style bugs.
        setProfile(null);
        setUser(session.user);
        try {
          await loadProfile(session.user.id);
        } finally {
          setLoading(false);
        }
      } else if (event === "SIGNED_OUT") {
        setUser(null);
        setProfile(null);
        writeProfileSnapshot(null);
        setLoading(false);
      } else if (event === "TOKEN_REFRESHED" && session?.user) {
        setUser(session.user);
      } else if (event === "USER_UPDATED" && session?.user) {
        setUser(session.user);
        await loadProfile(session.user.id);
      }
    });

    return () => {
      mounted = false;
      window.clearTimeout(safety);
      subscription.unsubscribe();
    };
  }, []);

  const roleLower = profile?.role?.toLowerCase() || "";
  // Access is role-based (any email): legacy supreme email still counts.
  const isAppAdmin = isShopAdmin(profile?.email || user?.email, profile?.role);
  const isAdmin = roleLower === "admin" || roleLower === "admin";
  const isManager = roleLower === "manager" || roleLower.includes("manager");

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      profile,
      loading,
      isAdmin,
      isAppAdmin,
      isOwner: isAdmin,
      isAppOwner: isAppAdmin,
      canViewCosts:
        isAppAdmin ||
        isAdmin ||
        isManager ||
        (profile?.permissions.includes("reports.viewCosts") ?? false),
      can: (perm) => {
        if (!profile) return false;
        if (isAppAdmin || isAdmin) return true;
        return profile.permissions.includes(perm);
      },
      refreshProfile: async () => {
        if (user) await loadProfile(user.id);
      },
      logout: async () => {
        await supabase.auth.signOut();
      },
    }),
    [user, profile, loading, isAdmin, isManager, isAppAdmin]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/**
 * Checks whether ANY shop admin (role='Admin', any email) is registered.
 * Open registration is only available while no admin exists (first user
 * becomes admin); afterwards team/branch accounts join via admin invite
 * or admin approval of the pending request.
 * The legacy "Owner" role string is still honored so pre-rename workspaces
 * keep their admin.
 */
export function useAppAdminStatus() {
  return useQuery({
    queryKey: ["app_admin_status"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("id, email, role")
        .in("role", ["Owner", "Admin"])
        .limit(1);
      if (error) throw error;
      const admin = (data || [])[0] || null;
      return {
        hasAdmin: !!admin,
        /** @deprecated Use hasAdmin. */
        hasOwner: !!admin,
        adminEmail: admin?.email || "",
        /** @deprecated Use adminEmail. */
        ownerEmail: admin?.email || "",
      };
    },
    staleTime: 30_000,
  });
}

/** @deprecated Use useAppAdminStatus. */
export function useAppOwnerStatus() {
  return useAppAdminStatus();
}
