/**
 * Goods the shop stocks and sells off the site, so they live in the database and the panel but
 * never in the storefront catalogue (src/data/catalog.ts).
 *
 * Opened Battle Sets (2026-10-06): the owner opens sets and sells the pieces apart. Drop Attack:
 * Impact Drake and Hover Wyvern loose on the site, the stadium alone on Vinted. Sneak Attack:
 * everything on Vinted only — the stadium and both tops, for kids who search there. Each piece's
 * stock follows its sets (supabase/migrations/20261006160100_battle_sets_open_on_demand.sql); the
 * local seed mirrors it.
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
  {
    slug: "sneak-attack-arena",
    sku: "SNEAK-ATTACK-ARENA",
    name: "Beystadium Sneak Attack (solo arena)",
    tagline: "L'arena verde del Sneak Attack Battle Set, senza trottole.",
    description:
      "Il Beystadium verde del Sneak Attack Battle Set, con il rail a scomparsa, venduto da solo dopo aver tolto Rampart Aegis e Cutter Shinobi. In vendita su Vinted, non sul sito.",
    priceCents: 2500,
  },
  {
    slug: "rampart-aegis-gb",
    sku: "RAMPART-AEGIS-GB",
    name: "Rampart Aegis GB",
    tagline: "La trottola di stamina del Sneak Attack Battle Set.",
    description:
      "Rampart Aegis GB, trottola di stamina del Sneak Attack Battle Set Hasbro (lama con ratchet integrato, bit GB), estratta dal set e senza lanciatore. In vendita su Vinted, non sul sito.",
    priceCents: 1800,
  },
  {
    slug: "cutter-shinobi-lf",
    sku: "CUTTER-SHINOBI-LF",
    name: "Cutter Shinobi LF",
    tagline: "La trottola d'attacco del Sneak Attack Battle Set.",
    description:
      "Cutter Shinobi LF, trottola d'attacco del Sneak Attack Battle Set Hasbro (lama con ratchet integrato, bit LF), estratta dal set e senza lanciatore. In vendita su Vinted, non sul sito.",
    priceCents: 1800,
  },
];

/** What one sealed set holds, piece by piece, for the sets the shop also sells opened. */
export const BATTLE_SETS: readonly { readonly setSlug: string; readonly pieces: readonly string[] }[] = [
  { setSlug: "drop-attack-battle-set", pieces: ["impact-drake-9-60lr", "hover-wyvern-3-85n", "drop-attack-arena"] },
  { setSlug: "sneak-attack-battle-set", pieces: ["rampart-aegis-gb", "cutter-shinobi-lf", "sneak-attack-arena"] },
];
