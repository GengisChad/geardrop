import type { ReactNode } from "react";

/**
 * Reveals a block as it scrolls into view — driven entirely by CSS `animation-timeline`
 * (see globals.css), so there is no JS, no observer, and no hydration race. It degrades
 * to fully visible everywhere the effect can't run: no-JS, reduce-motion, browsers
 * without scroll-driven animations, and animation-disabled rendering (screenshots). The
 * content is never conditionally hidden by script.
 */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div data-reveal className={className}>
      {children}
    </div>
  );
}
