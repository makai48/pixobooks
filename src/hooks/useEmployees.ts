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

export function useUpdateEmployee() {
  const qc = useQueryClient();
  const active = useActiveBusiness();
  return useMutation({
    mutationFn: async (e: Partial<Employee> & { id: string }) => {
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
      if (e.role !== undefined && active !== "none") {
        const { error: memErr } = await supabase
          .from("business_members")
          .update({ role: membershipRole(e.role) })
          .eq("business_id", active)
          .eq("user_id", e.id);
        if (memErr) throw memErr;
      }
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
};

/**
 * NEW ONBOARDING FLOW (invite-employee edge function).
 *
 *  1. Owner calls this hook with the invitee's email + name + role.
 *  2. The edge function creates the auth user with a securely-generated
 *     temporary password and sets user_profiles.approval_status =
 *     'pending_first_login', active = false, must_change_password = true and
 *     temp_password_expires_at = now + expirationHours.
 *  3. The hook returns the temporary password + expiry so the owner can share
 *     it with the invitee (email, SMS, WhatsApp, print).
 *  4. When the invitee logs in with the temp password, the Login screen turns
 *     the profile into 'pending_approval' and inserts an account approval
 *     request. Only after the owner approves does the account become active,
 *     and the first login after approval forces a permanent password.
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

export function useDeleteEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: DeleteEmployeeInput) => {
      let edgeError: string | null = null;
      const { error } = await supabase.functions.invoke("delete-employee", {
        body: { userId: p.id },
      });
      if (error) {
        edgeError = error.message;
        if (error instanceof FunctionsHttpError) {
          try {
            const status = error.context?.status ?? 500;
            const text = await error.context?.text();
            edgeError = `[${status}] ${text || error.message}`;
          } catch {
            // ignore
          }
        }
        if (import.meta.env.DEV) console.warn("delete-employee edge invoke failed:", edgeError);
        const { error: pErr } = await supabase
          .from("user_profiles")
          .delete()
          .eq("id", p.id);
        if (pErr) throw new Error(edgeError || pErr.message);
        // Membership rows are only cascade-deleted when the auth user is
        // removed; the profile-only fallback must clear them explicitly.
        await supabase.from("business_members").delete().eq("user_id", p.id);
      }
      if (p.actor) {
        await logAudit(p.actor, "employee.delete", "user", p.id, {
          name: p.name,
          fully_removed: !edgeError,
          edge_error: edgeError,
        });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}
