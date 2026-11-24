/**
 * Pieces sold out of a mixed lot with no count per version (owner, 2026-11-06): one price and one
 * shelf, and the buyer says in the order notes which version they want, so the shop can check it is
 * still there. A small index of its own, because the cart and the checkout are client bundles. The
 * String Launcher left it on 2026-11-13: only the left-spin (L) ones are left, so there is no choice.
 * The grip left it on 2026-11-24: its listing is now the black BX-11 Launcher Grip alone.
 */
const CHOICES: Readonly<Record<string, string>> = {
  "winder-launcher-takara-tomy": "Winder Launcher, destro (right) o sinistro (L)",
};

/** What the buyer of these slugs is asked to specify, one entry per piece that has a choice. */
export function orderChoices(slugs: readonly string[]): readonly string[] {
  return slugs.flatMap((slug) => {
    const choice = CHOICES[slug];
    return choice ? [choice] : [];
  });
}
