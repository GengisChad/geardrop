"use client";

import { useEffect } from "react";
import { trackEvent, type FunnelEvent } from "@/lib/funnel";

/**
 * Drop this once on a page to fire a funnel event on first render.
 * Uses useEffect so it runs only in the browser, and only once per navigation.
 */
export function TrackPageView({ event }: { readonly event: FunnelEvent }) {
  useEffect(() => {
    trackEvent(event);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
