"use client";

import { Analytics } from "@vercel/analytics/next";
import { usePathname } from "next/navigation";
import { isSensitiveAnalyticsPath, sanitizeAnalyticsEvent } from "@/lib/analytics";

export function StorefrontAnalytics({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  if (!enabled || isSensitiveAnalyticsPath(pathname)) return null;

  return <Analytics mode="production" beforeSend={sanitizeAnalyticsEvent} />;
}
