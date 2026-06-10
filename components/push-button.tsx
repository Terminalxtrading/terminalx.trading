"use client";

import { Bell, BellOff } from "lucide-react";
import { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export function PushButton() {
  const [status, setStatus] = useState<"idle" | "saving" | "enabled" | "unsupported" | "error">("idle");
  const [message, setMessage] = useState("Get alerts on this device.");

  useEffect(() => {
    if (!("Notification" in window)) {
      setStatus("unsupported");
      setMessage("Push alerts are not supported in this browser.");
      return;
    }

    if (Notification.permission === "granted") {
      setStatus("enabled");
      setMessage("Alerts are enabled on this device.");
    } else if (Notification.permission === "denied") {
      setStatus("error");
      setMessage("Notifications are blocked. Enable them in browser settings.");
    }
  }, []);

  async function enableNotifications() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      setMessage("Push alerts are not supported in this browser.");
      return;
    }

    try {
      setStatus("saving");
      setMessage("Requesting permission...");
      const registration = await navigator.serviceWorker.register("/sw.js");
      const permission = await Notification.requestPermission();

      if (permission !== "granted") {
        setStatus("error");
        setMessage(permission === "denied" ? "Notifications are blocked in browser settings." : "Permission was not granted.");
        return;
      }

      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) {
        setStatus("error");
        setMessage("Alert key is missing in deployment settings.");
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });

      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription)
      });

      setStatus("enabled");
      setMessage("Alerts are enabled on this device.");
    } catch {
      setStatus("error");
      setMessage("Could not enable alerts. Try again after refreshing.");
    }
  }

  const disabled = status === "saving" || status === "enabled" || status === "unsupported";

  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={enableNotifications}
        disabled={disabled}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:bg-ink/45 sm:w-auto"
        title="Enable web push alerts"
      >
        {status === "enabled" ? <Bell className="size-4" /> : <BellOff className="size-4" />}
        {status === "saving" ? "Saving..." : status === "enabled" ? "Alerts enabled" : "Enable alerts"}
      </button>
      <p className={status === "error" || status === "unsupported" ? "mt-1 text-xs font-semibold text-coral" : "mt-1 text-xs text-ink/55"}>
        {message}
      </p>
    </div>
  );
}
