import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A short label above a block, used sparingly: home sections carry their name and count in
 * the title instead (X-Rail). Two lime slashes, then the label in mono.
 */
export function Kicker({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return (
    <p className={cn("gd-mono flex items-center gap-2 text-[0.75rem] uppercase tracking-[0.14em] text-grey-600", className)}>
      <span aria-hidden="true" className="font-bold text-lime">
        {"//"}
      </span>
      {children}
    </p>
  );
}
