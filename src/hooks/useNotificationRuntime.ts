import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useActiveBusiness } from "@/hooks/useBusinesses";
import { useNotifications, useNotificationSettings } from "@/hooks/useNotifications";
import { isWithinQuietHours } from "@/lib/notifications/quietHours";
import type { AppNotification } from "@/lib/notifications/types";

const EVALUATE_INTERVAL_MS = 5 * 60_000;

/**
 * The notification heartbeat.
 *
 * Two jobs, both deliberately cheap:
 *
 *  1. Ask the server to re-evaluate the business rules. The rules live in
 *     SQL so the same evaluation runs from the cron job when the app is
 *     closed — this call only makes an open app react immediately.
 *  2. Announce anything new that landed in the inbox. Toasts are suppressed
 *     during quiet hours; the bell still counts them.
 */
export function useNotificationRuntime() {
  const businessId = useActiveBusiness();
  const { data: notifications } = useNotifications();
  const { data: settings } = useNotificationSettings();
  const seen = useRef<Set<string>>(new Set());
  const primed = useRef(false);

  const evaluate = useCallback(async () => {
    if (businessId === "none") return;
    try {
      await supabase.rpc("evaluate_notification_rules", {
        p_business_id: businessId,
      });
    } catch (error) {
      // A workspace whose migration has not been applied yet simply has no
      // notifications. Never let this break the shell.
      if (import.meta.env.DEV) {
        console.warn("notification evaluation skipped", error);
      }
    }
  }, [businessId]);

  useEffect(() => {
    if (businessId === "none") return;
    void evaluate();

    const onFocus = () => void evaluate();
    window.addEventListener("focus", onFocus);

    const timer = window.setInterval(() => void evaluate(), EVALUATE_INTERVAL_MS);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, [businessId, evaluate]);

  // Announce what is new. The first payload only primes the set, so a
  // reload never replays yesterday's alerts.
  useEffect(() => {
    if (!notifications) return;
    if (!primed.current) {
      notifications.forEach((n) => seen.current.add(n.id));
      primed.current = true;
      return;
    }

    const quiet = settings ? isWithinQuietHours(settings) : false;
    notifications.forEach((notification: AppNotification) => {
      if (seen.current.has(notification.id)) return;
      seen.current.add(notification.id);
      if (notification.readAt) return;
      if (quiet) return;
      announce(notification);
    });
  }, [notifications, settings]);
}

function announce(notification: AppNotification) {
  const message = notification.body || notification.title;
  switch (notification.severity) {
    case "critical":
      toast.error(notification.title, { description: message });
      break;
    case "warning":
      toast.warning(notification.title, { description: message });
      break;
    case "success":
      toast.success(notification.title, { description: message });
      break;
    default:
      toast.info(notification.title, { description: message });
  }
}
