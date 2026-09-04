"use client";

import { Analytics } from "@vercel/analytics/next";
import { sanitizeAnalyticsEvent } from "@/lib/analytics";

export function StorefrontAnalytics({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;

  return <Analytics mode="production" beforeSend={sanitizeAnalyticsEvent} />;
}
