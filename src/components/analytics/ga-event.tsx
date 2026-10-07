"use client";

import { useEffect } from "react";
import { sendGaEvent } from "@/lib/analytics/google";

/** Local storage, or the tab's session storage where local storage is blocked (private browsing). */
function onceStore(): Pick<Storage, "getItem" | "setItem"> | null {
  for (const pick of [() => window.localStorage, () => window.sessionStorage]) {
    try {
      const store = pick();
      store.getItem("gd-probe");
      return store;
    } catch {
      // Try the next one.
    }
  }
  return null;
}

/**
 * Raises one GA4 event when the page mounts. Nothing reaches Google unless the visitor accepted
 * statistics (see sendGaEvent). With `onceKey` the event counts once per browser: the key is
 * written only when the event has really gone out, so a sale held for an unanswered banner and
 * then refused can still be counted on a later visit, and reloading the confirmation never counts
 * it twice. The transaction id lets GA4 drop any duplicate that slips through.
 */
export function GaEvent({
  name,
  params,
  onceKey,
}: {
  readonly name: string;
  readonly params: Record<string, unknown>;
  readonly onceKey?: string;
}) {
  useEffect(() => {
    const store = onceKey ? onceStore() : null;
    if (onceKey && store?.getItem(onceKey)) return;
    sendGaEvent(name, params, undefined, onceKey ? () => store?.setItem(onceKey, "1") : undefined);
    // One event per mount: the page passes fixed values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
