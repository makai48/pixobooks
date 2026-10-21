import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase";
import { BUSINESS_CHANGED_EVENT, getActiveBusinessId, useActiveBusiness } from "@/hooks/useBusinesses";
import { withBusiness } from "@/lib/tenant";

export type Branch = {
  id: string;
  name: string;
  isHeadOffice: boolean;
};

const LEGACY_KEY = "pixobooks:active_branch"; // uuid or "all" (pre-multi-business)
const EVT = "pixobooks:branch-changed";

/**
 * Storage key for the active branch. Scoped per business when one is active so
 * switching businesses does not leak another business's branch selection.
 * Falls back to the legacy shared key until a business is chosen.
 */
function activeKey(): string {
  const businessId = getActiveBusinessId();
  return businessId ? `${LEGACY_KEY}:${businessId}` : LEGACY_KEY;
}

function readActive(): string {
  try {
    const key = activeKey();
    const v = localStorage.getItem(key);
    // Transitional: the business-scoped key has never been written yet, so
    // honour the user's pre-existing (unscoped) selection.
    if (!v && key !== LEGACY_KEY) {
      return localStorage.getItem(LEGACY_KEY) || "all";
    }
    return v || "all";
  } catch {
    return "all";
  }
}

/** Branch id for tagging new documents, or null when "All branches". */
export function getActiveBranchId(): string | null {
  const v = readActive();
  return v === "all" || v === "" ? null : v;
}

export function setActiveBranch(id: string | "all") {
  try {
    localStorage.setItem(activeKey(), id);
  } catch {
    /* private mode: context just won't persist */
  }
  window.dispatchEvent(new CustomEvent(EVT));
}

/** Reactive active-branch id ("all" = every branch). Re-renders on change + cross-tab. */
export function useActiveBranch(): string {
  return useSyncExternalStore(
    (notify) => {
      const onCustom = () => notify();
      const onStorage = (e: StorageEvent) => {
        if (e.key === LEGACY_KEY || (e.key || "").startsWith(`${LEGACY_KEY}:`)) notify();
      };
      window.addEventListener(EVT, onCustom);
      window.addEventListener(BUSINESS_CHANGED_EVENT, onCustom);
      window.addEventListener("storage", onStorage);
      return () => {
        window.removeEventListener(EVT, onCustom);
        window.removeEventListener(BUSINESS_CHANGED_EVENT, onCustom);
        window.removeEventListener("storage", onStorage);
      };
    },
    readActive,
    () => "all"
  );
}

function mapBranch(r: import("@/lib/mappers").DbRow): Branch {
  return { id: r.id, name: r.name || "Branch", isHeadOffice: !!r.is_head_office };
}

export function useBranches() {
  const active = useActiveBusiness();
  const businessId = active === "none" ? null : active;
  return useQuery({
    queryKey: ["branches", businessId],
    queryFn: async () => {
      let q = supabase
        .from("branches")
        .select("id, name, is_head_office")
        .order("is_head_office", { ascending: false })
        .order("name");
      if (businessId) q = q.eq("business_id", businessId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map(mapBranch);
    },
    staleTime: 60_000,
  });
}

export function useCreateBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const clean = name.trim();
      if (!clean) throw new Error("Branch name is required");
      const { data, error } = await supabase
        .from("branches")
        .insert(withBusiness({ name: clean }))
        .select("id, name, is_head_office")
        .single();
      if (error) throw error;
      return mapBranch(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["branches"] }),
  });
}

export function useDeleteBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("branches").delete().eq("id", id);
      if (error) throw error;
      if (getActiveBranchId() === id) setActiveBranch("all");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["branches"] }),
  });
}
