import type { ProductSlug } from "@/data/assets";

export type VariantColour = {
  readonly slug: ProductSlug;
  /** The colour as the shopper picks it. */
  readonly label: string;
  /** CSS colour of the swatch. */
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
};
