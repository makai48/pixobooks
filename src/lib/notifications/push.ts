import { supabase } from "@/lib/supabase";
import { currentBusinessId } from "@/lib/tenant";

/**
 * Web Push plumbing.
 *
 * The browser needs a VAPID public key to subscribe. It is published as
 * `VITE_VAPID_PUBLIC_KEY`; when it is absent the app still works, the
 * in-app inbox simply has no device channel and the opt-in explains why
 * instead of failing silently.
 */

const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? "";

export function vapidPublicKey(): string {
  return VAPID_PUBLIC_KEY.trim();
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function pushPermission(): NotificationPermission | "unsupported" {
  if (!pushSupported()) return "unsupported";
  return Notification.permission;
}

/** Ask the browser for permission. Resolves to the resulting permission. */
export async function requestPushPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

/** VAPID keys are base64url; the Push API wants a Uint8Array. */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

async function activeRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

/** The subscription this device already holds, if any. */
export async function currentPushSubscription(): Promise<PushSubscription | null> {
  const registration = await activeRegistration();
  if (!registration) return null;
  try {
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/**
 * Subscribe this device and store the endpoint against the signed-in user.
 *
 * Returns the subscription on success, or `null` when the browser, the
 * permission or the missing VAPID key prevents it.
 */
export async function subscribeToPush(): Promise<PushSubscription | null> {
  const key = vapidPublicKey();
  if (!key) return null;
  if (!pushSupported()) return null;
  if (Notification.permission !== "granted") return null;

  const registration = await activeRegistration();
  if (!registration) return null;

  let subscription: PushSubscription | null = null;
  try {
    subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
    }
  } catch {
    return null;
  }
  if (!subscription) return null;

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return null;

  const businessId = currentBusinessId();
  if (!businessId) return null;
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  if (!userId) return null;

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      business_id: businessId,
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "business_id,user_id,endpoint" },
  );
  if (error) {
    if (import.meta.env.DEV) console.error("push subscription save failed", error);
    return null;
  }
  return subscription;
}

/** Remove this device from the push registry. */
export async function unsubscribePush(): Promise<void> {
  const subscription = await currentPushSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  try {
    await subscription.unsubscribe();
  } catch {
    /* the endpoint may already be gone */
  }
  try {
    await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  } catch {
    /* nothing else to do — the endpoint is already dead */
  }
}

/**
 * React to a push notification that was tapped while the app was open.
 *
 * The service worker posts the target route to every open client so the
 * first one can navigate; the others are closed by the browser.
 */
export function onPushNotificationClick(handler: (link: string) => void): () => void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return () => undefined;
  }
  const listener = (event: MessageEvent) => {
    const data = event.data as { type?: string; link?: string } | null;
    if (!data || data.type !== "pixobooks:notification-click") return;
    handler(typeof data.link === "string" && data.link ? data.link : "/");
  };
  navigator.serviceWorker.addEventListener("message", listener);
  return () => navigator.serviceWorker.removeEventListener("message", listener);
}
