import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Section kicker: a glowing lime rule and a spaced mono label above a headline. */
export function Kicker({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return (
    <p className={cn("gd-mono flex items-center gap-3 text-[0.75rem] uppercase tracking-[0.2em] text-lime", className)}>
      <span aria-hidden="true" className="h-0.5 w-9 bg-lime shadow-[0_0_10px_#c6ff00]" />
      {children}
    </p>
  );
}
