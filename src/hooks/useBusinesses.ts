import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase";

export type MasterScope = "shared" | "per_branch";
export type LegacyAdminAccess = "none" | "platform_admin" | "supreme" | "delegate";

export type Business = {
  id: string;
  name: string;
  masterScope: MasterScope;
  legacyAdminAccess: LegacyAdminAccess;
  legacyAdminEmails: string[];
};

const ACTIVE_KEY = "pixobooks:active_business"; // uuid or "none"
const NONE = "none";

/** Fired whenever the active business changes (same tab + cross-tab via storage). */
export const BUSINESS_CHANGED_EVENT = "pixobooks:business-changed";

function readActive(): string {
  try {
    return localStorage.getItem(ACTIVE_KEY) || NONE;
  } catch {
    return NONE;
  }
}

/** Active business id for scoping queries/writes, or null when unset. */
export function getActiveBusinessId(): string | null {
  const v = readActive();
  return v === NONE || v === "" ? null : v;
}

export function setActiveBusiness(id: string | null) {
  try {
    localStorage.setItem(ACTIVE_KEY, id || NONE);
  } catch {
    /* private mode: context just won't persist */
  }
  window.dispatchEvent(new CustomEvent(BUSINESS_CHANGED_EVENT));
}

/** Reactive active-business id ("none" = not yet chosen). */
export function useActiveBusiness(): string {
  return useSyncExternalStore(
    (notify) => {
      const onCustom = () => notify();
      const onStorage = (e: StorageEvent) => {
        if (e.key === ACTIVE_KEY) notify();
      };
      window.addEventListener(BUSINESS_CHANGED_EVENT, onCustom);
      window.addEventListener("storage", onStorage);
      return () => {
        window.removeEventListener(BUSINESS_CHANGED_EVENT, onCustom);
        window.removeEventListener("storage", onStorage);
      };
    },
    readActive,
    () => NONE
  );
}

function mapBusiness(r: import("@/lib/mappers").DbRow): Business {
  return {
    id: r.id,
    name: r.name || "Business",
    masterScope: r.master_scope === "per_branch" ? "per_branch" : "shared",
    legacyAdminAccess:
      r.legacy_owner_access === "platform_admin" ||
      r.legacy_owner_access === "supreme" ||
      r.legacy_owner_access === "delegate"
        ? r.legacy_owner_access
        : "none",
    legacyAdminEmails: Array.isArray(r.legacy_owner_emails) ? r.legacy_owner_emails : [],
  };
}

export function useBusinesses() {
  return useQuery({
    queryKey: ["businesses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("businesses")
        .select("id, name, master_scope, legacy_owner_access, legacy_owner_emails")
        .order("created_at");
      if (error) throw error;
      return (data || []).map(mapBusiness);
    },
    staleTime: 60_000,
  });
}

export function useCreateBusiness() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      masterScope?: MasterScope;
      legacyAdminAccess?: LegacyAdminAccess;
      legacyAdminEmails?: string[];
    }) => {
      const clean = input.name.trim();
      if (!clean) throw new Error("Business name is required");
      const { data, error } = await supabase.rpc("create_business", {
        p_name: clean,
        p_master_scope: input.masterScope ?? "shared",
        p_legacy_owner_access: input.legacyAdminAccess ?? "none",
        p_legacy_owner_emails: input.legacyAdminEmails ?? [],
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: async (id) => {
      await qc.invalidateQueries({ queryKey: ["businesses"] });
      setActiveBusiness(id);
    },
  });
}
