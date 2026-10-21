"use client";

import { useEffect } from "react";
import { recordVisitSource } from "@/lib/attribution";

/**
 * Notes where this visit came from, once per page load, so the order can say which channel
 * sold it. Renders nothing. See src/lib/attribution.ts for what is kept and why.
 */
export function VisitSource() {
  useEffect(() => {
    recordVisitSource();
  }, []);
  return null;
}
