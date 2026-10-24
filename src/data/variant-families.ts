import type { ProductSlug } from "@/data/assets";

export type VariantColour = {
  readonly slug: ProductSlug;
  /** The colour as the shopper picks it. */
  readonly label: string;
  /** CSS background of the swatch: a colour, or a two-colour gradient for the two-colour cases. */
  readonly swatch: string;
};

export type VariantFamily = {
  /** The item without its colour, as the family's card names it. */
  readonly name: string;
  /** Not a Hasbro product. */
  readonly unofficial: boolean;
  /** In the order the product page offers them; the first leads the family in lists. */
  readonly colours: readonly VariantColour[];
};

/**
 * Items sold in several colours. Each colour is a catalogue product of its own (catalog.ts builds
 * them from this list); this small index is what cards, lists and the database provider read,
 * so none of them has to load the whole catalogue.
 *
 * The deck case colours are the ones the owner photographed on 2026-09-21 (prodotti/portadeck.jpg);
 * each swatch is its lid's colour, lifted from the photo's shadows.
 */
export const VARIANT_FAMILIES: Readonly<Record<string, VariantFamily>> = {
  "porta-deck": {
    name: "Porta Deck",
    unofficial: true,
    colours: [
      { slug: "porta-deck-giallo", label: "Giallo", swatch: "#ecd12a" },
      { slug: "porta-deck-verde-lime", label: "Verde lime", swatch: "#c2d83a" },
      { slug: "porta-deck-azzurro", label: "Azzurro", swatch: "#62a6d8" },
      { slug: "porta-deck-blu", label: "Blu", swatch: "#1a33a3" },
      { slug: "porta-deck-rosa", label: "Rosa", swatch: "#eab3c6" },
      { slug: "porta-deck-fucsia", label: "Fucsia", swatch: "#eb4f78" },
      { slug: "porta-deck-bianco", label: "Bianco", swatch: "#efeee8" },
    ],
  },
  /**
   * The two-colour cases, one photo each (owner, 2026-10-24). Three are black, so a swatch shows
   * both colours: the case's and the logo and latches'.
   */
  "porta-deck-bicolore": {
    name: "Porta Deck Bicolore",
    unofficial: true,
    colours: [
      { slug: "porta-deck-nero-blu", label: "Nero e blu", swatch: "linear-gradient(135deg, #1b1b1f 50%, #3a6fe0 50%)" },
      { slug: "porta-deck-nero-rosso", label: "Nero e rosso", swatch: "linear-gradient(135deg, #1b1b1f 50%, #e03535 50%)" },
      { slug: "porta-deck-nero-oro", label: "Nero e oro", swatch: "linear-gradient(135deg, #1b1b1f 50%, #e6b422 50%)" },
      { slug: "porta-deck-giallo-nero", label: "Giallo e nero", swatch: "linear-gradient(135deg, #f2e21c 50%, #1b1b1f 50%)" },
      { slug: "porta-deck-rosso-oro", label: "Rosso e oro", swatch: "linear-gradient(135deg, #e5384a 50%, #e6b422 50%)" },
      { slug: "porta-deck-viola-verde", label: "Viola e verde", swatch: "linear-gradient(135deg, #6f5ad8 50%, #2fcf63 50%)" },
      { slug: "porta-deck-viola-argento", label: "Viola e argento", swatch: "linear-gradient(135deg, #6450d2 50%, #b9bcc4 50%)" },
    ],
  },
};
