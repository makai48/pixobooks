import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { mapAccountApprovalRequest } from "@/lib/mappers";
import type { AccountApprovalRequest, Employee } from "@/types";
import { logAudit } from "@/lib/audit";
import { DEFAULT_STAFF_PERMISSIONS } from "@/types";
import { useActiveBusiness } from "@/hooks/useBusinesses";

/**
 * Live list of account-approval requests. Polled every 8s so the owner sees new
 * requests within seconds of the user logging in with their temp password.
 */
export function useAccountApprovalRequests() {
  const active = useActiveBusiness();
  const businessId = active === "none" ? null : active;
  return useQuery({
    queryKey: ["account_approval_requests", businessId],
    queryFn: async () => {
      let q = supabase
        .from("account_approval_requests")
        .select("*")
        .order("requested_at", { ascending: false })
        .limit(200);
      if (businessId) q = q.eq("business_id", businessId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map(mapAccountApprovalRequest) as AccountApprovalRequest[];
    },
    refetchInterval: 8000,
    refetchOnWindowFocus: true,
  });
}

export function useApproveAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      request,
      approver,
    }: {
      request: AccountApprovalRequest;
      approver: { id: string; name: string; role?: string };
    }) => {
      const now = new Date().toISOString();

      // Activate the user's profile (keep must_change_password so first login
      // after approval forces them to set a permanent password).
      const { error: profErr } = await supabase
        .from("user_profiles")
        .update({
          active: true,
          approval_status: "approved",
          approved_at: now,
          approved_by: approver.id,
          approved_by_name: approver.name,
          failed_login_count: 0,
          locked_until: null,
        })
        .eq("id", request.userId);
      if (profErr) throw profErr;

      // Close out the request row
      const { error: reqErr } = await supabase
        .from("account_approval_requests")
        .update({
          status: "approved",
          approved_at: now,
          approved_by: approver.id,
          approved_by_name: approver.name,
        })
        .eq("id", request.id);
      if (reqErr) throw reqErr;

      await logAudit(
        approver,
        "account.approve",
        "user",
        request.userId,
        { email: request.email, request_id: request.id }
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["account_approval_requests"] });
      qc.invalidateQueries({ queryKey: ["employees"] });
    },
  });
}

export function useRejectAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      request,
      approver,
      notes,
    }: {
      request: AccountApprovalRequest;
      approver: { id: string; name: string; role?: string };
      notes?: string;
    }) => {
      const now = new Date().toISOString();

      const { error: profErr } = await supabase
        .from("user_profiles")
        .update({
          active: false,
          approval_status: "rejected",
          approved_at: now,
          approved_by: approver.id,
          approved_by_name: approver.name,
        })
        .eq("id", request.userId);
      if (profErr) throw profErr;

      const { error: reqErr } = await supabase
        .from("account_approval_requests")
        .update({
          status: "rejected",
          approved_at: now,
          approved_by: approver.id,
          approved_by_name: approver.name,
          notes: notes || null,
        })
        .eq("id", request.id);
      if (reqErr) throw reqErr;

      await logAudit(
        approver,
        "account.reject",
        "user",
        request.userId,
        { email: request.email, notes }
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["account_approval_requests"] });
      qc.invalidateQueries({ queryKey: ["employees"] });
    },
  });
}

/**
 * Called by the Login screen after a user has successfully signed in with
 * their temp password for the very first time. Marks the profile as
 * "pending_approval" and inserts a request row for the owner.
 */
export async function createAccountApprovalRequest(user: Employee) {
  const now = new Date().toISOString();

  await supabase
    .from("user_profiles")
    .update({
      approval_status: "pending_approval",
      approval_requested_at: now,
    })
    .eq("id", user.id);

  const { data, error } = await supabase
    .from("account_approval_requests")
    .insert({
      user_id: user.id,
      employee_name: user.name || user.email || "Unnamed",
      email: user.email || "",
      role: user.role || null,
      status: "pending",
    })
    .select()
    .single();
  if (error) throw error;
  return mapAccountApprovalRequest(data);
}

export { DEFAULT_STAFF_PERMISSIONS };
