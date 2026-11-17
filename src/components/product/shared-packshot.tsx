import * as React from "react";
import type { ReactNode } from "react";

// The App Router runs React's canary build, which has <ViewTransition>. The stable build that the
// unit tests render with does not, and there the packshot simply renders without a name.
const ViewTransition: typeof React.ViewTransition | undefined = (React as Partial<typeof React>).ViewTransition;

/**
 * Lets a packshot travel between a catalogue card and its product page under one name
 * (lib/view-transitions.ts). Only the pair animates: a card that leaves without its product page,
 * or a product page reached from anywhere else, changes at once.
 */
export function SharedPackshot({ name, children }: { name: string | undefined; children: ReactNode }) {
  if (!name || !ViewTransition) return <>{children}</>;
  return (
    <ViewTransition name={name} default="none" share="auto">
      {children}
    </ViewTransition>
  );
}
