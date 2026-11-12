import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { onPushNotificationClick } from "@/lib/notifications/push";

/**
 * Routes the app when a device notification is tapped while PixoBooks is
 * already open. The service worker posts the target route to every client;
 * this one navigates.
 */
export default function NotificationClickListener() {
  const nav = useNavigate();

  useEffect(
    () => onPushNotificationClick((link) => nav(link)),
    [nav],
  );

  return null;
}
