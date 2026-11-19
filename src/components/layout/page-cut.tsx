"use client";

import * as React from "react";
import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { VIEW_TRANSITIONS } from "@/lib/view-transitions";

// The App Router runs React's canary build, which has <ViewTransition>; the stable build the unit
// tests render with does not, and there the page simply changes at once.
const ViewTransition: typeof React.ViewTransition | undefined = (React as Partial<typeof React>).ViewTransition;

/** Task surfaces stay plain (PRODUCT.md): leaving them never glitches. */
const PLAIN = ["/carrello", "/checkout", "/account", "/login", "/registrati", "/ordine", "/password-dimenticata", "/nuova-password"];
const isPlain = (pathname: string) => PLAIN.some((path) => pathname === path || pathname.startsWith(`${path}/`));

/**
 * The glitch cut between pages (owner, 2026-11-19). The page that leaves is handed to the browser
 * as a view transition and breaks in three hard steps (globals.css, `.gd-page-cut`) while the new
 * one is already underneath: the new page is never held back, and the header and the tab bar are
 * not part of the cut.
 *
 * It is keyed on the path, so only a real change of page cuts: a filter, a sort or a form answer
 * on the same page changes at once, as before. `data-page-moved` marks a page reached by moving
 * through the shop, which is when its split title snaps out of register; the page a visit opens
 * on is at rest.
 */
export function PageCut({ children }: { readonly children: ReactNode }) {
  const pathname = usePathname();
  const [travel, setTravel] = useState({ path: pathname, moved: false });
  if (travel.path !== pathname) setTravel({ path: pathname, moved: true });

  const page = (
    <div key={pathname} data-page-moved={travel.moved ? "" : undefined}>
      {children}
    </div>
  );
  if (!VIEW_TRANSITIONS || !ViewTransition) return page;
  return (
    <ViewTransition key={pathname} default="none" exit={isPlain(pathname) ? "none" : "gd-page-cut"}>
      {page}
    </ViewTransition>
  );
}
