import type { ReactNode } from "react";

/**
 * Scans a block onto the page the first time it arrives from below the fold, once (the scan-in of
 * 2026-11-19: globals.css for the styles, ScanObserver for the trigger). It replaced a fade tied
 * to the scroll position, which left a slowly scrolled section half transparent.
 *
 * The content is in the HTML and visible by default: without script, with reduced motion, in
 * screenshot mode and for whatever the first screen already shows, nothing is ever hidden.
 */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div data-scan="" data-scan-block="" className={className}>
      {children}
    </div>
  );
}
