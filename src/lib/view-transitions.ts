/**
 * The card-to-product photo transition (owner, 2026-10-29): React's View Transitions, which
 * Next 16 still marks experimental. One build-time switch drives both next.config's
 * `experimental.viewTransition` and the names the components set, so turning it off with
 * NEXT_PUBLIC_GEARDROP_VIEW_TRANSITIONS=0 leaves no half-wired transition behind.
 */
export const VIEW_TRANSITIONS = process.env["NEXT_PUBLIC_GEARDROP_VIEW_TRANSITIONS"] !== "0";

/**
 * The name a product's packshot shares between a catalogue card and its product page. Only
 * surfaces where a slug appears once may use it: two live elements with one name make the
 * browser skip the transition.
 */
export function packshotTransitionName(slug: string): string | undefined {
  return VIEW_TRANSITIONS ? `pack-${slug}` : undefined;
}
