import { useEffect, useState } from "react";
import { BellRing, BellOff, Smartphone } from "lucide-react";
import {
  currentPushSubscription,
  pushPermission,
  pushSupported,
  requestPushPermission,
  subscribeToPush,
  unsubscribePush,
  vapidPublicKey,
} from "@/lib/notifications/push";

type State = "unsupported" | "denied" | "default" | "granted" | "on";

/**
 * Device (Web Push) opt-in.
 *
 * The browser asks for permission; the endpoint is stored against the
 * signed-in user so the server can deliver the notification to this device
 * even when the app is closed.
 */
export default function PushOptIn() {
  const [state, setState] = useState<State>("default");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const read = async () => {
      if (!pushSupported()) {
        if (alive) setState("unsupported");
        return;
      }
      const permission = pushPermission();
      if (permission === "unsupported") {
        if (alive) setState("unsupported");
        return;
      }
      if (permission === "denied") {
        if (alive) setState("denied");
        return;
      }
      const subscription = await currentPushSubscription();
      if (alive) setState(subscription ? "on" : "granted");
    };
    void read();
    return () => {
      alive = false;
    };
  }, []);

  const turnOn = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const permission = await requestPushPermission();
      if (permission === "denied") {
        setState("denied");
        setMessage(
          "Your browser is blocking notifications for this site. Allow them in the site settings, then try again.",
        );
        return;
      }
      if (permission !== "granted") {
        setState("default");
        return;
      }
      const subscription = await subscribeToPush();
      if (subscription) {
        setState("on");
        setMessage("This device will now receive alerts even when the app is closed.");
      } else {
        setState("granted");
        setMessage(
          vapidPublicKey()
            ? "The browser accepted the permission but the subscription could not be created."
            : "Device notifications need a push key on the server. Ask your administrator to add VITE_VAPID_PUBLIC_KEY.",
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    await unsubscribePush();
    setState("granted");
    setMessage("This device will no longer receive alerts.");
    setBusy(false);
  };

  return (
    <div className="nt-note" style={{ flexDirection: "column", alignItems: "stretch" }}>
      <div className="nt-gate-lead">
        <span className="nt-empty-glyph" style={{ width: 30, height: 30, margin: 0 }}>
          {state === "on" ? (
            <BellRing strokeWidth={1.7} />
          ) : (
            <Smartphone strokeWidth={1.7} />
          )}
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="nt-gate-title">Device notifications</div>
          <div className="nt-gate-desc">
            {state === "unsupported" &&
              "This browser does not support push notifications. The in-app inbox still works."}
            {state === "denied" &&
              "Notifications are blocked for this site. Re-enable them in your browser settings."}
            {state === "default" &&
              "Receive alerts on this phone or computer even when PixoBooks is closed."}
            {state === "granted" &&
              "Permission is granted but this device is not registered yet."}
            {state === "on" &&
              "This device receives alerts even when PixoBooks is closed."}
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 8,
          marginTop: 10,
        }}
      >
        {state === "on" ? (
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={turnOff}
            disabled={busy}
          >
            <BellOff className="w-4 h-4" />
            Turn off on this device
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={turnOn}
            disabled={busy || state === "unsupported" || state === "denied"}
          >
            <BellRing className="w-4 h-4" />
            {busy ? "Turning on…" : "Turn on device notifications"}
          </button>
        )}
        {message && (
          <span className="nt-gate-desc" style={{ flex: "1 1 200px" }}>
            {message}
          </span>
        )}
      </div>
    </div>
  );
}
