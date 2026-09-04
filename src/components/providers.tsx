"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/toast";

/**
 * Client providers for the whole tree.
 *
 * MotionConfig `reducedMotion="user"` makes every Framer Motion animation honour the OS
 * "reduce motion" setting — it strips transform/layout animation and keeps only opacity.
 * The CSS animations are already gated by the `prefers-reduced-motion` block in
 * globals.css, so together they cover both animation systems.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>{children}</ToastProvider>
    </MotionConfig>
  );
}
