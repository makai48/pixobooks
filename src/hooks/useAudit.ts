import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { AuditLogRow } from "@/types";
import { useActiveBusiness } from "@/hooks/useBusinesses";

export function useAuditLogs(limit = 500) {
  const active = useActiveBusiness();
  const businessId = active === "none" ? null : active;
  return useQuery({
    queryKey: ["audit_logs", businessId, limit],
    queryFn: async () => {
      let q = supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (businessId) q = q.eq("business_id", businessId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as AuditLogRow[];
    },
    refetchInterval: 30000,
  });
}
