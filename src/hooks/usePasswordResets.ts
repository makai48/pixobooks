import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { PasswordResetRequest } from "@/types";
import { logAudit } from "@/lib/audit";
import { useActiveBusiness } from "@/hooks/useBusinesses";

function map(r: import("@/lib/mappers").DbRow): PasswordResetRequest {
  return {
    id: r.id,
    email: r.email,
    employeeId: r.employee_id,
    employeeName: r.employee_name,
    status: r.status,
    requestedAt: r.requested_at,
    approvedAt: r.approved_at,
    approvedBy: r.approved_by,
    approvedByName: r.approved_by_name,
    tempPassword: r.temp_password,
    tempPasswordExpiresAt: r.temp_password_expires_at,
    notes: r.notes,
  };
}

export function usePasswordResetRequests() {
  const active = useActiveBusiness();
  const businessId = active === "none" ? null : active;
  return useQuery({
    queryKey: ["password_reset_requests", businessId],
    queryFn: async () => {
      let q = supabase
        .from("password_reset_requests")
        .select("*")
        .order("requested_at", { ascending: false })
        .limit(200);
      if (businessId) q = q.eq("business_id", businessId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map(map);
    },
    // Poll frequently so the owner sees new requests within seconds.
    refetchInterval: 8000,
    refetchOnWindowFocus: true,
  });
}

/**
 * Creates a password reset request via the `request-password-reset` edge
 * function. The Login page is anonymous — RLS blocks it from reading
 * user_profiles directly — so the edge function uses the service role to
 * validate the email and insert the request. This is what fixes "reset
 * requests never reach the owner" issue.
 */
export function useCreatePasswordResetRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (email: string) => {
      const normalized = email.trim().toLowerCase();
      if (!normalized) throw new Error("Email is required");

      const { data, error } = await supabase.functions.invoke(
        "request-password-reset",
        { body: { email: normalized } }
      );

      if (error) {
        let msg = error.message || "Reset request failed";
        if (error instanceof FunctionsHttpError) {
          try {
            const text = await error.context?.text();
            if (text) {
              try {
                const parsed = JSON.parse(text);
                msg = parsed?.error || text;
              } catch {
                msg = text;
              }
            }
          } catch {
            /* ignore */
          }
        }
        throw new Error(msg);
      }

      if (data?.error) throw new Error(data.error);
      if (!data?.request) throw new Error("No request returned from server");
      return map(data.request);
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["password_reset_requests"] }),
  });
}

export type PasswordResetApprovalResult = {
  requestId: string;
  userId: string;
  email: string;
  employeeName: string;
  tempPassword: string;
  expiresAt: string;
  expirationHours: number;
};

/**
 * APPROVE a password reset by (a) generating a secure temp password,
 * (b) actually resetting the auth.users password via the
 * `admin_create_or_reset_user` SQL RPC through a service-role edge
 * function, (c) flagging the account with must_change_password + an
 * expiry, (d) unlocking the account, and (e) stamping the request row
 * with status='approved' + storing the temp password briefly so the
 * owner can re-view / re-share it inside the secure result modal.
 *
 * This replaces the previous approve-flow which only wrote the temp
 * password to the request table but never applied it to auth.users —
 * the reason employees could not actually sign in with the "approved"
 * temp password.
 */
export function useApprovePasswordReset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      request,
      approver,
      expirationHours,
    }: {
      request: PasswordResetRequest;
      approver: { id: string; name: string; role?: string };
      expirationHours?: number;
    }) => {
      const { data, error } = await supabase.functions.invoke(
        "reset-employee-password",
        {
          body: {
            requestId: request.id,
            approverName: approver.name,
            expirationHours: expirationHours ?? 24,
          },
        }
      );

      if (error) {
        let msg = error.message || "Approve failed";
        if (error instanceof FunctionsHttpError) {
          try {
            const status = error.context?.status ?? 500;
            const text = await error.context?.text();
            if (text) {
              try {
                const parsed = JSON.parse(text);
                msg = `[${status}] ${parsed?.error || text}`;
              } catch {
                msg = `[${status}] ${text}`;
              }
            }
          } catch {
            /* ignore */
          }
        }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      if (!data?.tempPassword)
        throw new Error("Server returned no temporary password");

      const result: PasswordResetApprovalResult = {
        requestId: data.requestId,
        userId: data.userId,
        email: data.email,
        employeeName: data.employeeName,
        tempPassword: data.tempPassword,
        expiresAt: data.expiresAt,
        expirationHours: data.expirationHours,
      };
      return result;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["password_reset_requests"] }),
  });
}

export function useRejectPasswordReset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      request,
      approver,
      notes,
    }: {
      request: PasswordResetRequest;
      approver: { id: string; name: string; role?: string };
      notes?: string;
    }) => {
      const { error } = await supabase
        .from("password_reset_requests")
        .update({
          status: "rejected",
          approved_at: new Date().toISOString(),
          approved_by: approver.id,
          approved_by_name: approver.name,
          notes: notes || null,
        })
        .eq("id", request.id);
      if (error) throw error;

      await logAudit(
        approver,
        "password_reset.reject",
        "user",
        request.employeeId || undefined,
        { email: request.email, notes }
      );
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["password_reset_requests"] }),
  });
}

/**
 * Immediately clear the stored temp password from a request row —
 * called after the owner dismisses the secure result modal so the
 * password is not left permanently in the database.
 */
export function useClearStoredTempPassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase
        .from("password_reset_requests")
        .update({ temp_password: null })
        .eq("id", requestId);
      if (error) throw error;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["password_reset_requests"] }),
  });
}
