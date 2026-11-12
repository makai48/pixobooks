import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useActiveBusiness } from "@/hooks/useBusinesses";
import { useAuth } from "@/hooks/useAuth";
import {
  mapNotification,
  mapNotificationKind,
  mapNotificationPolicy,
  mapNotificationPreference,
  mapNotificationSettings,
} from "@/lib/notifications/mappers";
import { NOTIFICATION_KIND_META } from "@/lib/notifications/catalog";
import type {
  AppNotification,
  NotificationKind,
  NotificationKindMeta,
  NotificationPolicy,
  NotificationPreference,
  NotificationRole,
  NotificationSettings,
} from "@/lib/notifications/types";

const INBOX_LIMIT = 120;

/**
 * The signed-in person's inbox.
 *
 * Rows are per recipient, so this query returns only what the gate selected
 * for this user — RLS enforces it again on the server.
 */
export function useNotifications() {
  const businessId = useActiveBusiness();
  return useQuery({
    queryKey: ["notifications", businessId],
    queryFn: async (): Promise<AppNotification[]> => {
      let q = supabase
        .from("notifications")
        .select("*")
        .is("dismissed_at", null)
        .order("created_at", { ascending: false })
        .limit(INBOX_LIMIT);
      if (businessId !== "none") q = q.eq("business_id", businessId);
      const { data, error } = await q;
      if (error) throw error;
      return ((data || []) as Record<string, any>[]).map(mapNotification);
    },
    enabled: businessId !== "none",
    staleTime: 20_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useUnreadCount(notifications: AppNotification[] | undefined): number {
  if (!notifications) return 0;
  return notifications.filter((n) => !n.readAt).length;
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id)
        .is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  const businessId = useActiveBusiness();
  return useMutation({
    mutationFn: async () => {
      let q = supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .is("read_at", null)
        .is("dismissed_at", null);
      if (businessId !== "none") q = q.eq("business_id", businessId);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useDismissNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ dismissed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

/** The catalog. Falls back to the bundled mirror when the table is absent. */
export function useNotificationKinds() {
  return useQuery({
    queryKey: ["notification_kinds"],
    queryFn: async (): Promise<NotificationKindMeta[]> => {
      const { data, error } = await supabase
        .from("notification_kinds")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      const rows = ((data || []) as Record<string, any>[]).map(mapNotificationKind);
      return rows.length > 0 ? rows : NOTIFICATION_KIND_META;
    },
    staleTime: 5 * 60_000,
  });
}

/** The workspace delivery gate. */
export function useNotificationPolicies() {
  const businessId = useActiveBusiness();
  return useQuery({
    queryKey: ["notification_policies", businessId],
    queryFn: async (): Promise<NotificationPolicy[]> => {
      if (businessId === "none") return [];
      const { data, error } = await supabase
        .from("notification_policies")
        .select("*")
        .eq("business_id", businessId);
      if (error) throw error;
      return ((data || []) as Record<string, any>[]).map(mapNotificationPolicy);
    },
    enabled: businessId !== "none",
    staleTime: 60_000,
  });
}

export type PolicyUpdate = {
  kind: NotificationKind;
  minRole?: NotificationRole;
  requiredPermission?: string | null;
  inAppEnabled?: boolean;
  pushEnabled?: boolean;
  quietHoursExempt?: boolean;
  enabled?: boolean;
};

export function useUpdateNotificationPolicy() {
  const qc = useQueryClient();
  const businessId = useActiveBusiness();
  return useMutation({
    mutationFn: async (update: PolicyUpdate) => {
      if (businessId === "none") return;
      const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (update.minRole !== undefined) patch.min_role = update.minRole;
      if (update.requiredPermission !== undefined)
        patch.required_permission = update.requiredPermission;
      if (update.inAppEnabled !== undefined)
        patch.in_app_enabled = update.inAppEnabled;
      if (update.pushEnabled !== undefined)
        patch.push_enabled = update.pushEnabled;
      if (update.quietHoursExempt !== undefined)
        patch.quiet_hours_exempt = update.quietHoursExempt;
      if (update.enabled !== undefined) patch.enabled = update.enabled;

      const { error } = await supabase
        .from("notification_policies")
        .update(patch)
        .eq("business_id", businessId)
        .eq("kind", update.kind);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notification_policies"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/** The signed-in person's channel switches. */
export function useNotificationPreferences() {
  const businessId = useActiveBusiness();
  return useQuery({
    queryKey: ["notification_preferences", businessId],
    queryFn: async (): Promise<NotificationPreference[]> => {
      if (businessId === "none") return [];
      const { data, error } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("business_id", businessId);
      if (error) throw error;
      return ((data || []) as Record<string, any>[]).map(mapNotificationPreference);
    },
    enabled: businessId !== "none",
    staleTime: 60_000,
  });
}

export function useUpdateNotificationPreference() {
  const qc = useQueryClient();
  const businessId = useActiveBusiness();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (preference: NotificationPreference) => {
      if (businessId === "none" || !user) return;
      const { error } = await supabase.from("notification_preferences").upsert(
        {
          business_id: businessId,
          user_id: user.id,
          kind: preference.kind,
          in_app_enabled: preference.inAppEnabled,
          push_enabled: preference.pushEnabled,
          quiet_hours_exempt: preference.quietHoursExempt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "business_id,user_id,kind" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notification_preferences"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/** Workspace-level delivery settings (quiet hours, closing time). */
export function useNotificationSettings() {
  const businessId = useActiveBusiness();
  return useQuery({
    queryKey: ["notification_settings", businessId],
    queryFn: async (): Promise<NotificationSettings | null> => {
      if (businessId === "none") return null;
      const { data, error } = await supabase
        .from("notification_settings")
        .select("*")
        .eq("business_id", businessId)
        .maybeSingle();
      if (error) throw error;
      return data ? mapNotificationSettings(data) : null;
    },
    enabled: businessId !== "none",
    staleTime: 60_000,
  });
}

export function useUpdateNotificationSettings() {
  const qc = useQueryClient();
  const businessId = useActiveBusiness();
  return useMutation({
    mutationFn: async (patch: Partial<
      Pick<
        NotificationSettings,
        | "quietHoursEnabled"
        | "quietStart"
        | "quietEnd"
        | "closingReminderTime"
        | "digestHour"
      >
    >) => {
      if (businessId === "none") return;
      const body: Record<string, unknown> = {
        business_id: businessId,
        updated_at: new Date().toISOString(),
      };
      if (patch.quietHoursEnabled !== undefined)
        body.quiet_hours_enabled = patch.quietHoursEnabled;
      if (patch.quietStart !== undefined) body.quiet_start = patch.quietStart;
      if (patch.quietEnd !== undefined) body.quiet_end = patch.quietEnd;
      if (patch.closingReminderTime !== undefined)
        body.closing_reminder_time = patch.closingReminderTime;
      if (patch.digestHour !== undefined) body.digest_hour = patch.digestHour;

      const { error } = await supabase
        .from("notification_settings")
        .upsert(body, { onConflict: "business_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notification_settings"] });
    },
  });
}
