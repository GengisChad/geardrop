"use client";

import { useEffect } from "react";

/**
 * Registers the management app's service worker. It only makes the app installable and shows a
 * clear page offline; it never stores business data, so every screen stays live and shared.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/admin" }).catch(() => {
      // Without it the admin works the same, it just cannot be installed.
    });
  }, []);
  return null;
}
