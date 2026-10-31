import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { mapEmployee } from "@/lib/mappers";
import type { Employee, Permission } from "@/types";
import { DEFAULT_STAFF_PERMISSIONS, DEFAULT_TEMP_PASSWORD_HOURS } from "@/types";
import { logAudit } from "@/lib/audit";
import { useActiveBusiness } from "@/hooks/useBusinesses";

/** Map a free-text job title to a tenant membership role. */
function membershipRole(role: string): "owner" | "manager" | "staff" {
  const r = (role || "").trim().toLowerCase();
  if (r === "owner") return "owner";
  if (r === "manager") return "manager";
  return "staff";
}

export function useEmployees() {
  const active = useActiveBusiness();
  const businessId = active === "none" ? null : active;
  return useQuery({
    queryKey: ["employees", businessId],
    queryFn: async () => {
      let q = supabase.from("user_profiles").select("*").order("username");
      if (businessId) {
        const { data: members, error: memErr } = await supabase
          .from("business_members")
          .select("user_id")
          .eq("business_id", businessId);
        if (memErr) throw memErr;
        const ids = (members || []).map((m) => m.user_id as string);
        if (ids.length === 0) return [];
        q = q.in("id", ids);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map(mapEmployee);
    },
    refetchInterval: 60000,
  });
}

export type UpdateEmployeeResult = {
  /** Set when the profile saved but the tenant role sync was refused
   *  (e.g. the editor lacks membership-write rights). The edit itself
   *  is persisted — only the RLS role mirror needs an owner re-save. */
  roleSyncWarning: string | null;
};

export function useUpdateEmployee() {
  const qc = useQueryClient();
  const active = useActiveBusiness();
  return useMutation<UpdateEmployeeResult, Error, Partial<Employee> & { id: string }>({
    mutationFn: async (e) => {
      const payload: Record<string, unknown> = {};
      if (e.name !== undefined) payload.username = e.name;
      if (e.role !== undefined) payload.role = e.role;
      if (e.pin !== undefined) payload.pin = e.pin || null;
      if (e.permissions !== undefined) payload.permissions = e.permissions;
      if (e.active !== undefined) payload.active = e.active;
      if (e.avatarUrl !== undefined) payload.avatar_url = e.avatarUrl;
      if (e.phone !== undefined) payload.phone = e.phone;
      if (e.address !== undefined) payload.address = e.address;
      if (e.hireDate !== undefined) payload.hire_date = e.hireDate;
      if (e.emergencyContact !== undefined)
        payload.emergency_contact = e.emergencyContact;
      if (e.emergencyContactPhone !== undefined)
        payload.emergency_contact_phone = e.emergencyContactPhone;
      if (e.notes !== undefined) payload.notes = e.notes;
      if (e.salary !== undefined) payload.salary = e.salary;
      const { error } = await supabase
        .from("user_profiles")
        .update(payload)
        .eq("id", e.id);
      if (error) throw error;

      // Keep tenant privileges in sync with the profile role so a promoted
      // manager actually gains owner/manager RLS rights in this business.
      // Best-effort AFTER the profile save: the edit above already
      // succeeded, and editors without membership-write rights must still
      // be able to save. A refusal is returned as a warning, never thrown.
      let roleSyncWarning: string | null = null;
      if (e.role !== undefined && active !== "none") {
        const { error: memErr } = await supabase
          .from("business_members")
          .update({ role: membershipRole(e.role) })
          .eq("business_id", active)
          .eq("user_id", e.id);
        if (memErr) roleSyncWarning = memErr.message;
      }
      return { roleSyncWarning };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}

export function useSetPermissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, permissions }: { id: string; permissions: Permission[] }) => {
      const { error } = await supabase
        .from("user_profiles")
        .update({ permissions })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}

export type InviteDeliveryStatus =
  | "sent"
  | "not_configured"
  | "no_recipient"
  | "failed";

export type InviteDelivery = {
  status: InviteDeliveryStatus;
  detail?: string;
};

export type InviteEmployeeInput = {
  email: string;
  name?: string;
  role?: string;
  permissions?: Permission[];
  expirationHours?: number;
  phone?: string | null;
  address?: string | null;
  hireDate?: string | null;
  emergencyContact?: string | null;
  emergencyContactPhone?: string | null;
  /** Used in the server-sent email/SMS body. */
  shopName?: string;
  actor?: { id: string; name: string; role?: string };
};

export type InviteEmployeeResult = {
  email: string;
  name: string;
  role: string;
  tempPassword: string;
  expiresAt: string;
  expirationHours: number;
  userId: string;
  /** Whether the edge function actually sent the invite, per channel. */
  delivery?: { email: InviteDelivery; sms: InviteDelivery };
};

/**
 * ONBOARDING FLOW (invite-employee edge function) — no approval step.
 *
 *  1. Owner calls this hook with the invitee's email + name + role.
 *  2. The edge function creates the auth user with a securely-generated
 *     temporary password and sets user_profiles.approval_status = 'approved',
 *     active = true, must_change_password = true and
 *     temp_password_expires_at = now + expirationHours.
 *  3. The hook returns the temporary password + expiry so the owner can share
 *     it with the invitee (email, SMS, WhatsApp, print).
 *  4. The invitee signs in with the temp password and is taken straight to
 *     /change-password. Until they set a permanent password, `must_change_password`
 *     keeps them out of the rest of the app.
 *
 * `account_approval_requests` / the Account Approvals page still exist for
 * accounts left in `pending_first_login` / `pending_approval` by older
 * invites; new invites never enter that path.
 */
export function useInviteEmployee() {
  const qc = useQueryClient();
  const active = useActiveBusiness();
  return useMutation<InviteEmployeeResult, Error, InviteEmployeeInput>({
    mutationFn: async (p) => {
      const email = (p.email || "").trim().toLowerCase();
      if (!email) throw new Error("Email required");
      const name = (p.name || email.split("@")[0]).trim();
      const role = (p.role || "Staff").trim();
      const permissions =
        p.permissions && p.permissions.length > 0
          ? p.permissions
          : DEFAULT_STAFF_PERMISSIONS;
      const expirationHours = p.expirationHours || DEFAULT_TEMP_PASSWORD_HOURS;

      const { data, error } = await supabase.functions.invoke("invite-employee", {
        body: {
          email,
          name,
          role,
          permissions,
          expirationHours,
          phone: p.phone ?? null,
          address: p.address ?? null,
          hireDate: p.hireDate ?? null,
          emergencyContact: p.emergencyContact ?? null,
          emergencyContactPhone: p.emergencyContactPhone ?? null,
          inviterName: p.actor?.name || "Owner",
          shopName: p.shopName || undefined,
          businessId: active === "none" ? null : active,
        },
      });

      if (error) {
        let msg = error.message || "Invite failed";
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
      if (!data?.tempPassword) throw new Error("No temp password returned");

      if (p.actor) {
        await logAudit(p.actor, "employee.invite", "user", data.userId, {
          email,
          name,
          role,
          expiresAt: data.expiresAt,
        });
      }

      return data as InviteEmployeeResult;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}

export type DeleteEmployeeInput = {
  id: string;
  name: string;
  actor?: { id: string; name: string; role?: string };
};

/**
 * Turn a failed `functions.invoke` into a message that names the real cause.
 * `FunctionsHttpError.context` is a `Response`, and reading its body once is
 * all we get, so the JSON `{ error }` is extracted here.
 */
async function describeDeleteFailure(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const status = error.context?.status;
    const prefix = status ? `Delete failed (${status})` : "Delete failed";
    try {
      const text = await error.context?.text();
      if (text) {
        try {
          const parsed = JSON.parse(text) as { error?: unknown };
          if (typeof parsed?.error === "string" && parsed.error) {
            return `${prefix}: ${parsed.error}`;
          }
        } catch {
          // Not JSON — fall through and use the raw body.
        }
        return `${prefix}: ${text}`;
      }
    } catch {
      // Body already consumed or unreadable.
    }
    return `${prefix}: ${error.message}`;
  }
  return error instanceof Error ? error.message : "Delete failed";
}

/**
 * Permanently delete an employee.
 *
 * The edge function is the ONLY thing that can remove the `auth.users` row, so
 * a failed invoke must surface as an error. The previous version fell back to
 * deleting just `user_profiles` and then resolved, which is why the UI said
 * "deleted" while the account stayed in Supabase: the app lost sight of the
 * user but the login still existed. There is no profile-only fallback now.
 */
export function useDeleteEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: DeleteEmployeeInput) => {
      const { data, error } = await supabase.functions.invoke("delete-employee", {
        body: { userId: p.id },
      });

      if (error) {
        const message = await describeDeleteFailure(error);
        if (import.meta.env.DEV) console.warn("delete-employee failed:", message);
        throw new Error(message);
      }

      // A 200 response can still carry a refusal (older deployments returned
      // `{ success: false }` instead of a non-2xx status). Never treat that as
      // a completed delete.
      if (data && typeof data === "object") {
        const body = data as { success?: boolean; error?: string };
        if (body.success === false) {
          throw new Error(body.error || "Delete failed");
        }
      }

      if (p.actor) {
        await logAudit(p.actor, "employee.delete", "user", p.id, {
          name: p.name,
          fully_removed: true,
        });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}
