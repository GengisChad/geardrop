/**
 * Goods the shop stocks and sells off the site, so they live in the database and the panel but
 * never in the storefront catalogue (src/data/catalog.ts).
 *
 * The Drop Attack stadium alone (2026-10-06): the owner opens Battle Sets, sells Impact Drake and
 * Hover Wyvern loose on the site and the stadium by itself on Vinted. Its stock follows the sets
 * (supabase/migrations/20261006160100_battle_sets_open_on_demand.sql); the local seed mirrors it.
 */

export type StockOnlyProduct = {
  readonly slug: string;
  readonly sku: string;
  readonly name: string;
  readonly tagline: string;
  readonly description: string;
  readonly priceCents: number;
};

export const STOCK_ONLY_PRODUCTS: readonly StockOnlyProduct[] = [
  {
    slug: "drop-attack-arena",
    sku: "DROP-ATTACK-ARENA",
    name: "Beystadium Drop Attack (solo arena)",
    tagline: "L'arena del Drop Attack Battle Set, senza trottole.",
    description:
      "Il Beystadium del Drop Attack Battle Set, venduto da solo dopo aver tolto Impact Drake e Hover Wyvern. In vendita su Vinted, non sul sito.",
    priceCents: 1000,
  },
];

/** What one sealed set holds, piece by piece, for the sets the shop also sells opened. */
export const BATTLE_SETS: readonly { readonly setSlug: string; readonly pieces: readonly string[] }[] = [
  { setSlug: "drop-attack-battle-set", pieces: ["impact-drake-9-60lr", "hover-wyvern-3-85n", "drop-attack-arena"] },
];
