/**
 * The real Beyblade X products supplied by the owner: six on 2026-09-04, three Infinity Starter
 * Packs on 2026-09-15, five pre-order pieces on 2026-09-21 and, the same day, the deck case in
 * seven colours. Prices and allocations are reviewed inputs; no product or review data is invented.
 *
 * The order here is the order the shop shows: what the owner has in the foreground leads (the
 * Takara Tomy arrivals of 2026-11-06), then the Infinity Starters, then the rest of the catalogue.
 */

import { productImages } from "@/data/assets";
import { VARIANT_FAMILIES, type VariantColour } from "@/data/variant-families";
import type { Brand, BrandSlug, Bundle, Category, Product, ShippingLockReason, ShippingOption } from "@/lib/commerce/types";

/**
 * The one consignment partner we work with: NerdPoint holds Takara Tomy stock and ships it
 * himself. His email comes from the env so it can be overridden in tests or staging without
 * touching the code. He is owed the list price minus the commission whatever the buyer paid,
 * which is why no code ever discounts his pieces (lib/commerce/cart-code.ts).
 */
export const CONSIGNMENT_PARTNER = {
  key: "nerdpoint",
  name: "NerdPoint",
  email: (process.env["PARTNER_EMAIL"]?.trim() || "amministrazione@nerdpoint.it"),
} as const;

export type PartnerLine = {
  readonly slug: string;
  readonly name: string;
  readonly quantity: number;
  readonly unitPriceCents: number;
  readonly commissionCents: number;
  /** What the partner receives for these units: (unitPrice − commission) × quantity, min 0. */
  readonly owed: number;
};

/**
 * Picks the paid lines whose slug belongs to a consignment product and computes what the
 * partner is owed for each one. Bundles are skipped (they never contain consignment items today).
 */
export function partnerLines(
  lines: readonly { readonly slug: string; readonly name: string; readonly quantity: number; readonly unitPriceCents: number }[],
): readonly PartnerLine[] {
  const bySlug = new Map(PRODUCTS.map((p) => [p.slug as string, p]));
  return lines.flatMap((line) => {
    const product = bySlug.get(line.slug);
    if (!product?.consignment) return [];
    const commission = product.commissionCents ?? 0;
    const owed = Math.max(0, (line.unitPriceCents - commission) * line.quantity);
    return [{ slug: line.slug, name: line.name, quantity: line.quantity, unitPriceCents: line.unitPriceCents, commissionCents: commission, owed }];
  });
}

const eur = (amount: number) => ({ amount, currency: "EUR" }) as const;

/**
 * BX-53 All-in-One Set (owner, 2026-11-18: "trova tu il prezzo migliore", against the other shops).
 * Seen that day: Japan's list price 7.480 yen; EU and US shops that hold it in a warehouse at about
 * 165-192 €, all sold out; one Italian shop at 159,90; Japanese export shops near 76 € plus shipping
 * from Japan, import VAT and the wait. 159,90 is the price of the only Italian offer and the lowest
 * that covers what the shop paid, with its share of freight and commission.
 */
const BX53_PRICE = 15990;
/** CX-20 Customize Set C (owner, 2026-11-26: "lo rivendiamo a 140 euro"). */
const CX20_PRICE = 14000;
/** BX-09 Beybattle Pass (owner, 2026-11-26: "3 battlepass a 80 euro"). */
const BX09_PRICE = 8000;
/** UX-00 Scorpio Spear 0-70Z Metal Coat: Magenta (owner, 2026-11-27: "al vendita al prezzo di 100euro"). */
const UX00_SS_MAGENTA_PRICE = 10000;

/**
 * What a deck case costs on its own, in every colour and both families (owner, 2026-10-24: €18,
 * down from €24,50; the shop pays €6 a case), and what it costs next to a kit: one case per
 * bundle in the cart is charged DECK_CASE_WITH_KIT (see deckDealUnits in mock-provider.ts).
 */
export const DECK_CASE_PRICE = 1800;
export const DECK_CASE_WITH_KIT = 1500;

/**
 * One colour of the deck case: printed in 3D, not a Hasbro product, the same price in every
 * colour, with no stock limit (no count on a product in stock). Owner's words: it also takes the
 * Expanded and Infinity tops. The colours live in variant-families.ts.
 */
const DECK_CASE = VARIANT_FAMILIES["porta-deck"]!;

function deckCase({ slug, label, swatch }: VariantColour): Product {
  return {
    slug, name: `${DECK_CASE.name} ${label}`, tagline: "Tre trottole al sicuro. Anche Expanded e Infinity.",
    description: "Il porta deck tiene un deck completo di Beyblade X: tre scomparti, uno per trottola, ognuno con la sua chiusura a clip. Entrano anche i bey Expanded e Infinity. Stampato in 3D. Accessorio non ufficiale: non è prodotto né certificato da Hasbro.",
    price: eur(DECK_CASE_PRICE), category: "accessori", stock: "disponibile", tags: [], rating: 0, reviewCount: 0,
    images: productImages[slug],
    specs: [{ label: "Tipo", value: "Porta deck" }, { label: "Produttore", value: "Non ufficiale, non prodotto da Hasbro" }, { label: "Compatibilità", value: "Beyblade X, compresi Expanded e Infinity" }, { label: "Scomparti", value: "3, uno per trottola" }, { label: "Colore", value: label }, { label: "Materiale", value: "Plastica stampata in 3D" }, { label: "Nota", value: "Trottole non incluse" }],
    features: [{ title: "Un deck completo", description: "Tre scomparti, uno per ogni trottola" }, { title: "Anche Expanded e Infinity", description: "Compatibile con i bey Expanded e Infinity" }, { title: "Chiusura a clip", description: "Ogni scomparto si chiude con la sua clip" }, { title: "Sette colori", description: "Giallo, verde lime, azzurro, blu, rosa, fucsia e bianco" }],
    boxContents: [`1 × Porta Deck ${label} (trottole non incluse)`],
    relatedSlugs: ["hurricane-enlil-is-7-55t", "tread-croc-tq-5-50gn", "cobalt-drake-4-60f"],
    variant: { family: "porta-deck", familyName: DECK_CASE.name, label, swatch },
    unofficial: true,
  };
}

/**
 * The two-colour deck cases (owner, 2026-10-24; seven more 2026-11-03): the same three-slot case,
 * printed in two colours, one photo per colour. Their lids carry a printed logo the shop holds no
 * licence for, so they stay off Google (KEPT_OFF_GOOGLE): no Merchant Center row, no product markup.
 */
const DECK_CASE_BICOLORE = VARIANT_FAMILIES["porta-deck-bicolore"]!;

function deckCaseBicolore({ slug, label, swatch }: VariantColour): Product {
  return {
    slug, name: `${DECK_CASE_BICOLORE.name} ${label}`, tagline: "Tre trottole al sicuro, in due colori.",
    description: `Il porta deck bicolore tiene un deck completo di Beyblade X: tre scomparti, uno per trottola, ognuno con la sua chiusura a clip. Entrano anche i bey Expanded e Infinity. Questo è ${label.toLowerCase()}: corpo, scritta e clip in due colori. Stampato in 3D. Accessorio non ufficiale: non è prodotto né certificato da Hasbro o Takara Tomy.`,
    price: eur(DECK_CASE_PRICE), category: "accessori", stock: "disponibile", tags: [], rating: 0, reviewCount: 0,
    images: productImages[slug],
    specs: [{ label: "Tipo", value: "Porta deck" }, { label: "Produttore", value: "Non ufficiale, non prodotto da Hasbro o Takara Tomy" }, { label: "Compatibilità", value: "Beyblade X, compresi Expanded e Infinity" }, { label: "Scomparti", value: "3, uno per trottola" }, { label: "Colore", value: label }, { label: "Materiale", value: "Plastica stampata in 3D" }, { label: "Nota", value: "Trottole non incluse" }],
    features: [{ title: "Un deck completo", description: "Tre scomparti, uno per ogni trottola" }, { title: "Anche Expanded e Infinity", description: "Compatibile con i bey Expanded e Infinity" }, { title: "Chiusura a clip", description: "Ogni scomparto si chiude con la sua clip" }, { title: "Quattordici combinazioni", description: "Dal nero e blu all'arancione e nero, ognuna con la sua foto" }],
    boxContents: [`1 × ${DECK_CASE_BICOLORE.name} ${label} (trottole non incluse)`],
    relatedSlugs: ["porta-deck-giallo", "hurricane-enlil-is-7-55t", "cobalt-drake-4-60f"],
    variant: { family: "porta-deck-bicolore", familyName: DECK_CASE_BICOLORE.name, label, swatch },
    unofficial: true,
  };
}

/** Every deck case colour, of both families: what a kit in the cart makes €15. */
export const DECK_CASE_SLUGS: ReadonlySet<string> = new Set(
  [...DECK_CASE.colours, ...DECK_CASE_BICOLORE.colours].map((colour) => colour.slug),
);

/**
 * Sold on the site only: kept out of the Merchant Center feed and of the product page's structured
 * data, because their print is a logo the shop holds no licence for (owner, 2026-10-24).
 */
export const KEPT_OFF_GOOGLE: ReadonlySet<string> = new Set(DECK_CASE_BICOLORE.colours.map((colour) => colour.slug));

/**
 * Brand descriptors for the two lines we sell. Hasbro is the Western Beyblade X line. Takara Tomy
 * is the original Japanese line: boosters, launchers and grips the shop bought itself and ships
 * like Hasbro (owner, 2026-11-06), plus limited editions on consignment, which our partner holds
 * and ships from his warehouse.
 */
export const BRANDS: readonly Brand[] = [
  {
    slug: "hasbro",
    name: "Hasbro",
    tagline: "La linea ufficiale occidentale di Beyblade X.",
    description: "I prodotti Hasbro sono la linea Beyblade X ufficiale per il mercato occidentale: trottole, lanciatori e stadi originali, acquistati dal distributore e spediti direttamente dal nostro magazzino.",
  },
  {
    slug: "takara-tomy",
    name: "Takara Tomy",
    tagline: "L'originale giapponese. Dal Giappone al tuo stadio.",
    description: "La linea originale giapponese di Beyblade X, l'inizio di tutto. Random Booster, lanciatori e grip partono dal nostro magazzino. Le edizioni limitate in conto vendita le spedisce il nostro partner, in un pacco separato.",
  },
];

/** Returns the brand a product belongs to. Absent means Hasbro. */
export function brandOf(product: Pick<Product, "brand">): BrandSlug {
  return product.brand ?? "hasbro";
}

/**
 * The maker named above a product's title. A pack that mixes the two lines names both, in the
 * order its pieces come (2026-11-18: Luster Dragoon with Hasbro starters), so a Takara Tomy piece
 * never sits under a plain "Hasbro".
 */
export function brandLabel(product: Pick<Product, "brand" | "bundleOf">): string {
  const name = (slug: BrandSlug) => BRANDS.find((entry) => entry.slug === slug)?.name ?? "Hasbro";
  if (!product.bundleOf?.length) return name(brandOf(product));
  const makers = new Set(product.bundleOf.map((part) => brandOf(PRODUCTS.find((piece) => piece.slug === part.slug) ?? {})));
  return [...makers].map(name).join(" e ");
}

/**
 * The side of shippingPlanFor an item falls on, which is about warehouses, not makers: consignment
 * pieces leave from the partner's, everything else from the shop's. That includes the Takara Tomy
 * pieces the shop bought itself (owner, 2026-11-06), and it is why this can differ from brandOf.
 */
export function shippingBrandOf(product: Pick<Product, "consignment" | "unofficial">): BrandSlug {
  return product.consignment && !product.unofficial ? "takara-tomy" : "hasbro";
}

export const CATEGORIES: readonly Category[] = [
  { slug: "beyblade-x", name: "Beyblade X", tagline: "Scatena la tua energia. Domina lo stadio.", description: "Tutta la collezione di trottole Beyblade X: attacco, difesa, stamina e bilanciate, pronte per ogni scontro." },
  { slug: "lanciatori", name: "Lanciatori", tagline: "Potenza e controllo nelle tue mani.", description: "Lanciatori a corda e accessori di lancio per colpi precisi e ripetibili." },
  { slug: "stadi", name: "Stadi", tagline: "Arene per battaglie epiche.", description: "Stadi e set arena ufficiali Beyblade X, studiati per urti estremi e KO spettacolari." },
  { slug: "accessori", name: "Accessori", tagline: "Personalizza. Migliora. Vinci.", description: "Attrezzi, custodie e ricambi per tenere il tuo arsenale sempre pronto." },
];

export const PRODUCTS: readonly Product[] = [
  // The owner, 2026-11-13: two red Phoenix without the launcher, only the top with its ratchet and
  // bit (like Hover Wyvern and Impact Drake), at 12,99, two on the shelf for now, as a promotion. It
  // leads the catalogue and the homepage (SPOTLIGHT_SLUGS) while it lasts, under the "Offerta" tag.
  // No compare-at price: the starter it is measured against is a different product, with a launcher.
  // Owner, 2026-11-19: 16,90 from now on. Each top comes out of a starter the shop paid 12,50, so at
  // 12,99 it sold under cost (10,65 net of VAT); 16,90 leaves 13,85 net and the launcher to sell apart.
  {
    slug: "soar-phoenix-9-60gf-solo-trottola", name: "Soar Phoenix 9-60GF solo trottola", tagline: "La Phoenix rossa, senza lanciatore.",
    description: "Soar Phoenix 9-60GF è la trottola d'attacco rossa dello starter Hasbro, qui venduta da sola: tre lame che salgono verso l'alto per un Upper Attack capace di sollevare l'avversario, una delle blade più pesanti della serie, con Ratchet 9-60 e Bit GF (Gear Flat). Solo la trottola con ratchet e bit montati: il lanciatore non è incluso. Arriva in busta, senza scatola. Richiede lanciatore e Beystadium Beyblade X (venduti separatamente).",
    price: eur(1690), category: "beyblade-x", bladeType: "attacco", stock: "disponibile", availableQuantity: 2, tags: ["offerta"], rating: 0, reviewCount: 0,
    images: productImages["soar-phoenix-9-60gf-solo-trottola"],
    specs: [{ label: "Tipo", value: "Attacco" }, { label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Codice", value: "9-60GF" }, { label: "Componenti", value: "1 trottola: blade, Ratchet 9-60 e Bit GF" }, { label: "Rotazione", value: "Destra" }, { label: "Confezione", value: "In busta, senza scatola" }, { label: "Nota", value: "Richiede lanciatore e Beystadium (venduti a parte)" }],
    features: [{ title: "Upper Attack", description: "Le tre lame sollevano l'avversario da terra" }, { title: "Ratchet 9-60", description: "Assetto basso a 6,0 mm, nove punti di contatto" }, { title: "Solo la trottola", description: "Blade, ratchet e bit: il lanciatore non è incluso" }, { title: "Da sapere prima di comprare", description: "Arriva in busta, senza scatola e senza lanciatore" }],
    boxContents: ["1 × Trottola Soar Phoenix 9-60GF in busta (blade, ratchet e bit)"],
    relatedSlugs: ["soar-phoenix-9-60gf", "impact-drake-9-60lr", "hover-wyvern-3-85n"],
  },
  // Takara Tomy pieces the shop bought itself (owner, 2026-11-06): they sit on its own shelf and ship
  // like Hasbro, so no `consignment`. Parts, variants and spin come from Takara Tomy's product pages.
  // They lead the catalogue, and with it the shop, because the owner wants them in the foreground.
  //
  // The arrival of 2026-11-18 (owner): six Luster Dragoon at 39,99, two Silver Wolf at 34,99 and one
  // BX-53 All-in-One Set. Names, parts, spin and box contents are read off Takara Tomy's own sheets
  // (lineup/bx52.html, ux08.html, bx53.html); the stadium in BX-53 is not named there, so it is not
  // named here either.
  {
    slug: "bx-52-luster-dragoon-6-60lc", name: "BX-52 Luster Dragoon 6-60LC", tagline: "Attacco left-spin pesante. Lanciatore L incluso.",
    description: "BX-52 è lo starter Takara Tomy di Luster Dragoon 6-60LC, trottola d'attacco a rotazione sinistra (left-spin) della linea BX, con Expand Blade. Il metallo arriva fino al centro della blade, che resta rigida e colpisce forte anche dal basso; il peso è spostato da un lato, come vuole Takara Tomy, e le due lame grandi sollevano l'avversario e lo spingono via. Ratchet 6-60, basso, con sei denti di due tipi alternati, e Bit LC (Low Cyclone), 1 mm più basso del Bit Cyclone per far presa sullo stadio quando gira a sinistra. Nella scatola c'è il Winder Launcher L viola con la Long Winder, più lunga della winder normale: si lancia subito. Richiede un Beystadium Beyblade X (venduto a parte). Prodotto originale giapponese, confezione in giapponese.",
    price: eur(3999), category: "beyblade-x", bladeType: "attacco", brand: "takara-tomy", stock: "disponibile", availableQuantity: 6, tags: ["novita"], rating: 0, reviewCount: 0,
    images: productImages["bx-52-luster-dragoon-6-60lc"],
    specs: [{ label: "Tipo", value: "Attacco" }, { label: "Produttore", value: "Takara Tomy (prodotto originale giapponese)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Linea", value: "BX (Expand Blade)" }, { label: "Codice", value: "6-60LC" }, { label: "Componenti", value: "Blade Luster Dragoon, Ratchet 6-60, Bit LC (Low Cyclone)" }, { label: "Rotazione", value: "Sinistra (left-spin)" }, { label: "Lanciatore", value: "Winder Launcher L viola con Long Winder, incluso" }, { label: "Confezione", value: "In giapponese" }, { label: "Nota", value: "Richiede un Beystadium (venduto a parte)" }],
    features: [{ title: "Left-spin pesante", description: "Attacco a rotazione sinistra con tanti punti d'impatto" }, { title: "Peso decentrato", description: "Le due lame grandi sollevano l'avversario e lo spingono via" }, { title: "Bit Low Cyclone", description: "1 mm più basso del Cyclone, fa presa girando a sinistra" }, { title: "Da sapere prima di comprare", description: "Gira a sinistra: si lancia solo con un lanciatore L, come quello incluso" }],
    boxContents: ["1 × Trottola Luster Dragoon 6-60LC", "1 × Winder Launcher L viola", "1 × Long Winder", "Istruzioni in giapponese"],
    relatedSlugs: ["cobalt-dragoon-2-60c", "string-launcher-takara-tomy", "ux-08-silver-wolf-3-80fb"],
  },
  {
    slug: "ux-08-silver-wolf-3-80fb", name: "UX-08 Silver Wolf 3-80FB", tagline: "Stamina UX con anello libero e Free Ball.",
    description: "UX-08 è lo starter Takara Tomy di Silver Wolf 3-80FB, trottola stamina a rotazione destra della linea UX (Unique Line). Sotto la blade c'è un anello libero che gira per conto suo: lascia scorrere il colpo dell'avversario e la trottola perde meno rotazione. Ratchet 3-80, alto, con tre denti, e Bit FB (Free Ball): la punta a sfera, sottile, gira libera rispetto al ratchet e consuma poco. Nella scatola c'è il Winder Launcher nero e argento: si lancia subito. In occidente Hasbro la vende come Sterling Wolf. Richiede un Beystadium Beyblade X (venduto a parte). Prodotto originale giapponese, confezione in giapponese.",
    price: eur(3499), category: "beyblade-x", bladeType: "stamina", brand: "takara-tomy", stock: "disponibile", availableQuantity: 2, tags: ["novita"], rating: 0, reviewCount: 0,
    images: productImages["ux-08-silver-wolf-3-80fb"],
    specs: [{ label: "Tipo", value: "Stamina" }, { label: "Produttore", value: "Takara Tomy (prodotto originale giapponese)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Linea", value: "UX (Unique Line)" }, { label: "Codice", value: "3-80FB" }, { label: "Componenti", value: "Blade Silver Wolf, Ratchet 3-80, Bit FB (Free Ball)" }, { label: "Rotazione", value: "Destra" }, { label: "Lanciatore", value: "Winder Launcher nero e argento, incluso" }, { label: "Confezione", value: "In giapponese" }, { label: "Nota", value: "Richiede un Beystadium (venduto a parte)" }],
    features: [{ title: "Anello libero", description: "Gira per conto suo e lascia scorrere il colpo" }, { title: "Bit Free Ball", description: "Punta a sfera che gira libera e consuma poco" }, { title: "Lanciatore incluso", description: "Winder Launcher nero e argento" }, { title: "Originale Takara Tomy", description: "La stessa trottola che Hasbro vende come Sterling Wolf" }],
    boxContents: ["1 × Trottola Silver Wolf 3-80FB", "1 × Winder Launcher nero e argento", "1 × Winder", "Istruzioni in giapponese"],
    relatedSlugs: ["bx-52-luster-dragoon-6-60lc", "cx-18-random-booster-brachio-whip", "custom-grip-takara-tomy"],
  },
  {
    slug: "bx-53-all-in-one-set", name: "BX-53 All-in-One Set", tagline: "Stadio, tre trottole e due lanciatori. Si gioca subito.",
    description: "BX-53 è l'All-in-One Set di Takara Tomy: tutto per cominciare, in una scatola. Dentro ci sono un Beystadium con l'Xtreme Line e la cupola trasparente, tre trottole di tipo diverso e due lanciatori. Aero Pegasus 3-70A in Double Metal Coat blu e ciano (UX, attacco), con tre lame grandi e il Bit A (Accel) per l'Xtreme Dash; Wizard Arrow 4-80B versione 2.0 (BX, stamina), con due grandi lame circolari e il peso verso l'esterno; Knight Shield 3-80N versione 2.0 (BX, difesa), con sei lame che assorbono l'urto e il Bit N (Needle). Le due versioni 2.0 sono quelle aggiornate da Takara Tomy. Tutte e tre girano a destra. I lanciatori sono un Winder Launcher blu e ciano e uno String Launcher giallo. La vernice Metal Coat può consumarsi con l'uso. Prodotto originale giapponese, confezione in giapponese.",
    price: eur(BX53_PRICE), category: "stadi", brand: "takara-tomy", stock: "disponibile", availableQuantity: 1, tags: ["novita"], rating: 0, reviewCount: 0,
    images: productImages["bx-53-all-in-one-set"],
    specs: [{ label: "Tipo", value: "Set completo con stadio" }, { label: "Produttore", value: "Takara Tomy (prodotto originale giapponese)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Codice prodotto", value: "BX-53" }, { label: "Componenti", value: "1 stadio, 3 trottole, 2 lanciatori" }, { label: "Trottole incluse", value: "Aero Pegasus 3-70A Double Metal Coat blu e ciano · Wizard Arrow 4-80B ver. 2.0 · Knight Shield 3-80N ver. 2.0" }, { label: "Lanciatori", value: "Winder Launcher blu e ciano, String Launcher giallo" }, { label: "Rotazione", value: "Destra, tutte e tre" }, { label: "Confezione", value: "In giapponese" }, { label: "Spedizione", value: "Scatola grande: va a casa con Poste Italiane" }],
    features: [{ title: "Si gioca subito", description: "Stadio, tre trottole e due lanciatori in una scatola" }, { title: "Tre tipi diversi", description: "Attacco, stamina e difesa" }, { title: "Aero Pegasus Double Metal Coat", description: "Blu e ciano, la vernice può consumarsi con l'uso" }, { title: "Versioni 2.0", description: "Wizard Arrow e Knight Shield nella versione aggiornata da Takara Tomy" }],
    boxContents: ["1 × Beystadium con cupola trasparente", "1 × Aero Pegasus 3-70A Double Metal Coat blu e ciano", "1 × Wizard Arrow 4-80B versione 2.0", "1 × Knight Shield 3-80N versione 2.0", "1 × Winder Launcher blu e ciano", "1 × String Launcher giallo", "Istruzioni in giapponese"],
    relatedSlugs: ["bx-52-luster-dragoon-6-60lc", "drop-attack-battle-set", "custom-grip-takara-tomy"],
  },
  {
    slug: "bx-48-random-booster-vol-9", name: "BX-48 Random Booster Vol. 9", tagline: "Cinque Metal Coat tornate dalle esclusive. Una a sorpresa.",
    description: "BX-48 è la Random Booster Vol. 9 di Takara Tomy, la Limited Revival: cinque trottole nate come esclusive di eventi, app e B4 Store, tornate in versione Metal Coat con un assetto rivisto. In ogni scatola ce n'è una sola, a caso e sigillata: non si sceglie. Sono Cobalt Dragoon 9-80F nera, Shark Edge 4-70E blu, Mammoth Tusk 7-60S nera, Hells Scythe 3-85GB oro e Dran Buster 2-80Q rossa. Cobalt Dragoon gira a sinistra e chiede un lanciatore L. Il lanciatore non è incluso. Richiede lanciatore e Beystadium Beyblade X (venduti a parte). Prodotto originale giapponese, confezione in giapponese.",
    price: eur(3699), category: "beyblade-x", brand: "takara-tomy", stock: "disponibile", availableQuantity: 6, tags: ["novita"], rating: 0, reviewCount: 0,
    images: productImages["bx-48-random-booster-vol-9"],
    specs: [{ label: "Produttore", value: "Takara Tomy (prodotto originale giapponese)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Codice prodotto", value: "BX-48" }, { label: "Contenuto", value: "1 trottola a caso tra 5, non si sceglie" }, { label: "Varianti", value: "Cobalt Dragoon 9-80F nera · Shark Edge 4-70E blu · Mammoth Tusk 7-60S nera · Hells Scythe 3-85GB oro · Dran Buster 2-80Q rossa" }, { label: "Rotazione", value: "Destra. Cobalt Dragoon gira a sinistra" }, { label: "Confezione", value: "Sigillata, in giapponese" }, { label: "Età", value: "Dai 6 anni (indicazione della confezione)" }, { label: "Nota", value: "Richiede lanciatore e Beystadium (venduti a parte)" }],
    features: [{ title: "Una su cinque", description: "Una trottola a caso per scatola: non si sceglie" }, { title: "Limited Revival", description: "Esclusive di eventi, app e B4 Store, tornate con un assetto rivisto" }, { title: "Metal Coat", description: "Nera, blu, oro o rossa. La vernice può consumarsi con l'uso" }, { title: "Da sapere prima di comprare", description: "Cobalt Dragoon gira a sinistra e chiede un lanciatore L. Il lanciatore non è incluso" }],
    boxContents: ["1 × Trottola a caso tra le cinque varianti", "Istruzioni in giapponese"],
    relatedSlugs: ["cx-18-random-booster-brachio-whip", "string-launcher-takara-tomy", "winder-launcher-takara-tomy"],
  },
  // The owner, 2026-11-15: Brachio Whip down to 28,00 and on promotion. The struck-through 30,00 is
  // the only price it has had since it was listed on 2026-11-06, so it is the lowest of the previous
  // 30 days, as Italian law asks of an announced reduction. "offerta" comes first: the card shows
  // the first tag, and the piece is still a new release.
  {
    slug: "cx-18-random-booster-brachio-whip", name: "CX-18 Random Booster Brachio Whip Select", tagline: "Uno di tre colori, a sorpresa.",
    description: "CX-18 è la Random Booster di Takara Tomy dedicata a Brachio Whip OW5-70Nr, trottola della Custom Line con Expand Blade che Takara Tomy classifica stamina: blade spessa e rotonda con il peso verso l'esterno, e Bit Nr (Narrow) per perdere meno rotazione. In ogni scatola ce n'è una sola, sigillata: la trottola è sempre questa, a caso è solo il colore (viola, oro o nera), che non si sceglie. Rotazione destra. Il lanciatore non è incluso. Richiede lanciatore e Beystadium Beyblade X (venduti a parte). Prodotto originale giapponese, confezione in giapponese con etichetta in cinese.",
    price: eur(2800), compareAtPrice: eur(3000), category: "beyblade-x", brand: "takara-tomy", stock: "disponibile", availableQuantity: 20, tags: ["offerta", "novita"], rating: 0, reviewCount: 0,
    images: productImages["cx-18-random-booster-brachio-whip"],
    specs: [{ label: "Produttore", value: "Takara Tomy (prodotto originale giapponese)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Linea", value: "CX (Expand Blade)" }, { label: "Codice", value: "OW5-70Nr" }, { label: "Contenuto", value: "1 trottola, a caso solo il colore: viola, oro o nera" }, { label: "Componenti", value: "Lock Chip Brachio, Over Blade Outer, Metal Blade Whip, Assist Blade Wheel, Ratchet 5-70, Bit Narrow" }, { label: "Rotazione", value: "Destra" }, { label: "Confezione", value: "Sigillata, in giapponese, con etichetta in cinese" }, { label: "Età", value: "Dai 6 anni (indicazione della confezione)" }, { label: "Nota", value: "Richiede lanciatore e Beystadium (venduti a parte)" }],
    features: [{ title: "Uno di tre colori", description: "Stessa trottola, a caso solo il colore: viola, oro o nera" }, { title: "Peso verso l'esterno", description: "Blade spessa e rotonda, pensata per durare" }, { title: "Bit Narrow", description: "Punta sottile e tonda, perde poca rotazione" }, { title: "Da sapere prima di comprare", description: "Solo la trottola: il lanciatore non è incluso" }],
    boxContents: ["1 × Trottola Brachio Whip OW5-70Nr, in un colore a caso", "Istruzioni in giapponese"],
    relatedSlugs: ["bx-48-random-booster-vol-9", "winder-launcher-takara-tomy", "custom-grip-takara-tomy"],
  },
  {
    // The black BX-11 Launcher Grip since 2026-11-24 (owner: "era da cambiare CUSTOM-GRIP-TAKARA-TOMY
    // in bx-11 che sarebbe il grip classico nero"); before, three Custom Grip editions from one lot.
    // The slug stays: it is the page's address and the key of the stock and the Stripe product. The
    // words come from Takara Tomy's BX-11 page (lineup/bx11.html), the panel from its official render.
    // 23,99: two euros under the Custom Grip's 25,99 (owner, 2026-11-24). A plain price, not an offer:
    // the BX-11 never sold at 25,99, so there is no struck-through figure.
    slug: "custom-grip-takara-tomy", name: "BX-11 Launcher Grip Takara Tomy", tagline: "Il grip nero classico. Si monta sul lanciatore.",
    description: "Il Launcher Grip BX-11 è l'impugnatura originale Takara Tomy, nera, che si monta sul lanciatore Beyblade X (venduto a parte): ha una forma comoda da impugnare e rende il lancio più stabile. Nella confezione c'è anche il suo pannello con il logo Beyblade X. Lanciatore, trottola e Beystadium non inclusi. Prodotto originale giapponese, confezione in giapponese.",
    price: eur(2399), category: "accessori", brand: "takara-tomy", stock: "disponibile", availableQuantity: 15, tags: ["novita"], rating: 0, reviewCount: 0,
    images: productImages["custom-grip-takara-tomy"],
    specs: [{ label: "Produttore", value: "Takara Tomy (prodotto originale giapponese)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Tipo", value: "Impugnatura per lanciatore" }, { label: "Modello", value: "BX-11 Launcher Grip" }, { label: "Colore", value: "Nero" }, { label: "Confezione", value: "In giapponese" }, { label: "Nota", value: "Lanciatore non incluso" }],
    features: [{ title: "Lancio più stabile", description: "La forma è più comoda da impugnare" }, { title: "Il grip classico", description: "Nero, con il pannello Beyblade X" }, { title: "Da sapere prima di comprare", description: "Il lanciatore non è incluso: il grip si monta su uno che hai già" }],
    boxContents: ["1 × Launcher Grip BX-11", "1 × Pannello del grip"],
    relatedSlugs: ["winder-launcher-takara-tomy", "string-launcher-takara-tomy", "long-winder-launcher-takara-tomy"],
  },
  {
    slug: "long-winder-launcher-takara-tomy", name: "Long Winder Launcher Takara Tomy", tagline: "La winder lunga. Anche con la stampa Evangelion.",
    description: "Il lanciatore Takara Tomy con la Long Winder, più lunga della winder classica: la infili, la tiri e la trottola parte. Ci sono due versioni, secondo disponibilità e non a scelta: la stampa speciale con il logo NERV dell'Evangelion Deck Set (CX-00), nera con la winder rossa, oppure in colore normale, come il verde in foto. Arriva in busta, senza scatola. Per trottole a rotazione destra. Trottola e Beystadium non inclusi.",
    price: eur(2000), category: "lanciatori", brand: "takara-tomy", stock: "disponibile", availableQuantity: 6, tags: ["novita"], rating: 0, reviewCount: 0,
    images: productImages["long-winder-launcher-takara-tomy"],
    specs: [{ label: "Produttore", value: "Takara Tomy (prodotto originale giapponese)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Tipo", value: "Lanciatore a winder" }, { label: "Winder", value: "Long Winder" }, { label: "Versione", value: "Stampa Evangelion o colore normale, non si sceglie" }, { label: "Rotazione", value: "Destra" }, { label: "Confezione", value: "In busta, senza scatola" }, { label: "Età", value: "Dai 6 anni (indicazione della confezione)" }, { label: "Nota", value: "Trottola e Beystadium non inclusi" }],
    features: [{ title: "Long Winder", description: "Più lunga della winder classica" }, { title: "Stampa Evangelion", description: "Il logo NERV dell'Evangelion Deck Set, finché ce n'è" }, { title: "Originale Takara Tomy", description: "Lo stesso lanciatore degli starter giapponesi" }, { title: "Da sapere prima di comprare", description: "La versione non si sceglie: arriva in busta, senza scatola" }],
    boxContents: ["1 × Lanciatore Takara Tomy", "1 × Long Winder"],
    relatedSlugs: ["custom-grip-takara-tomy", "winder-launcher-takara-tomy", "string-launcher-takara-tomy"],
  },
  {
    // Only the left-spin ones are left (owner, 2026-11-13: "leva gli string right, sono rimasti solo
    // left"), so there is nothing to choose and the order notes ask for nothing.
    slug: "string-launcher-takara-tomy", name: "String Launcher L Takara Tomy", tagline: "Solo sinistro (L), per le trottole left-spin.",
    description: "Lo String Launcher L è il lanciatore a corda lunga di Takara Tomy per le trottole a rotazione sinistra (left-spin), come Cobalt Dragoon: si tira la corda e la trottola parte. Sono rimasti solo i sinistri (L), come l'azzurro di BX-34 in foto: le trottole a rotazione destra non le lancia. Il colore è assortito e non si sceglie. Viene dagli starter giapponesi e arriva in busta, senza scatola. Trottola e Beystadium non inclusi.",
    price: eur(1699), category: "lanciatori", brand: "takara-tomy", stock: "disponibile", availableQuantity: 9, tags: ["novita"], rating: 0, reviewCount: 0,
    images: productImages["string-launcher-takara-tomy"],
    specs: [{ label: "Produttore", value: "Takara Tomy (prodotto originale giapponese)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Tipo", value: "Lanciatore a corda" }, { label: "Rotazione", value: "Sinistra (L): solo trottole left-spin" }, { label: "Colore", value: "Assortito, non si sceglie" }, { label: "Confezione", value: "In busta, senza scatola" }, { label: "Età", value: "Dai 6 anni (indicazione della confezione)" }, { label: "Nota", value: "Trottola e Beystadium non inclusi" }],
    features: [{ title: "Per le left-spin", description: "Lancia le trottole a rotazione sinistra, come Cobalt Dragoon" }, { title: "Corda lunga", description: "Si tira la corda e la trottola parte" }, { title: "Originale Takara Tomy", description: "Lo stesso lanciatore degli starter giapponesi" }, { title: "Da sapere prima di comprare", description: "Solo sinistro (L): non lancia le trottole a rotazione destra" }],
    boxContents: ["1 × String Launcher L Takara Tomy"],
    relatedSlugs: ["cobalt-dragoon-2-60c", "bx-48-random-booster-vol-9", "custom-grip-takara-tomy"],
  },
  {
    slug: "winder-launcher-takara-tomy", name: "Winder Launcher Takara Tomy", tagline: "Il lanciatore degli starter giapponesi. Colore assortito.",
    description: "Il Winder Launcher è il lanciatore degli starter Takara Tomy: infili la winder, la striscia dentata, e la tiri per far partire la trottola. Winder di lunghezza classica. Ci sono sia destri (right) sia sinistri (L), che lanciano solo le trottole a rotazione sinistra: scrivi quale vuoi nelle note dell'ordine o via email dopo l'acquisto. Se non è rimasto ti scriviamo prima di spedire; senza indicazioni spediamo il destro. Il colore è assortito e non si sceglie: ne abbiamo di diversi (in foto alcuni) e spediamo quello che c'è. Arriva in busta, senza scatola. Trottola e Beystadium non inclusi.",
    price: eur(1299), category: "lanciatori", brand: "takara-tomy", stock: "disponibile", availableQuantity: 33, tags: ["novita"], rating: 0, reviewCount: 0,
    images: productImages["winder-launcher-takara-tomy"],
    specs: [{ label: "Produttore", value: "Takara Tomy (prodotto originale giapponese)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Tipo", value: "Lanciatore a winder" }, { label: "Winder", value: "Lunghezza classica" }, { label: "Colore", value: "Assortito, non si sceglie" }, { label: "Rotazione", value: "Destra (right) o sinistra (L): scrivilo nelle note dell'ordine" }, { label: "Confezione", value: "In busta, senza scatola" }, { label: "Età", value: "Dai 6 anni (indicazione della confezione)" }, { label: "Nota", value: "Trottola e Beystadium non inclusi" }],
    features: [{ title: "Winder classica", description: "La striscia dentata che tiri per lanciare" }, { title: "Originale Takara Tomy", description: "Lo stesso lanciatore degli starter giapponesi" }, { title: "Colore assortito", description: "Ne abbiamo di diversi: il colore non si sceglie" }, { title: "Da sapere prima di comprare", description: "Scrivi nelle note dell'ordine se lo vuoi destro (right) o sinistro (L). Senza indicazioni spediamo il destro" }],
    boxContents: ["1 × Winder Launcher Takara Tomy", "1 × Winder"],
    relatedSlugs: ["custom-grip-takara-tomy", "string-launcher-takara-tomy", "long-winder-launcher-takara-tomy"],
  },
  {
    slug: "glory-valkerion-lf", name: "Glory Valkerion LF", tagline: "Attacco UX. Blade e ratchet in un pezzo.",
    description: "Glory Valkerion LF è una trottola d'attacco a rotazione destra della linea UX: la blade integra il ratchet in un unico pezzo e il Bit Low Flat (LF), a punta piatta e bassa, la spinge in movimenti rapidi e aggressivi per agganciare l'Xtreme Line e scatenare l'Xtreme Dash. Lo starter include il lanciatore. Richiede un Beystadium Beyblade X (venduto separatamente).",
    price: eur(1999), category: "beyblade-x", bladeType: "attacco", stock: "disponibile", availableQuantity: 62, tags: [], rating: 0, reviewCount: 0,
    images: productImages["glory-valkerion-lf"],
    specs: [{ label: "Tipo", value: "Attacco" }, { label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Linea", value: "UX (Infinity Starter Pack)" }, { label: "Codice", value: "LF" }, { label: "Componenti", value: "1 trottola, 1 lanciatore" }],
    features: [{ title: "Ratchet integrato", description: "Blade e ratchet stampati in un unico pezzo" }, { title: "Bit Low Flat", description: "Punta piatta e bassa per un attacco rapido" }, { title: "Xtreme Dash", description: "Aggancia l'Xtreme Line dello stadio e accelera" }, { title: "Starter completo", description: "Include il lanciatore" }],
    boxContents: ["1 × Trottola Glory Valkerion LF", "1 × Lanciatore con ripcord", "Manuale"],
    relatedSlugs: ["cobalt-dragoon-2-60c", "soar-phoenix-9-60gf", "blast-pegasus-a-tr"],
  },
  {
    slug: "shatter-horus-9-65gb", name: "Shatter Horus 9-65GB", tagline: "Stamina BX. Metallo oltre i ganci.",
    description: "Shatter Horus 9-65GB è una trottola stamina della linea BX: la blade dalla forma rotonda estende il metallo oltre i ganci del lanciatore e riveste di metallo anche il bordo del gear chip, che raffigura il dio egizio Horus. Monta il Ratchet 9-65 e il Bit GB. Lo starter include il lanciatore. Richiede un Beystadium Beyblade X (venduto separatamente).",
    price: eur(1199), category: "beyblade-x", bladeType: "stamina", stock: "disponibile", availableQuantity: 118, tags: [], rating: 0, reviewCount: 0,
    images: productImages["shatter-horus-9-65gb"],
    specs: [{ label: "Tipo", value: "Stamina" }, { label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Linea", value: "BX (Infinity Starter Pack)" }, { label: "Codice", value: "9-65GB" }, { label: "Componenti", value: "1 trottola, 1 lanciatore" }],
    features: [{ title: "Metallo esteso", description: "Il metallo supera i ganci del lanciatore" }, { title: "Forma rotonda", description: "Profilo tondo pensato per la resistenza" }, { title: "Starter completo", description: "Include il lanciatore" }, { title: "Compatibile Beyblade X", description: "Blade, Ratchet e Bit intercambiabili con la serie" }],
    boxContents: ["1 × Trottola Shatter Horus 9-65GB", "1 × Lanciatore con ripcord", "Manuale"],
    relatedSlugs: ["hurricane-enlil-is-7-55t", "glory-valkerion-lf", "saber-samurai-2-70l"],
  },
  {
    slug: "hurricane-enlil-is-7-55t", name: "Hurricane Enlil IS 7-55T", tagline: "Bilanciata CX. Blade Infinity scomponibile.",
    description: "Hurricane Enlil IS 7-55T è una trottola bilanciata a rotazione destra della linea CX: la blade Infinity si scompone in lock chip, over blade, blade metallica e assist blade per costruire l'assetto su misura, con Ratchet 7-55 e Bit T. Lo starter include il lanciatore. Richiede un Beystadium Beyblade X (venduto separatamente).",
    price: eur(999), category: "beyblade-x", bladeType: "bilanciato", stock: "disponibile", availableQuantity: 119, tags: [], rating: 0, reviewCount: 0,
    images: productImages["hurricane-enlil-is-7-55t"],
    specs: [{ label: "Tipo", value: "Bilanciata" }, { label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Linea", value: "CX (Infinity Starter Pack)" }, { label: "Codice", value: "IS 7-55T" }, { label: "Componenti", value: "1 trottola, 1 lanciatore" }],
    features: [{ title: "Blade Infinity scomponibile", description: "Lock chip, over blade, blade metallica e assist blade" }, { title: "Assetto bilanciato", description: "Equilibrio tra attacco, difesa e resistenza" }, { title: "Starter completo", description: "Include il lanciatore" }, { title: "Compatibile Beyblade X", description: "Blade, Ratchet e Bit intercambiabili con la serie" }],
    boxContents: ["1 × Trottola Hurricane Enlil IS 7-55T", "1 × Lanciatore con ripcord", "Manuale"],
    relatedSlugs: ["shatter-horus-9-65gb", "glory-valkerion-lf", "blast-pegasus-a-tr"],
  },
  {
    slug: "hammer-incendio-3-70h", name: "Hammer Incendio 3-70H", tagline: "Tre martelli. Colpisce dall'alto.",
    description: "Hammer Incendio 3-70H è costruita attorno a tre grandi lame rialzate che lavorano come martelli: il peso sta sul bordo e i colpi arrivano dall'alto. Ratchet 3-70 a 7,0 mm, che resiste allo scoppio meglio degli assetti bassi, e Bit H (Hexa). Lo starter include il lanciatore. Richiede un Beystadium Beyblade X (venduto separatamente).",
    price: eur(1199), category: "beyblade-x", stock: "disponibile", availableQuantity: 26, tags: [], rating: 0, reviewCount: 0,
    images: productImages["hammer-incendio-3-70h"],
    specs: [{ label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Linea", value: "UX (Unique Line)" }, { label: "Codice", value: "3-70H" }, { label: "Componenti", value: "1 trottola, 1 lanciatore con ripcord" }, { label: "Nota", value: "Richiede un Beystadium (venduto a parte)" }],
    features: [{ title: "Tre lame a martello", description: "Il peso sul bordo per colpire dall'alto" }, { title: "Bit Hexa", description: "Si raddrizza da sola e tiene l'assetto" }, { title: "Ratchet 3-70", description: "Assetto medio a 7,0 mm" }, { title: "Starter completo", description: "Trottola e lanciatore con ripcord inclusi" }],
    boxContents: ["1 × Trottola Hammer Incendio 3-70H", "1 × Lanciatore con ripcord", "Manuale"],
    relatedSlugs: ["buster-dran-5-70db", "shadow-shinobi-1-80mn", "wand-wizard-1-60r"],
  },
  {
    slug: "shadow-shinobi-1-80mn", name: "Shadow Shinobi 1-80MN", tagline: "Para, devia, resta in piedi.",
    description: "Shadow Shinobi 1-80MN è fatta per incassare: tre lame lisce che deviano il colpo invece di rimbalzarlo, contatti in metallo nella parte alta, ed è tra le più leggere della serie. Ratchet 1-80 alto a 8,0 mm e Bit MN (Metal Needle). Lo starter include il lanciatore. Richiede un Beystadium Beyblade X (venduto separatamente).",
    price: eur(999), category: "beyblade-x", stock: "disponibile", availableQuantity: 26, tags: [], rating: 0, reviewCount: 0,
    images: productImages["shadow-shinobi-1-80mn"],
    specs: [{ label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Linea", value: "UX (Unique Line)" }, { label: "Codice", value: "1-80MN" }, { label: "Componenti", value: "1 trottola, 1 lanciatore con ripcord" }, { label: "Nota", value: "Richiede un Beystadium (venduto a parte)" }],
    features: [{ title: "Tre lame lisce", description: "Deviano il colpo invece di rimbalzarlo" }, { title: "Bit Metal Needle", description: "Attrito minimo, rotazione lunghissima" }, { title: "Ratchet 1-80", description: "Assetto alto a 8,0 mm" }, { title: "Da sapere prima di comprare", description: "La punta in metallo può segnare il fondo dello stadio" }],
    boxContents: ["1 × Trottola Shadow Shinobi 1-80MN", "1 × Lanciatore con ripcord", "Manuale"],
    relatedSlugs: ["hammer-incendio-3-70h", "buster-dran-5-70db"],
  },
  {
    slug: "wand-wizard-1-60r", name: "Wand Wizard 1-60R", tagline: "La blade più larga della serie.",
    description: "Wand Wizard 1-60R monta la blade dal diametro più grande della linea UX, larga e circolare con cinque intagli sul perimetro, qui montata bassa e aggressiva. Ratchet 1-60 a 6,0 mm e Bit R (Rush). Lo starter include il lanciatore. Richiede un Beystadium Beyblade X (venduto separatamente).",
    price: eur(1490), category: "beyblade-x", stock: "disponibile", availableQuantity: 26, tags: [], rating: 0, reviewCount: 0,
    images: productImages["wand-wizard-1-60r"],
    specs: [{ label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Linea", value: "UX (Unique Line)" }, { label: "Codice", value: "1-60R" }, { label: "Componenti", value: "1 trottola, 1 lanciatore con ripcord" }, { label: "Nota", value: "Richiede un Beystadium (venduto a parte)" }],
    features: [{ title: "La blade più larga", description: "Diametro maggiore di ogni altra della serie" }, { title: "Bit Rush", description: "Scatti frequenti, poca rotazione persa" }, { title: "Ratchet 1-60", description: "Assetto basso a 6,0 mm" }, { title: "Starter completo", description: "Trottola e lanciatore con ripcord inclusi" }],
    boxContents: ["1 × Trottola Wand Wizard 1-60R", "1 × Lanciatore con ripcord", "Manuale"],
    relatedSlugs: ["buster-dran-5-70db", "hammer-incendio-3-70h"],
  },
  {
    slug: "buster-dran-5-70db", name: "Buster Dran 5-70DB", tagline: "Un punto solo. O passa, o niente.",
    description: "Buster Dran 5-70DB è la più estrema della linea UX: la blade ovale concentra tutta la massa su un unico contatto a punta di spada e svuota il lato opposto. Ratchet 5-70 a 7,0 mm e Bit DB (Disk Ball). Questa è la versione booster: contiene la sola trottola, senza lanciatore. Richiede lanciatore e Beystadium Beyblade X (venduti separatamente).",
    price: eur(890), compareAtPrice: eur(999), category: "beyblade-x", stock: "disponibile", availableQuantity: 26, tags: ["offerta"], rating: 0, reviewCount: 0,
    images: productImages["buster-dran-5-70db"],
    specs: [{ label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Linea", value: "UX (Unique Line)" }, { label: "Codice", value: "5-70DB" }, { label: "Componenti", value: "1 trottola" }, { label: "Nota", value: "Richiede lanciatore e Beystadium (venduti a parte)" }],
    features: [{ title: "Un solo punto d'urto", description: "Tutta la massa su un contatto a punta di spada" }, { title: "Bit Disk Ball", description: "Appoggio a disco: tiene il centro senza fermarsi" }, { title: "Ratchet 5-70", description: "Assetto medio a 7,0 mm" }, { title: "Solo la trottola", description: "Versione booster: il lanciatore non è incluso" }],
    boxContents: ["1 × Trottola Buster Dran 5-70DB", "Manuale"],
    relatedSlugs: ["hammer-incendio-3-70h", "wand-wizard-1-60r", "shadow-shinobi-1-80mn"],
  },
  {
    slug: "impact-drake-9-60lr", name: "Impact Drake 9-60LR", tagline: "Il Low Rush al prezzo di un booster.",
    description: "Impact Drake 9-60LR è la trottola d'attacco del Drop Attack Battle Set, qui venduta da sola: Ratchet 9-60 e Bit LR (Low Rush), due pezzi che nelle classifiche dei tornei compaiono spesso sotto blade diverse. Arriva imbustata e sigillata, estratta dal set e senza confezione singola. Non include il lanciatore. Richiede lanciatore e Beystadium Beyblade X (venduti separatamente).",
    price: eur(1399), category: "beyblade-x", stock: "disponibile", availableQuantity: 100, tags: [], rating: 0, reviewCount: 0,
    images: productImages["impact-drake-9-60lr"],
    specs: [{ label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Codice", value: "9-60LR" }, { label: "Componenti", value: "1 trottola" }, { label: "Confezione", value: "Imbustata e sigillata, estratta dal Battle Set" }, { label: "Nota", value: "Richiede lanciatore e Beystadium (venduti a parte)" }],
    features: [{ title: "Ratchet 9-60", description: "Assetto basso a 6,0 mm, nove punti di contatto" }, { title: "Bit Low Rush", description: "Punta bassa che scatta e riprende quota" }, { title: "Solo la trottola", description: "Il lanciatore non è incluso" }, { title: "Da sapere prima di comprare", description: "Estratta dal Drop Attack Battle Set: imbustata e sigillata, senza la sua confezione" }],
    boxContents: ["1 × Trottola Impact Drake 9-60LR imbustata"],
    relatedSlugs: ["hover-wyvern-3-85n", "buster-dran-5-70db", "drop-attack-battle-set"],
  },
  {
    slug: "hover-wyvern-3-85n", name: "Hover Wyvern 3-85N", tagline: "Difesa alta. Resta in piedi.",
    description: "Hover Wyvern 3-85N è la trottola da difesa del Drop Attack Battle Set, qui venduta da sola: blade Hover Wyvern, Ratchet 3-85 fra i più alti della serie e Bit N (Needle). Arriva imbustata e sigillata, estratta dal set e senza confezione singola. Non include il lanciatore. Richiede lanciatore e Beystadium Beyblade X (venduti separatamente).",
    price: eur(1399), category: "beyblade-x", stock: "disponibile", availableQuantity: 100, tags: [], rating: 0, reviewCount: 0,
    images: productImages["hover-wyvern-3-85n"],
    specs: [{ label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Codice", value: "3-85N" }, { label: "Componenti", value: "1 trottola" }, { label: "Confezione", value: "Imbustata e sigillata, estratta dal Battle Set" }, { label: "Nota", value: "Richiede lanciatore e Beystadium (venduti a parte)" }],
    features: [{ title: "Ratchet 3-85", description: "Fra gli assetti più alti: tiene la trottola lontana dai colpi" }, { title: "Bit Needle", description: "Punta sottile, attrito minimo" }, { title: "Solo la trottola", description: "Il lanciatore non è incluso" }, { title: "Da sapere prima di comprare", description: "Estratta dal Drop Attack Battle Set: imbustata e sigillata, senza la sua confezione" }],
    boxContents: ["1 × Trottola Hover Wyvern 3-85N imbustata"],
    relatedSlugs: ["impact-drake-9-60lr", "shadow-shinobi-1-80mn", "drop-attack-battle-set"],
  },
  {
    slug: "cobalt-dragoon-2-60c", name: "Cobalt Dragoon 2-60C", tagline: "Attacco left-spin. Smash devastante.",
    description: "Cobalt Dragoon 2-60C è una trottola d'attacco a rotazione sinistra (left-spin): quattro lame inclinate verso l'alto concentrano uno Smash Attack estremo, mentre il Ratchet 2-60 e il Bit Cyclone bilanciano velocità e stabilità. Lo starter include il lanciatore a corda left-spin dedicato.",
    // Owner, 2026-11-19: 19,90 → 17,90, under the 18,90 Amazon asked on 2026-10-15.
    price: eur(1790), category: "beyblade-x", bladeType: "attacco", stock: "disponibile", availableQuantity: 56, tags: [], rating: 0, reviewCount: 0,
    images: productImages["cobalt-dragoon-2-60c"],
    specs: [{ label: "Tipo", value: "Attacco (left-spin)" }, { label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Codice", value: "2-60C" }, { label: "Componenti", value: "1 trottola, 1 lanciatore a corda" }, { label: "Materiale", value: "Plastica e metallo" }],
    features: [{ title: "Rotazione sinistra", description: "Left-spin che spiazza gli assetti a rotazione destra" }, { title: "Smash estremo", description: "Quattro lame inclinate per KO potenti" }, { title: "Starter completo", description: "Include il lanciatore a corda dedicato" }, { title: "Compatibile Beyblade X", description: "Blade, Ratchet e Bit intercambiabili con la serie" }],
    boxContents: ["1 × Trottola Cobalt Dragoon 2-60C", "1 × Lanciatore a corda left-spin", "Manuale"],
    relatedSlugs: ["blast-pegasus-a-tr", "soar-phoenix-9-60gf", "saber-samurai-2-70l"],
  },
  {
    slug: "blast-pegasus-a-tr", name: "Blast Pegasus A Tr", tagline: "Attacco portatile. Clip & Rip Launcher.",
    description: "Blast Pegasus A Tr è una trottola d'attacco a rotazione destra della linea CX, venduta con il Clip & Rip Launcher: un lanciatore portatile che si aggancia a cintura e zaino e ripone il ripcord all'interno. Richiede un Beystadium Beyblade X (venduto separatamente).",
    price: eur(2690), category: "beyblade-x", bladeType: "attacco", stock: "esaurito", availableQuantity: 0, tags: [], rating: 0, reviewCount: 0,
    images: productImages["blast-pegasus-a-tr"],
    specs: [{ label: "Tipo", value: "Attacco" }, { label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Linea", value: "CX" }, { label: "Componenti", value: "1 trottola, 1 Clip & Rip Launcher" }, { label: "Nota", value: "Richiede un Beystadium (venduto a parte)" }],
    features: [{ title: "Clip & Rip Launcher", description: "Lanciatore portatile: si aggancia e riponi il ripcord" }, { title: "Linea CX", description: "Trottola d'attacco a rotazione destra" }, { title: "X-Celerator", description: "Accelera sull'X-Celerator Rail dello stadio" }, { title: "Compatibile Beyblade X", description: "Blade, Ratchet e Bit intercambiabili con la serie" }],
    boxContents: ["1 × Trottola Blast Pegasus A Tr", "1 × Clip & Rip Launcher", "1 × Ripcord", "Manuale"],
    relatedSlugs: ["cobalt-dragoon-2-60c", "soar-phoenix-9-60gf", "saber-samurai-2-70l"],
  },
  {
    slug: "saber-samurai-2-70l", name: "Saber Samurai 2-70L", tagline: "Doppia lama. Colpi da katana.",
    description: "Saber Samurai 2-70L (linea UX) è una trottola d'attacco: le due protuberanze si ritraggono a metà battaglia, passando da colpi ripetuti in stile katana a un singolo impatto \"tachi\" per KO improvvisi. Lo starter include il lanciatore con impugnatura (grip).",
    price: eur(2590), category: "beyblade-x", bladeType: "attacco", stock: "disponibile", availableQuantity: 16, tags: [], rating: 0, reviewCount: 0,
    images: productImages["saber-samurai-2-70l"],
    specs: [{ label: "Tipo", value: "Attacco" }, { label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Linea", value: "UX (UX-09)" }, { label: "Codice", value: "2-70L" }, { label: "Componenti", value: "1 trottola, 1 lanciatore con impugnatura" }],
    features: [{ title: "Gimmick a doppia modalità", description: "Da colpi ripetuti a singolo impatto tachi" }, { title: "Linea UX", description: "Meccanica esclusiva della Unique Line" }, { title: "Lanciatore grip incluso", description: "Impugnatura per lanci potenti e stabili" }, { title: "Compatibile Beyblade X", description: "Blade, Ratchet e Bit intercambiabili con la serie" }],
    boxContents: ["1 × Trottola Saber Samurai 2-70L", "1 × Lanciatore con impugnatura", "1 × Winder", "Manuale"],
    relatedSlugs: ["cobalt-dragoon-2-60c", "soar-phoenix-9-60gf", "blast-pegasus-a-tr"],
  },
  {
    slug: "drop-attack-battle-set", name: "Drop Attack Battle Set", tagline: "Stadio + 2 trottole + 2 lanciatori.",
    description: "Il Drop Attack Battle Set include tutto per giocare: il Beystadium con X-Celerator Rail rialzato che porta le trottole in alto per farle piombare sull'avversario, due trottole (Impact Drake 9-60LR d'attacco e Hover Wyvern 3-85N di difesa) e due lanciatori a corda.",
    price: eur(3990), category: "stadi", stock: "disponibile", availableQuantity: 102, tags: [], rating: 0, reviewCount: 0,
    images: productImages["drop-attack-battle-set"],
    specs: [{ label: "Tipo", value: "Kit arena" }, { label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Componenti", value: "1 stadio, 2 trottole, 2 lanciatori" }, { label: "Trottole incluse", value: "Impact Drake 9-60LR, Hover Wyvern 3-85N" }, { label: "Materiale", value: "Plastica e metallo" }],
    features: [{ title: "X-Celerator Rail rialzato", description: "Porta le trottole in alto per il Drop Attack" }, { title: "Set completo", description: "Stadio, due trottole e due lanciatori pronti al gioco" }, { title: "Impact Drake + Hover Wyvern", description: "Un assetto d'attacco e uno di difesa" }, { title: "Compatibile Beyblade X", description: "Usa tutte le trottole e parti della serie" }],
    boxContents: ["1 × Beystadium Drop Attack", "1 × Impact Drake 9-60LR", "1 × Hover Wyvern 3-85N", "2 × Lanciatori a corda", "Manuale di gioco"],
    relatedSlugs: ["sneak-attack-battle-set", "cobalt-dragoon-2-60c", "soar-phoenix-9-60gf"],
  },
  {
    slug: "sneak-attack-battle-set", name: "Sneak Attack Battle Set", tagline: "Stadio verde + 2 trottole + 2 lanciatori.",
    description: "Il Sneak Attack Battle Set mette in scatola tutto per il primo scontro: il Beystadium con rail a scomparsa che devia le trottole in una nuova direzione, due trottole (Rampart Aegis GB di stamina e Cutter Shinobi LF d'attacco) e due lanciatori a corda.",
    price: eur(4490), category: "stadi", stock: "disponibile", availableQuantity: 51, tags: [], rating: 0, reviewCount: 0,
    images: productImages["sneak-attack-battle-set"],
    specs: [{ label: "Tipo", value: "Kit arena" }, { label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Componenti", value: "1 stadio, 2 trottole, 2 lanciatori" }, { label: "Trottole incluse", value: "Rampart Aegis GB, Cutter Shinobi LF" }, { label: "Materiale", value: "Plastica e metallo" }],
    features: [{ title: "Rail a scomparsa", description: "Devia le trottole in una nuova direzione a sorpresa" }, { title: "Set completo", description: "Stadio, due trottole e due lanciatori pronti al gioco" }, { title: "Rampart Aegis + Cutter Shinobi", description: "Un assetto di stamina e uno d'attacco" }, { title: "Compatibile Beyblade X", description: "Usa tutte le trottole e parti della serie" }],
    boxContents: ["1 × Beystadium Sneak Attack", "1 × Rampart Aegis GB", "1 × Cutter Shinobi LF", "2 × Lanciatori a corda", "Manuale di gioco"],
    relatedSlugs: ["drop-attack-battle-set", "cobalt-dragoon-2-60c", "saber-samurai-2-70l"],
  },
  // One card in the shop, seven colours on the product page; the first colour leads the family.
  ...DECK_CASE.colours.map(deckCase),
  ...DECK_CASE_BICOLORE.colours.map(deckCaseBicolore),
  {
    slug: "cobalt-drake-4-60f", name: "Cobalt Drake 4-60F", tagline: "Attacco BX. Lame di cristallo.",
    description: "Cobalt Drake 4-60F è una trottola d'attacco della linea BX: la blade trasparente dal profilo affilato concentra il peso sulle punte, il Ratchet 4-60 tiene l'assetto basso e il Bit F (Flat) la lancia in traiettorie rapide e aggressive lungo il bordo dello stadio. Richiede lanciatore e Beystadium Beyblade X (venduti separatamente).",
    price: eur(2000), category: "beyblade-x", bladeType: "attacco", stock: "pre-ordine", releasePreorder: true, availableQuantity: 9, tags: ["novita"], rating: 0, reviewCount: 0,
    images: productImages["cobalt-drake-4-60f"],
    specs: [{ label: "Tipo", value: "Attacco" }, { label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Linea", value: "BX (Basic Line)" }, { label: "Codice", value: "4-60F" }, { label: "Componenti", value: "1 trottola" }, { label: "Nota", value: "Richiede lanciatore e Beystadium (venduti a parte)" }],
    features: [{ title: "Bit Flat", description: "Punta piatta per movimenti rapidi e aggressivi" }, { title: "Ratchet 4-60", description: "Assetto basso, pensato per l'attacco" }, { title: "Blade trasparente", description: "Profilo affilato con il peso sulle punte" }, { title: "Compatibile Beyblade X", description: "Blade, Ratchet e Bit intercambiabili con la serie" }],
    boxContents: ["1 × Trottola Cobalt Drake 4-60F", "Manuale"],
    relatedSlugs: ["strike-dran-4-50ff", "tread-croc-tq-5-50gn", "mirage-clock-9-65b"],
  },
  {
    slug: "mirage-clock-9-65b", name: "Mirage Clock 9-65B", tagline: "Stamina UX. Gira finché l'altro si ferma.",
    description: "Mirage Clock 9-65B è una trottola stamina della linea UX: la blade rotonda con corona dentata distribuisce il peso sul bordo per restare in piedi a lungo, il Ratchet 9-65 alza l'assetto e il Bit B (Ball) riduce l'attrito sulla punta. Richiede lanciatore e Beystadium Beyblade X (venduti separatamente).",
    price: eur(1950), category: "beyblade-x", bladeType: "stamina", stock: "pre-ordine", releasePreorder: true, availableQuantity: 9, tags: ["novita"], rating: 0, reviewCount: 0,
    images: productImages["mirage-clock-9-65b"],
    specs: [{ label: "Tipo", value: "Stamina" }, { label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Linea", value: "UX (Unique Line)" }, { label: "Codice", value: "9-65B" }, { label: "Componenti", value: "1 trottola" }, { label: "Nota", value: "Richiede lanciatore e Beystadium (venduti a parte)" }],
    features: [{ title: "Bit Ball", description: "Punta sferica: poco attrito, tanta resistenza" }, { title: "Peso sul bordo", description: "La corona dentata tiene la rotazione stabile" }, { title: "Linea UX", description: "Blade dal profilo esclusivo della Unique Line" }, { title: "Compatibile Beyblade X", description: "Blade, Ratchet e Bit intercambiabili con la serie" }],
    boxContents: ["1 × Trottola Mirage Clock 9-65B", "Manuale"],
    relatedSlugs: ["suppress-superion-0-70lp", "cobalt-drake-4-60f", "shatter-horus-9-65gb"],
  },
  {
    slug: "suppress-superion-0-70lp", name: "Suppress Superion 0-70LP", tagline: "Bilanciata BX. Tiene il centro.",
    description: "Suppress Superion 0-70LP è una trottola bilanciata della linea BX: la blade con il leone dorato unisce massa e superfici di contatto larghe per assorbire gli urti, mentre il Ratchet 0-70 e il Bit LP (Low Point) la tengono alta sul centro dello stadio, dove l'attacco avversario perde efficacia. Lo starter include il lanciatore. Richiede un Beystadium Beyblade X (venduto separatamente).",
    price: eur(2500), category: "beyblade-x", bladeType: "bilanciato", stock: "pre-ordine", releasePreorder: true, availableQuantity: 5, tags: ["novita"], rating: 0, reviewCount: 0,
    images: productImages["suppress-superion-0-70lp"],
    specs: [{ label: "Tipo", value: "Bilanciata" }, { label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Linea", value: "BX (Basic Line)" }, { label: "Codice", value: "0-70LP" }, { label: "Componenti", value: "1 trottola, 1 lanciatore" }, { label: "Nota", value: "Richiede un Beystadium (venduto a parte)" }],
    features: [{ title: "Bit Low Point", description: "Punta bassa che difende il centro dello stadio" }, { title: "Ratchet 0-70", description: "Profilo alto per incassare gli urti" }, { title: "Starter completo", description: "Include il lanciatore" }, { title: "Compatibile Beyblade X", description: "Blade, Ratchet e Bit intercambiabili con la serie" }],
    boxContents: ["1 × Trottola Suppress Superion 0-70LP", "1 × Lanciatore con ripcord", "Manuale"],
    relatedSlugs: ["strike-dran-4-50ff", "mirage-clock-9-65b", "tread-croc-tq-5-50gn"],
  },
  {
    slug: "strike-dran-4-50ff", name: "Strike Dran 4-50FF", tagline: "Attacco BX. Blade interna in metallo.",
    description: "Strike Dran 4-50FF è una trottola d'attacco della linea BX: la blade monta una lama interna in metallo che porta la massa verso il centro, il Ratchet 4-50 la tiene bassa e il Bit FF (Flat Force) la spinge in corse veloci sul bordo, pronte a colpire di taglio. Lo starter include il lanciatore. Richiede un Beystadium Beyblade X (venduto separatamente).",
    price: eur(2300), category: "beyblade-x", bladeType: "attacco", stock: "pre-ordine", releasePreorder: true, availableQuantity: 9, tags: ["novita"], rating: 0, reviewCount: 0,
    images: productImages["strike-dran-4-50ff"],
    specs: [{ label: "Tipo", value: "Attacco" }, { label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Linea", value: "BX (Basic Line)" }, { label: "Codice", value: "4-50FF" }, { label: "Componenti", value: "1 trottola, 1 lanciatore" }, { label: "Nota", value: "Richiede un Beystadium (venduto a parte)" }],
    features: [{ title: "Lama interna in metallo", description: "Massa concentrata al centro della blade" }, { title: "Bit Flat Force", description: "Corse rapide sul bordo per colpire di taglio" }, { title: "Starter completo", description: "Include il lanciatore" }, { title: "Compatibile Beyblade X", description: "Blade, Ratchet e Bit intercambiabili con la serie" }],
    boxContents: ["1 × Trottola Strike Dran 4-50FF", "1 × Lanciatore con ripcord", "Manuale"],
    relatedSlugs: ["cobalt-drake-4-60f", "suppress-superion-0-70lp", "tread-croc-tq-5-50gn"],
  },
  {
    slug: "tread-croc-tq-5-50gn", name: "Tread Croc TQ 5-50GN", tagline: "Attacco CX. Quattro pezzi da combinare.",
    description: "Tread Croc TQ 5-50GN è una trottola d'attacco della linea CX: la blade si scompone in quattro pezzi — lock chip, main blade, assist blade e il resto dell'assetto — per costruire combinazioni su misura, con Ratchet 5-50 e Bit GN. Lo starter include il lanciatore. Richiede un Beystadium Beyblade X (venduto separatamente).",
    price: eur(2500), category: "beyblade-x", bladeType: "attacco", stock: "pre-ordine", releasePreorder: true, availableQuantity: 9, tags: ["novita"], rating: 0, reviewCount: 0,
    images: productImages["tread-croc-tq-5-50gn"],
    specs: [{ label: "Tipo", value: "Attacco" }, { label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Linea", value: "CX (Custom Line)" }, { label: "Codice", value: "TQ 5-50GN" }, { label: "Componenti", value: "1 trottola, 1 lanciatore" }, { label: "Nota", value: "Richiede un Beystadium (venduto a parte)" }],
    features: [{ title: "Blade in quattro pezzi", description: "Lock chip e blade scomponibili per assetti su misura" }, { title: "Linea CX", description: "Combina i pezzi con le altre trottole Custom Line" }, { title: "Starter completo", description: "Include il lanciatore" }, { title: "Compatibile Beyblade X", description: "Blade, Ratchet e Bit intercambiabili con la serie" }],
    boxContents: ["1 × Trottola Tread Croc TQ 5-50GN", "1 × Lanciatore con ripcord", "Manuale"],
    relatedSlugs: ["hurricane-enlil-is-7-55t", "strike-dran-4-50ff", "cobalt-drake-4-60f"],
  },
  {
    // Owner, 2026-11-26: three Beybattle Pass, pre-ordered on Telegram only and paid with PayPal.me only
    // ("Bx-09 solo paypal.me"). Kept out of the shop until the back office drops the pre-order.
    slug: "bx-09-beybattle-pass", name: "BX-09 Beybattle Pass", tagline: "Misura la forza del tuo lancio e la registra.",
    description: "BX-09 è il Beybattle Pass di Takara Tomy: uno strumento che misura e registra la potenza del lancio. Collegato all'app dedicata di Takara Tomy, trasforma i dati dei tuoi lanci in Bey Point, i punti dell'app. Per usarlo servono una trottola, un lanciatore e uno stadio Beyblade X, venduti a parte: nella confezione non ci sono, come non ci sono il launcher grip e lo smartphone. Funziona con 2 pile alcaline AAA, non incluse. L'app è di Takara Tomy: prima di acquistare controlla che sia disponibile per il tuo telefono. Prodotto originale giapponese, confezione e istruzioni in giapponese.",
    price: eur(BX09_PRICE), category: "accessori", brand: "takara-tomy", stock: "pre-ordine", availableQuantity: 3, channelOnly: true, channelPayment: "paypal", tags: [], rating: 0, reviewCount: 0,
    images: productImages["bx-09-beybattle-pass"],
    specs: [{ label: "Tipo", value: "Strumento che misura il lancio" }, { label: "Produttore", value: "Takara Tomy (prodotto originale giapponese)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Codice prodotto", value: "BX-09" }, { label: "Alimentazione", value: "2 pile alcaline AAA, non incluse" }, { label: "App", value: "App dedicata di Takara Tomy" }, { label: "Non inclusi", value: "Trottola, lanciatore, launcher grip, stadio, smartphone" }, { label: "Confezione", value: "In giapponese" }],
    features: [{ title: "Misura il lancio", description: "Registra la potenza di ogni lancio" }, { title: "Si collega all'app", description: "I dati dei lanci diventano Bey Point nell'app di Takara Tomy" }, { title: "Originale Takara Tomy", description: "Prodotto giapponese della linea BX" }],
    boxContents: ["1 × Beybattle Pass", "Istruzioni in giapponese"],
    relatedSlugs: ["custom-grip-takara-tomy", "winder-launcher-takara-tomy", "string-launcher-takara-tomy"],
  },
  {
    // Owner, 2026-11-27: two UX-00 Scorpio Spear 0-70Z Metal Coat Magenta at 100 euro, pre-ordered
    // on Telegram only and paid with PayPal.me only ("metti pre-order due scorpion spear ma quello
    // magenta, al vendita al prezzo di 100euro", "Telegram, PayPal.me"). Kept out of the shop.
    slug: "ux-00-scorpio-spear-0-70z-magenta", name: "UX-00 Scorpio Spear 0-70Z Metal Coat: Magenta", tagline: "Esclusiva app/eventi. Sei lame, Metal Coat Magenta.",
    description: "UX-00 Scorpio Spear 0-70Z è il Booster di Takara Tomy in edizione esclusiva app/eventi: la trottola Scorpio Spear in Metal Coat Magenta, con ratchet 0-70 e bit Z (Zap). La blade ha sei lame in assetto difensivo che durante l'X-Dash si trasformano in tre lame in assetto d'attacco. Booster: nella confezione c'è solo la trottola, lanciatore e stadio non sono inclusi: servono quelli Beyblade X, venduti a parte. La vernice Metal Coat può consumarsi con l'uso. Prodotto originale giapponese, confezione in giapponese.",
    price: eur(UX00_SS_MAGENTA_PRICE), category: "beyblade-x", brand: "takara-tomy", stock: "pre-ordine", availableQuantity: 2, channelOnly: true, channelPayment: "paypal", tags: [], rating: 0, reviewCount: 0,
    images: productImages["ux-00-scorpio-spear-0-70z-magenta"],
    specs: [{ label: "Tipo", value: "Booster (edizione esclusiva app/eventi)" }, { label: "Produttore", value: "Takara Tomy (prodotto originale giapponese)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Codice prodotto", value: "UX-00" }, { label: "Componenti", value: "Blade Scorpio Spear + Ratchet 0-70 + Bit Z (Zap)" }, { label: "Colore", value: "Metal Coat: Magenta" }, { label: "Non inclusi", value: "Lanciatore, stadio" }, { label: "Confezione", value: "In giapponese" }],
    features: [{ title: "Trasformazione X-Dash", description: "Sei lame difensive diventano tre lame d'attacco durante l'X-Dash" }, { title: "Metal Coat Magenta", description: "Finitura esclusiva app/eventi; la vernice può consumarsi con l'uso" }, { title: "Originale Takara Tomy", description: "Edizione esclusiva app e eventi della linea UX" }],
    boxContents: ["1 × Trottola Scorpio Spear 0-70Z Metal Coat Magenta", "Istruzioni in giapponese"],
    relatedSlugs: ["bx-52-luster-dragoon-6-60lc", "ux-08-silver-wolf-3-80fb", "cx-20-customize-set-c"],
  },
  {
    // Owner, 2026-11-26: "arrivano 20 cx-20. mettili sul sito con avvisami e solo 8 in pre order per
    // telegram", paid on the site's checkout (his example of the same evening). The shop shows it sold
    // out with "Avvisami"; the eight pieces are in the database (preorder_allocation) and only the
    // channel's post opens the cart that sells them. When the pieces arrive the back office drops the
    // pre-order and it becomes a product of the shop like any other.
    slug: "cx-20-customize-set-c", name: "CX-20 Customize Set C", tagline: "Quattro blade, tre ratchet, sei bit: 72 combinazioni.",
    description: "CX-20 è il Customize Set C di Takara Tomy: un set di parti per costruire e cambiare le tue trottole. Dentro ci sono quattro blade, tre ratchet e sei bit, per 72 combinazioni. La trottola del set è Phoenix Force WHM-65MT, bilanciata, della linea CX con Expand Blade: ha metallo nella blade, nel ratchet M-65 e nel Bit MT (Metal Taper), quindi è molto pesante, per colpire forte e incassare. La sua blade si smonta in lock chip Phoenix, metal blade Force, over blade W (Weight) e assist blade H (Heavy). Le altre tre blade sono Shark Scale (UX, attacco), con due lame grandi per colpire dal basso; Wizard Rod in Metal Coat blu (UX, stamina), larga e con il peso verso l'esterno; Hells Scythe versione 2.0 (BX, bilanciata), con quattro lame, nella versione aggiornata da Takara Tomy. I ratchet sono M-65, 8-80 e 1-70. I bit sono MT (Metal Taper), UF (Under Flat), K (Kick), LR (Low Rush), LO (Low Orb) e HN (High Needle). Tutte e quattro le blade girano a destra. Lanciatore e stadio non sono inclusi: servono quelli Beyblade X, venduti a parte. La vernice Metal Coat può consumarsi con l'uso. Prodotto originale giapponese, confezione in giapponese.",
    price: eur(CX20_PRICE), category: "beyblade-x", brand: "takara-tomy", stock: "esaurito", availableQuantity: 0, channelOnly: "avvisami", channelPayment: "stripe", tags: [], rating: 0, reviewCount: 0,
    images: productImages["cx-20-customize-set-c"],
    specs: [{ label: "Tipo", value: "Set di parti da personalizzare" }, { label: "Produttore", value: "Takara Tomy (prodotto originale giapponese)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Codice prodotto", value: "CX-20" }, { label: "Componenti", value: "4 blade, 3 ratchet, 6 bit" }, { label: "Combinazioni", value: "72" }, { label: "Blade incluse", value: "Phoenix Force WH Metal Coat rossa (CX) · Shark Scale (UX) · Wizard Rod Metal Coat blu (UX) · Hells Scythe versione 2.0 (BX)" }, { label: "Ratchet inclusi", value: "M-65 · 8-80 · 1-70" }, { label: "Bit inclusi", value: "MT (Metal Taper) · UF (Under Flat) · K (Kick) · LR (Low Rush) · LO (Low Orb) · HN (High Needle)" }, { label: "Rotazione", value: "Destra, tutte e quattro le blade" }, { label: "Lanciatore e stadio", value: "Non inclusi" }, { label: "Confezione", value: "In giapponese" }],
    features: [{ title: "72 combinazioni", description: "Quattro blade, tre ratchet e sei bit da montare come vuoi" }, { title: "Phoenix Force WHM-65MT", description: "Metallo in blade, ratchet e bit: una trottola molto pesante" }, { title: "Shark Scale e Wizard Rod", description: "Una blade d'attacco e una di stamina della linea UX" }, { title: "Sei bit", description: "Per attacco, difesa, stamina e gioco bilanciato" }],
    boxContents: ["1 × Blade Phoenix Force WH Metal Coat rossa (lock chip Phoenix, metal blade Force, over blade W, assist blade H)", "1 × Blade Shark Scale", "1 × Blade Wizard Rod Metal Coat blu", "1 × Blade Hells Scythe versione 2.0", "1 × Ratchet M-65", "1 × Ratchet 8-80", "1 × Ratchet 1-70", "1 × Bit MT (Metal Taper)", "1 × Bit UF (Under Flat)", "1 × Bit K (Kick)", "1 × Bit LR (Low Rush)", "1 × Bit LO (Low Orb)", "1 × Bit HN (High Needle)", "Istruzioni in giapponese"],
    relatedSlugs: ["cx-18-random-booster-brachio-whip", "bx-52-luster-dragoon-6-60lc", "custom-grip-takara-tomy"],
  },
  {
    slug: "soar-phoenix-9-60gf", name: "Soar Phoenix 9-60GF", tagline: "Upper attack. Colpisci verso l'alto.",
    description: "Soar Phoenix 9-60GF è una trottola d'attacco a tre lame che salgono verso l'alto per un Upper Attack capace di sollevare l'avversario, unito allo Smash che lo spinge fuori arena. Tra le blade più pesanti della serie. Lo starter include il lanciatore a corda.",
    // Owner, 2026-11-19: 24,90 → 19,90 (other Italian shops 24,99-30,49, ~180 on the shelf), then the
    // same day 21,90: the shop paid 12,50 a piece, not the 8,00 the cut was worked out on.
    price: eur(2190), category: "beyblade-x", bladeType: "attacco", stock: "disponibile", availableQuantity: 199, tags: ["novita"], rating: 0, reviewCount: 0,
    images: productImages["soar-phoenix-9-60gf"],
    specs: [{ label: "Tipo", value: "Attacco" }, { label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Codice", value: "9-60GF" }, { label: "Componenti", value: "1 trottola, 1 lanciatore a corda" }, { label: "Materiale", value: "Plastica e metallo" }],
    features: [{ title: "Upper Attack", description: "Le tre lame sollevano l'avversario da terra" }, { title: "Peso elevato", description: "Massa che domina i confronti d'attacco" }, { title: "Starter completo", description: "Include il lanciatore a corda" }, { title: "Compatibile Beyblade X", description: "Blade, Ratchet e Bit intercambiabili con la serie" }],
    boxContents: ["1 × Trottola Soar Phoenix 9-60GF", "1 × Lanciatore a corda", "Manuale"],
    relatedSlugs: ["cobalt-dragoon-2-60c", "blast-pegasus-a-tr", "saber-samurai-2-70l"],
  },
  // Takara Tomy, the original Japanese line, on consignment from our partner (owner, 2026-10-07):
  // he keeps them in his warehouse and ships them himself; the shop keeps commissionCents a piece.
  {
    slug: "cx-00-evangelion-deck-set", name: "CX-00 Evangelion Deck Set", tagline: "Tre trottole Evangelion per i 30 anni della serie.",
    description: "Il CX-00 Evangelion Deck Set è l'edizione Takara Tomy per i 30 anni di Evangelion: tre trottole Beyblade X ispirate alle Unità 00, 01 e 02 (EvaArc, EvaBrave ed EvaBrush), due lanciatori Winder e il box porta trottole EVA HANGAR. Prodotto originale giapponese, confezione in giapponese. Spedito dal nostro partner.",
    price: eur(13500), category: "beyblade-x", brand: "takara-tomy", consignment: true, commissionCents: 500, stock: "disponibile", availableQuantity: 2, tags: [], rating: 0, reviewCount: 0,
    images: productImages["cx-00-evangelion-deck-set"],
    specs: [{ label: "Produttore", value: "Takara Tomy (prodotto originale giapponese)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Codice", value: "CX-00" }, { label: "Componenti", value: "3 trottole, 2 lanciatori Winder, 1 box porta trottole" }, { label: "Confezione", value: "In giapponese" }, { label: "Età", value: "Dai 6 anni (indicazione della confezione)" }],
    features: [{ title: "30 anni di Evangelion", description: "Collaborazione ufficiale Takara Tomy" }, { title: "Tre trottole", description: "EvaArc, EvaBrave ed EvaBrush, versioni Unità 00, 01 e 02" }, { title: "Due lanciatori Winder", description: "Si gioca subito in due" }, { title: "Box EVA HANGAR", description: "Porta trottole a tema incluso" }],
    boxContents: ["3 × Trottola Beyblade X (EvaArc, EvaBrave, EvaBrush)", "2 × Lanciatore Winder", "1 × Box porta trottole EVA HANGAR"],
    relatedSlugs: ["ux-00-glory-valkyrie-lf", "cx-00-tigarage-ft3-60t"],
  },
  {
    slug: "ux-00-glory-valkyrie-lf", name: "UX-00 Glory Valkyrie LF", tagline: "B4 Limited, Metal Coat blu.",
    description: "UX-00 Glory Valkyrie LF è l'edizione limitata B4 (Beyblade Battle Base) di Takara Tomy, con la blade in Metal Coat blu e il Bit Low Flat (LF) a punta piatta e bassa per un attacco rapido. Lo starter include il lanciatore a corda. Prodotto originale giapponese, confezione in giapponese. Spedito dal nostro partner.",
    price: eur(20500), category: "beyblade-x", bladeType: "attacco", brand: "takara-tomy", consignment: true, commissionCents: 500, stock: "disponibile", availableQuantity: 2, tags: [], rating: 0, reviewCount: 0,
    images: productImages["ux-00-glory-valkyrie-lf"],
    specs: [{ label: "Tipo", value: "Attacco" }, { label: "Produttore", value: "Takara Tomy (prodotto originale giapponese)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Linea", value: "UX" }, { label: "Codice", value: "UX-00 LF" }, { label: "Edizione", value: "B4 Limited, Metal Coat blu" }, { label: "Componenti", value: "1 trottola, 1 lanciatore a corda" }, { label: "Confezione", value: "In giapponese" }],
    features: [{ title: "Edizione limitata B4", description: "Venduta nei Beyblade Battle Base giapponesi" }, { title: "Metal Coat blu", description: "Finitura metallizzata della blade" }, { title: "Bit Low Flat", description: "Punta piatta e bassa per un attacco rapido" }, { title: "Starter completo", description: "Include il lanciatore a corda" }],
    boxContents: ["1 × Trottola Glory Valkyrie LF", "1 × Lanciatore a corda"],
    relatedSlugs: ["cx-00-evangelion-deck-set", "cx-00-tigarage-ft3-60t"],
  },
  {
    slug: "cx-00-tigarage-ft3-60t", name: "CX-00 Tigarage FT3-60T", tagline: "B4 Limited, collaborazione Ultraman Tiga.",
    description: "CX-00 Tigarage FT3-60T è l'edizione limitata B4 (Beyblade Battle Base) di Takara Tomy nata dalla collaborazione con Ultraman Tiga. Lo starter include il lanciatore e gli adesivi della collaborazione. Prodotto originale giapponese, confezione in giapponese. Spedito dal nostro partner.",
    price: eur(10399), category: "beyblade-x", brand: "takara-tomy", consignment: true, commissionCents: 500, stock: "disponibile", availableQuantity: 2, tags: [], rating: 0, reviewCount: 0,
    images: productImages["cx-00-tigarage-ft3-60t"],
    specs: [{ label: "Produttore", value: "Takara Tomy (prodotto originale giapponese)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Linea", value: "CX" }, { label: "Codice", value: "CX-00 FT3-60T" }, { label: "Edizione", value: "B4 Limited, collaborazione Ultraman Tiga" }, { label: "Componenti", value: "1 trottola, 1 lanciatore, adesivi" }, { label: "Confezione", value: "In giapponese" }],
    features: [{ title: "Edizione limitata B4", description: "Venduta nei Beyblade Battle Base giapponesi" }, { title: "Ultraman Tiga", description: "Collaborazione ufficiale con adesivi dedicati" }, { title: "Linea CX", description: "Blade componibile della Custom Line" }, { title: "Starter completo", description: "Include il lanciatore" }],
    boxContents: ["1 × Trottola Tigarage FT3-60T", "1 × Lanciatore", "Adesivi della collaborazione"],
    relatedSlugs: ["ux-00-glory-valkyrie-lf", "cx-00-evangelion-deck-set"],
  },
];

/**
 * Bundles sold as a single item, with their own price and Stripe product. They are not rows of
 * the product database: a bundle has no stock of its own, and every sale takes its components'
 * pieces (see lib/commerce/bundles.ts and the Stripe order webhook). `availableQuantity` here is
 * only the fallback when live stock cannot be read.
 */
export const BUNDLES: readonly Product[] = [
  // Owner, 2026-11-19 ("Sì, procedi" on the proposal): three attack starters off the deepest shelves
  // and a case, a few euros under what the other Italian shops ask for the same pieces. Glory
  // Valkerion 19,99 + Cobalt Dragoon 17,90 + Soar Phoenix 21,90 + case 18,00 = compareAt 77,79;
  // saving 17,89. Listed first: the newest offer leads the promotions row.
  {
    slug: "deck-da-torneo", name: "Deck da Torneo", tagline: "Tre attacchi e il porta deck. €17,89 in meno.",
    description: "Tre starter d'attacco e la custodia per portarli al torneo: Glory Valkerion LF, attacco UX a rotazione destra con il Bit Low Flat che aggancia l'Xtreme Line; Cobalt Dragoon 2-60C, attacco a rotazione sinistra con lo Smash delle quattro lame inclinate e il suo lanciatore left-spin; Soar Phoenix 9-60GF, Upper Attack con tre lame che sollevano l'avversario. Ogni starter ha il suo lanciatore. Il porta deck giallo tiene tre trottole, una per scomparto. Richiede un Beystadium Beyblade X (venduto separatamente).",
    price: eur(5990), compareAtPrice: eur(7779), category: "beyblade-x", stock: "disponibile", tags: ["offerta"], rating: 0, reviewCount: 0,
    images: productImages["deck-da-torneo"],
    specs: [{ label: "Contenuto", value: "3 starter, 3 lanciatori, 1 porta deck" }, { label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Codici", value: "LF · 2-60C · 9-60GF" }, { label: "Rotazione", value: "Cobalt Dragoon sinistra, le altre due destra" }, { label: "Porta deck", value: "Giallo, 3 scomparti, non ufficiale" }],
    features: [{ title: "Tre modi di attaccare", description: "Xtreme Dash, Smash left-spin e Upper Attack" }, { title: "Tre starter completi", description: "Ogni trottola ha il suo lanciatore" }, { title: "Porta deck incluso", description: "Tre scomparti, uno per trottola" }, { title: "Risparmi €17,89", description: "€59,90 invece di €77,79 comprandoli separati" }],
    boxContents: ["1 × Starter Glory Valkerion LF (trottola e lanciatore)", "1 × Starter Cobalt Dragoon 2-60C (trottola e lanciatore left-spin)", "1 × Starter Soar Phoenix 9-60GF (trottola e lanciatore a corda)", "1 × Porta Deck giallo", "Manuali"],
    relatedSlugs: ["glory-valkerion-lf", "cobalt-dragoon-2-60c", "soar-phoenix-9-60gf"],
    bundleOf: [{ slug: "glory-valkerion-lf", quantity: 1 }, { slug: "cobalt-dragoon-2-60c", quantity: 1 }, { slug: "soar-phoenix-9-60gf", quantity: 1 }, { slug: "porta-deck-giallo", quantity: 1 }],
  },
  // Owner, 2026-11-18: packs that reach the free shipping on their own, with the meta pieces (Phoenix,
  // Luster, Glory Valkerion), and that move the Enlil nobody picks alone; "magari 42 euro luster +
  // enlil". The two Luster packs share its six pieces; the Phoenix pack stops at the Brachio's shelf.
  // Listed first: the newest offer leads the promotions row.
  {
    // Luster Dragoon 39,99 + Hurricane Enlil 9,99 = compareAt 49,98; saving 7,98.
    slug: "duo-luster-enlil", name: "Duo Luster Dragoon + Hurricane Enlil", tagline: "Left-spin e bilanciata. Due starter, €7,98 in meno.",
    description: "Due starter in un pacco: Luster Dragoon 6-60LC di Takara Tomy, attacco a rotazione sinistra con il peso spostato da un lato e il Winder Launcher L con la Long Winder, e Hurricane Enlil IS 7-55T di Hasbro, bilanciata CX con la blade Infinity scomponibile e il suo lanciatore. Due trottole che girano in versi opposti, ognuna col suo lanciatore. Richiede un Beystadium Beyblade X (venduto a parte).",
    price: eur(4200), compareAtPrice: eur(4998), category: "beyblade-x", stock: "disponibile", availableQuantity: 6, tags: ["offerta"], rating: 0, reviewCount: 0,
    images: productImages["duo-luster-enlil"],
    specs: [{ label: "Tipo", value: "Attacco + Bilanciata" }, { label: "Produttore", value: "Takara Tomy e Hasbro (prodotti originali)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Codici", value: "6-60LC · IS 7-55T" }, { label: "Componenti", value: "2 trottole, 2 lanciatori" }, { label: "Rotazione", value: "Luster Dragoon sinistra, Hurricane Enlil destra" }],
    features: [{ title: "Due versi di rotazione", description: "Luster Dragoon gira a sinistra, Hurricane Enlil a destra" }, { title: "Lanciatore L incluso", description: "Nello starter di Luster Dragoon, con la Long Winder" }, { title: "Risparmi €7,98", description: "€42,00 invece di €49,98 comprandoli separati" }, { title: "Da sapere prima di comprare", description: "Luster Dragoon è giapponese: confezione e istruzioni in giapponese" }],
    boxContents: ["1 × Starter Luster Dragoon 6-60LC (trottola, Winder Launcher L e Long Winder)", "1 × Starter Hurricane Enlil IS 7-55T (trottola e lanciatore)", "Istruzioni"],
    relatedSlugs: ["bx-52-luster-dragoon-6-60lc", "pack-meta-luster", "hurricane-enlil-is-7-55t"],
    bundleOf: [{ slug: "bx-52-luster-dragoon-6-60lc", quantity: 1 }, { slug: "hurricane-enlil-is-7-55t", quantity: 1 }],
  },
  {
    // Luster 39,99 + Soar Phoenix 21,90 + Glory Valkerion 19,99 + Hover Wyvern 13,99 + Enlil 9,99 =
    // compareAt 105,86 (prices of 2026-11-19); at 100,00 it clears FREE_SHIPPING_THRESHOLD alone. Saving 5,86.
    slug: "pack-meta-luster", name: "Pack Meta Luster", tagline: "Cinque trottole a 100 €, spedizione gratuita.",
    description: "Il pack che da solo arriva a 100 € e spedisce gratis: Luster Dragoon 6-60LC di Takara Tomy, attacco a rotazione sinistra con il Winder Launcher L; Soar Phoenix 9-60GF, Upper Attack con il lanciatore a corda; Glory Valkerion LF, attacco UX con il lanciatore; Hover Wyvern 3-85N, difesa, imbustata e senza lanciatore; Hurricane Enlil IS 7-55T, bilanciata CX con il lanciatore. Cinque trottole tra attacco, difesa e bilanciata, quattro lanciatori. Richiede un Beystadium Beyblade X (venduto a parte).",
    price: eur(10000), compareAtPrice: eur(10586), category: "beyblade-x", stock: "disponibile", availableQuantity: 6, tags: ["offerta"], rating: 0, reviewCount: 0,
    images: productImages["pack-meta-luster"],
    specs: [{ label: "Contenuto", value: "5 trottole, 4 lanciatori" }, { label: "Produttore", value: "Takara Tomy e Hasbro (prodotti originali)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Codici", value: "6-60LC · 9-60GF · LF · 3-85N · IS 7-55T" }, { label: "Spedizione", value: "Gratuita: il pack arriva già a 100 €" }, { label: "Nota", value: "Richiede un Beystadium (venduto a parte)" }],
    features: [{ title: "Spedizione gratuita", description: "Da solo arriva a 100 €, la soglia della spedizione gratis" }, { title: "Lanciatore L incluso", description: "Luster Dragoon gira a sinistra e ha il suo lanciatore" }, { title: "Risparmi €5,86", description: "€100,00 invece di €105,86 comprandoli separati" }, { title: "Da sapere prima di comprare", description: "Hover Wyvern è imbustata, estratta dal Battle Set e senza lanciatore" }],
    boxContents: ["1 × Starter Luster Dragoon 6-60LC (trottola, Winder Launcher L e Long Winder)", "1 × Starter Soar Phoenix 9-60GF (trottola e lanciatore a corda)", "1 × Starter Glory Valkerion LF (trottola e lanciatore)", "1 × Trottola Hover Wyvern 3-85N imbustata", "1 × Starter Hurricane Enlil IS 7-55T (trottola e lanciatore)"],
    relatedSlugs: ["bx-52-luster-dragoon-6-60lc", "pack-meta-phoenix", "duo-luster-enlil"],
    bundleOf: [{ slug: "bx-52-luster-dragoon-6-60lc", quantity: 1 }, { slug: "soar-phoenix-9-60gf", quantity: 1 }, { slug: "glory-valkerion-lf", quantity: 1 }, { slug: "hover-wyvern-3-85n", quantity: 1 }, { slug: "hurricane-enlil-is-7-55t", quantity: 1 }],
  },
  {
    // Soar Phoenix 21,90 + Glory Valkerion 19,99 + Cobalt Dragoon 17,90 + Brachio Whip 28,00 + Shatter
    // Horus 11,99 + Hurricane Enlil 9,99 = compareAt 109,77 (prices of 2026-11-19); at 100,00 it ships free. Saving 9,77.
    slug: "pack-meta-phoenix", name: "Pack Meta Phoenix", tagline: "Sei trottole a 100 €, spedizione gratuita.",
    description: "Sei trottole a 100 €, spedizione gratuita compresa: Soar Phoenix 9-60GF, Upper Attack; Glory Valkerion LF, attacco UX; Cobalt Dragoon 2-60C, attacco a rotazione sinistra con il suo lanciatore left-spin; Brachio Whip OW5-70Nr dalla Random Booster CX-18 di Takara Tomy, stamina con il Bit Narrow, in un colore a sorpresa; Shatter Horus 9-65GB, stamina BX; Hurricane Enlil IS 7-55T, bilanciata CX. I cinque starter Hasbro hanno ognuno il suo lanciatore; Brachio Whip è solo la trottola, nella sua scatola sigillata. Richiede un Beystadium Beyblade X (venduto a parte).",
    price: eur(10000), compareAtPrice: eur(10977), category: "beyblade-x", stock: "disponibile", availableQuantity: 13, tags: ["offerta"], rating: 0, reviewCount: 0,
    images: productImages["pack-meta-phoenix"],
    specs: [{ label: "Contenuto", value: "6 trottole, 5 lanciatori" }, { label: "Produttore", value: "Hasbro e Takara Tomy (prodotti originali)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Codici", value: "9-60GF · LF · 2-60C · OW5-70Nr · 9-65GB · IS 7-55T" }, { label: "Spedizione", value: "Gratuita: il pack arriva già a 100 €" }, { label: "Nota", value: "Richiede un Beystadium (venduto a parte)" }],
    features: [{ title: "Spedizione gratuita", description: "Da solo arriva a 100 €, la soglia della spedizione gratis" }, { title: "Sei trottole, cinque lanciatori", description: "Attacco, left-spin, stamina e bilanciata nello stesso pacco" }, { title: "Risparmi €9,77", description: "€100,00 invece di €109,77 comprandoli separati" }, { title: "Da sapere prima di comprare", description: "Brachio Whip arriva in un colore a sorpresa e senza lanciatore" }],
    boxContents: ["1 × Starter Soar Phoenix 9-60GF (trottola e lanciatore a corda)", "1 × Starter Glory Valkerion LF (trottola e lanciatore)", "1 × Starter Cobalt Dragoon 2-60C (trottola e lanciatore left-spin)", "1 × Random Booster CX-18 Brachio Whip (solo trottola, colore a sorpresa)", "1 × Starter Shatter Horus 9-65GB (trottola e lanciatore)", "1 × Starter Hurricane Enlil IS 7-55T (trottola e lanciatore)"],
    relatedSlugs: ["pack-meta-luster", "soar-phoenix-9-60gf", "cx-18-random-booster-brachio-whip"],
    bundleOf: [{ slug: "soar-phoenix-9-60gf", quantity: 1 }, { slug: "glory-valkerion-lf", quantity: 1 }, { slug: "cobalt-dragoon-2-60c", quantity: 1 }, { slug: "cx-18-random-booster-brachio-whip", quantity: 1 }, { slug: "shatter-horus-9-65gb", quantity: 1 }, { slug: "hurricane-enlil-is-7-55t", quantity: 1 }],
  },
  {
    // Owner, 2026-11-18, asked the same day: a pack for the two Silver Wolf too. Silver Wolf 34,99 +
    // Soar Phoenix 21,90 + Glory Valkerion 19,99 + Cobalt Dragoon 17,90 + Hurricane Enlil 9,99 =
    // compareAt 104,77 (prices of 2026-11-19); at 100,00 it ships free. Saving 4,77. Two of them, like the Silver Wolf.
    slug: "pack-meta-silver-wolf", name: "Pack Meta Silver Wolf", tagline: "Cinque starter a 100 €, spedizione gratuita.",
    description: "Cinque starter a 100 €, spedizione gratuita compresa: Silver Wolf 3-80FB di Takara Tomy, stamina con l'anello libero e il Bit Free Ball; Soar Phoenix 9-60GF, Upper Attack; Glory Valkerion LF, attacco UX; Cobalt Dragoon 2-60C, attacco a rotazione sinistra con il suo lanciatore left-spin; Hurricane Enlil IS 7-55T, bilanciata CX. Ogni starter ha il suo lanciatore: cinque trottole, cinque lanciatori. Richiede un Beystadium Beyblade X (venduto a parte).",
    price: eur(10000), compareAtPrice: eur(10477), category: "beyblade-x", stock: "disponibile", availableQuantity: 2, tags: ["offerta"], rating: 0, reviewCount: 0,
    images: productImages["pack-meta-silver-wolf"],
    specs: [{ label: "Contenuto", value: "5 trottole, 5 lanciatori" }, { label: "Produttore", value: "Takara Tomy e Hasbro (prodotti originali)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Codici", value: "3-80FB · 9-60GF · LF · 2-60C · IS 7-55T" }, { label: "Spedizione", value: "Gratuita: il pack arriva già a 100 €" }, { label: "Nota", value: "Richiede un Beystadium (venduto a parte)" }],
    features: [{ title: "Spedizione gratuita", description: "Da solo arriva a 100 €, la soglia della spedizione gratis" }, { title: "Cinque starter completi", description: "Ogni trottola ha il suo lanciatore" }, { title: "Risparmi €4,77", description: "€100,00 invece di €104,77 comprandoli separati" }, { title: "Da sapere prima di comprare", description: "Silver Wolf è giapponese: confezione e istruzioni in giapponese" }],
    boxContents: ["1 × Starter Silver Wolf 3-80FB (trottola e Winder Launcher nero e argento)", "1 × Starter Soar Phoenix 9-60GF (trottola e lanciatore a corda)", "1 × Starter Glory Valkerion LF (trottola e lanciatore)", "1 × Starter Cobalt Dragoon 2-60C (trottola e lanciatore left-spin)", "1 × Starter Hurricane Enlil IS 7-55T (trottola e lanciatore)"],
    relatedSlugs: ["ux-08-silver-wolf-3-80fb", "pack-meta-luster", "pack-meta-phoenix"],
    bundleOf: [{ slug: "ux-08-silver-wolf-3-80fb", quantity: 1 }, { slug: "soar-phoenix-9-60gf", quantity: 1 }, { slug: "glory-valkerion-lf", quantity: 1 }, { slug: "cobalt-dragoon-2-60c", quantity: 1 }, { slug: "hurricane-enlil-is-7-55t", quantity: 1 }],
  },
  {
    // 2026-11-19: Hammer Incendio (three left) gives way to Shatter Horus, same 11,99, so price and
    // compare-at stay. Shadow Shinobi stays: Horus + Enlil + case would cost more than the Horus x Enlil
    // duo with a case at the kit price beside it (17,99 + 15).
    slug: "kit-doppio-starter-deck", name: "Kit Doppio Starter", tagline: "Due starter e il porta deck. Pronti a sfidarsi.",
    description: "Due starter Beyblade X completi di lanciatore, Shadow Shinobi 1-80MN e Shatter Horus 9-65GB, con il porta deck giallo per portarli in giro. Shadow Shinobi devia il colpo con tre lame lisce e il Bit MN la tiene in piedi; Shatter Horus è una stamina BX dalla forma rotonda, con il metallo esteso oltre i ganci: una incassa, l'altra resiste fino all'ultimo giro. Il porta deck tiene tre trottole, una per scomparto. Richiede un Beystadium Beyblade X (venduto separatamente).",
    price: eur(3690), compareAtPrice: eur(3998), category: "beyblade-x", stock: "disponibile", tags: ["offerta"], rating: 0, reviewCount: 0,
    images: productImages["kit-doppio-starter-deck"],
    specs: [{ label: "Contenuto", value: "2 starter, 2 lanciatori, 1 porta deck" }, { label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Trottole incluse", value: "Shadow Shinobi 1-80MN, Shatter Horus 9-65GB" }, { label: "Porta deck", value: "Giallo, 3 scomparti, non ufficiale" }, { label: "Nota", value: "Richiede un Beystadium (venduto a parte)" }],
    features: [{ title: "Due starter completi", description: "Ogni trottola ha il suo lanciatore con ripcord" }, { title: "Difesa e stamina", description: "Una devia i colpi, l'altra dura più a lungo" }, { title: "Porta deck incluso", description: "Tre scomparti, uno per trottola" }, { title: "Risparmi €3,08", description: "€36,90 invece di €39,98 comprandoli separati" }],
    boxContents: ["1 × Starter Shadow Shinobi 1-80MN (trottola e lanciatore)", "1 × Starter Shatter Horus 9-65GB (trottola e lanciatore)", "1 × Porta Deck giallo", "Manuali"],
    relatedSlugs: ["kit-arena-drop-completo", "shadow-shinobi-1-80mn", "shatter-horus-9-65gb"],
    bundleOf: [{ slug: "shadow-shinobi-1-80mn", quantity: 1 }, { slug: "shatter-horus-9-65gb", quantity: 1 }, { slug: "porta-deck-giallo", quantity: 1 }],
  },
  {
    // 2026-11-19: the two starters are Shatter Horus and Hurricane Enlil instead of Shadow Shinobi and
    // Hammer Incendio (three left): same 21,98 together, so price and compare-at stay.
    slug: "kit-arena-drop-completo", name: "Kit Arena Drop Attack", tagline: "Arena, quattro trottole e porta deck. Tutto in una volta.",
    description: "Tutto per cominciare e non comprare altro: il Drop Attack Battle Set — il Beystadium con l'X-Celerator Rail rialzato che porta le trottole in alto per farle piombare sull'avversario, due trottole e due lanciatori — più due starter completi, Shatter Horus 9-65GB e Hurricane Enlil IS 7-55T, e il porta deck giallo. In tutto quattro trottole e quattro lanciatori, con lo stadio per farle scontrare e la custodia per portarle in giro.",
    price: eur(7190), compareAtPrice: eur(7988), category: "beyblade-x", stock: "disponibile", tags: ["offerta"], rating: 0, reviewCount: 0,
    images: productImages["kit-arena-drop-completo"],
    specs: [{ label: "Contenuto", value: "1 stadio, 4 trottole, 4 lanciatori, 1 porta deck" }, { label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Stadio", value: "Drop Attack Battle Set" }, { label: "Starter inclusi", value: "Shatter Horus 9-65GB, Hurricane Enlil IS 7-55T" }, { label: "Porta deck", value: "Giallo, 3 scomparti, non ufficiale" }],
    features: [{ title: "Si gioca subito", description: "Stadio, trottole e lanciatori in una sola scatola" }, { title: "Quattro trottole", description: "Le due del set più i due starter" }, { title: "Porta deck incluso", description: "Tre scomparti, uno per trottola" }, { title: "Risparmi €7,98", description: "€71,90 invece di €79,88 comprandoli separati" }],
    boxContents: ["1 × Drop Attack Battle Set (stadio, 2 trottole, 2 lanciatori)", "1 × Starter Shatter Horus 9-65GB", "1 × Starter Hurricane Enlil IS 7-55T", "1 × Porta Deck giallo", "Manuali"],
    relatedSlugs: ["kit-doppio-starter-deck", "drop-attack-battle-set", "duo-horus-enlil"],
    bundleOf: [{ slug: "drop-attack-battle-set", quantity: 1 }, { slug: "shatter-horus-9-65gb", quantity: 1 }, { slug: "hurricane-enlil-is-7-55t", quantity: 1 }, { slug: "porta-deck-giallo", quantity: 1 }],
  },
  {
    // 2026-11-19: the two starters are Shatter Horus and Hurricane Enlil instead of Shadow Shinobi and
    // Hammer Incendio (three left): same 21,98 together, so price and compare-at stay.
    slug: "kit-arena-sneak-completo", name: "Kit Arena Sneak Attack", tagline: "Arena, quattro trottole e porta deck. Tutto in una volta.",
    description: "Tutto per cominciare e non comprare altro: il Sneak Attack Battle Set — il Beystadium verde con il rail a scomparsa che devia le trottole in una nuova direzione, due trottole e due lanciatori — più due starter completi, Shatter Horus 9-65GB e Hurricane Enlil IS 7-55T, e il porta deck giallo. In tutto quattro trottole e quattro lanciatori, con lo stadio per farle scontrare e la custodia per portarle in giro.",
    price: eur(7690), compareAtPrice: eur(8488), category: "beyblade-x", stock: "disponibile", tags: ["offerta"], rating: 0, reviewCount: 0,
    images: productImages["kit-arena-sneak-completo"],
    specs: [{ label: "Contenuto", value: "1 stadio, 4 trottole, 4 lanciatori, 1 porta deck" }, { label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Stadio", value: "Sneak Attack Battle Set" }, { label: "Starter inclusi", value: "Shatter Horus 9-65GB, Hurricane Enlil IS 7-55T" }, { label: "Porta deck", value: "Giallo, 3 scomparti, non ufficiale" }],
    features: [{ title: "Si gioca subito", description: "Stadio, trottole e lanciatori in una sola scatola" }, { title: "Quattro trottole", description: "Le due del set più i due starter" }, { title: "Porta deck incluso", description: "Tre scomparti, uno per trottola" }, { title: "Risparmi €7,98", description: "€76,90 invece di €84,88 comprandoli separati" }],
    boxContents: ["1 × Sneak Attack Battle Set (stadio, 2 trottole, 2 lanciatori)", "1 × Starter Shatter Horus 9-65GB", "1 × Starter Hurricane Enlil IS 7-55T", "1 × Porta Deck giallo", "Manuali"],
    relatedSlugs: ["kit-doppio-starter-deck", "sneak-attack-battle-set", "duo-horus-enlil"],
    bundleOf: [{ slug: "sneak-attack-battle-set", quantity: 1 }, { slug: "shatter-horus-9-65gb", quantity: 1 }, { slug: "hurricane-enlil-is-7-55t", quantity: 1 }, { slug: "porta-deck-giallo", quantity: 1 }],
  },
  {
    slug: "duo-pegasus-samurai", name: "Duo Lanciatori Speciali", tagline: "I due lanciatori che non trovi negli altri starter.",
    description: "I due starter Beyblade X che portano un lanciatore diverso dal solito: Blast Pegasus A Tr con il Clip & Rip Launcher, che si aggancia a cintura o zaino e ripone il ripcord all'interno, e Saber Samurai 2-70L con il lanciatore a impugnatura per lanci più stabili. Due trottole d'attacco della linea CX e UX, ognuna col suo lanciatore. Richiede un Beystadium Beyblade X (venduto separatamente).",
    price: eur(4790), compareAtPrice: eur(5280), category: "beyblade-x", stock: "disponibile", tags: ["offerta"], rating: 0, reviewCount: 0,
    images: productImages["duo-pegasus-samurai"],
    specs: [{ label: "Contenuto", value: "2 trottole, 2 lanciatori" }, { label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Trottole incluse", value: "Blast Pegasus A Tr, Saber Samurai 2-70L" }, { label: "Lanciatori", value: "Clip & Rip Launcher, lanciatore con impugnatura" }, { label: "Nota", value: "Richiede un Beystadium (venduto a parte)" }],
    features: [{ title: "Clip & Rip Launcher", description: "Si aggancia a cintura o zaino, ripcord all'interno" }, { title: "Lanciatore con impugnatura", description: "Presa piena per lanci potenti e stabili" }, { title: "Due linee diverse", description: "Una CX e una UX, entrambe d'attacco" }, { title: "Risparmi €4,90", description: "€47,90 invece di €52,80 comprandoli separati" }],
    boxContents: ["1 × Starter Blast Pegasus A Tr (trottola e Clip & Rip Launcher)", "1 × Starter Saber Samurai 2-70L (trottola e lanciatore con impugnatura)", "Manuali"],
    relatedSlugs: ["blast-pegasus-a-tr", "saber-samurai-2-70l", "kit-doppio-starter-deck"],
    bundleOf: [{ slug: "blast-pegasus-a-tr", quantity: 1 }, { slug: "saber-samurai-2-70l", quantity: 1 }],
  },
  {
    slug: "duo-horus-enlil", name: "Duo Shatter Horus + Hurricane Enlil", tagline: "Stamina contro bilanciata. Due starter, €3,99 in meno.",
    description: "Il duo mette insieme due Infinity Starter Beyblade X: Shatter Horus 9-65GB, trottola stamina della linea BX con il metallo esteso oltre i ganci, e Hurricane Enlil IS 7-55T, bilanciata CX con la blade Infinity scomponibile. Ogni starter include il proprio lanciatore: due assetti opposti, pronti a sfidarsi. Richiede un Beystadium Beyblade X (venduto separatamente).",
    price: eur(1799), compareAtPrice: eur(2198), category: "beyblade-x", stock: "disponibile", availableQuantity: 47, tags: ["offerta"], rating: 0, reviewCount: 0,
    images: productImages["duo-horus-enlil"],
    specs: [{ label: "Tipo", value: "Stamina + Bilanciata" }, { label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Linea", value: "BX + CX (Infinity Starter Pack)" }, { label: "Codice", value: "9-65GB · IS 7-55T" }, { label: "Componenti", value: "2 trottole, 2 lanciatori" }],
    features: [{ title: "Due starter completi", description: "Due trottole e due lanciatori, pronti a sfidarsi" }, { title: "Stili opposti", description: "Stamina BX contro bilanciata CX" }, { title: "Risparmi €3,99", description: "€17,99 invece di €21,98 comprandoli separati" }, { title: "Compatibile Beyblade X", description: "Blade, Ratchet e Bit intercambiabili con la serie" }],
    boxContents: ["1 × Starter Shatter Horus 9-65GB (trottola e lanciatore)", "1 × Starter Hurricane Enlil IS 7-55T (trottola e lanciatore)", "2 × Manuale"],
    relatedSlugs: ["shatter-horus-9-65gb", "hurricane-enlil-is-7-55t", "glory-valkerion-lf"],
    bundleOf: [{ slug: "shatter-horus-9-65gb", quantity: 1 }, { slug: "hurricane-enlil-is-7-55t", quantity: 1 }],
  },
  // Owner, 2026-10-08: "Promo Attack", Glory Valkerion with Buster Dran at 29,99.
  // 2026-10-14: price to 26,99; Glory Valkerion dropped to 19,99, compareAtPrice 19,99+8,90=28,89, saving 1,90.
  {
    slug: "promo-attack", name: "Promo Attack", tagline: "Glory Valkerion + Buster Dran. Due attacchi UX, €1,90 in meno.",
    description: "Due trottole d'attacco della linea UX in un solo pacco: lo starter Glory Valkerion LF, con il Bit Low Flat a punta piatta e bassa e l'Xtreme Dash per correre sul bordo dello stadio, e il booster Buster Dran 5-70DB, la blade ovale che concentra tutta la massa su un unico contatto. Glory Valkerion include il lanciatore; Buster Dran è la versione booster, con la sola trottola. Richiede un Beystadium Beyblade X (venduto separatamente).",
    price: eur(2699), compareAtPrice: eur(2889), category: "beyblade-x", stock: "disponibile", availableQuantity: 26, tags: ["offerta"], rating: 0, reviewCount: 0,
    images: productImages["promo-attack"],
    specs: [{ label: "Tipo", value: "Attacco + Attacco" }, { label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Linea", value: "UX" }, { label: "Codici", value: "LF · 5-70DB" }, { label: "Componenti", value: "2 trottole, 1 lanciatore" }],
    features: [{ title: "Due attacchi UX", description: "Due modi diversi di colpire, nello stesso deck" }, { title: "Lanciatore incluso", description: "Nello starter di Glory Valkerion" }, { title: "Risparmi €1,90", description: "€26,99 invece di €28,89 comprandoli separati" }, { title: "Da sapere prima di comprare", description: "Buster Dran è un booster: solo trottola, senza lanciatore" }],
    boxContents: ["1 × Starter Glory Valkerion LF (trottola e lanciatore)", "1 × Booster Buster Dran 5-70DB (solo trottola)", "Manuali"],
    relatedSlugs: ["glory-valkerion-lf", "buster-dran-5-70db", "duo-horus-enlil"],
    bundleOf: [{ slug: "glory-valkerion-lf", quantity: 1 }, { slug: "buster-dran-5-70db", quantity: 1 }],
  },
  {
    // 2026-11-19: Cobalt Dragoon 17,90 + Shadow Shinobi 9,99 + Impact Drake 13,99 = compareAt 41,88; saving 1,98.
    slug: "deck-completo-meta", name: "Deck Completo", tagline: "Tre ruoli, un deck. Attacco, difesa, Low Rush.",
    description: "Tre trottole che coprono i tre ruoli di un deck: Cobalt Dragoon 2-60C, l'unico attacco a rotazione sinistra del catalogo; Shadow Shinobi 1-80MN, che devia il colpo invece di rimbalzarlo; e Impact Drake 9-60LR, che porta il Ratchet 9-60 e il Bit Low Rush. I due starter includono il proprio lanciatore; Impact Drake arriva imbustato, estratto dal Battle Set e senza lanciatore. Richiede un Beystadium Beyblade X (venduto separatamente).",
    price: eur(3990), compareAtPrice: eur(4188), category: "beyblade-x", stock: "disponibile", availableQuantity: 26, tags: ["offerta"], rating: 0, reviewCount: 0,
    images: productImages["deck-completo-meta"],
    specs: [{ label: "Tipo", value: "Attacco + Difesa + Attacco basso" }, { label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Codici", value: "2-60C · 1-80MN · 9-60LR" }, { label: "Componenti", value: "3 trottole, 2 lanciatori" }],
    features: [{ title: "Un deck intero", description: "Tre ruoli diversi, non tre trottole a caso" }, { title: "Ratchet 9-60 e Bit Low Rush", description: "Due pezzi che girano spesso nelle build da torneo" }, { title: "Risparmi €1,98", description: "€39,90 invece di €41,88 comprandoli separati" }, { title: "Da sapere prima di comprare", description: "Impact Drake è imbustato, estratto dal Battle Set e senza lanciatore" }],
    boxContents: ["1 × Starter Cobalt Dragoon 2-60C (trottola e lanciatore)", "1 × Starter Shadow Shinobi 1-80MN (trottola e lanciatore)", "1 × Trottola Impact Drake 9-60LR imbustata"],
    relatedSlugs: ["impact-drake-9-60lr", "cobalt-dragoon-2-60c", "trio-starter-arena"],
    bundleOf: [{ slug: "cobalt-dragoon-2-60c", quantity: 1 }, { slug: "shadow-shinobi-1-80mn", quantity: 1 }, { slug: "impact-drake-9-60lr", quantity: 1 }],
  },
  {
    // 2026-10-14: Shatter Horus 11,99 + Hurricane Enlil 9,99 + Hover Wyvern 13,99 = compareAt 35,97; saving 6,07.
    slug: "trio-starter-arena", name: "Trio Starter", tagline: "Stamina, bilanciata, difesa. Si parte da qui.",
    description: "Tre trottole per chi comincia e vuole già tre assetti diversi: Shatter Horus 9-65GB, stamina BX con il metallo esteso oltre i ganci; Hurricane Enlil IS 7-55T, bilanciata CX con la blade Infinity scomponibile; e Hover Wyvern 3-85N, difesa con il Ratchet 3-85 fra i più alti della serie. I due starter includono il proprio lanciatore; Hover Wyvern arriva imbustato, estratto dal Battle Set e senza lanciatore. Richiede un Beystadium Beyblade X (venduto separatamente).",
    price: eur(2990), compareAtPrice: eur(3597), category: "beyblade-x", stock: "disponibile", availableQuantity: 47, tags: ["offerta"], rating: 0, reviewCount: 0,
    images: productImages["trio-starter-arena"],
    specs: [{ label: "Tipo", value: "Stamina + Bilanciata + Difesa" }, { label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Codici", value: "9-65GB · IS 7-55T · 3-85N" }, { label: "Componenti", value: "3 trottole, 2 lanciatori" }],
    features: [{ title: "Tre assetti opposti", description: "Stamina, bilanciata e difesa in un colpo solo" }, { title: "Blade Infinity scomponibile", description: "Hurricane Enlil si smonta per costruire l'assetto su misura" }, { title: "Risparmi €6,07", description: "€29,90 invece di €35,97 comprandoli separati" }, { title: "Da sapere prima di comprare", description: "Hover Wyvern è imbustato, estratto dal Battle Set e senza lanciatore" }],
    boxContents: ["1 × Starter Shatter Horus 9-65GB (trottola e lanciatore)", "1 × Starter Hurricane Enlil IS 7-55T (trottola e lanciatore)", "1 × Trottola Hover Wyvern 3-85N imbustata"],
    relatedSlugs: ["hover-wyvern-3-85n", "duo-horus-enlil", "deck-completo-meta"],
    bundleOf: [{ slug: "shatter-horus-9-65gb", quantity: 1 }, { slug: "hurricane-enlil-is-7-55t", quantity: 1 }, { slug: "hover-wyvern-3-85n", quantity: 1 }],
  },
];

/** The duo, as the managed homepage bundle banner presents it; its hero must be a product row in the database. */
export const BUNDLE: Bundle = {
  slug: "duo-horus-enlil", eyebrow: "Offerta duo", title: ["Horus ×", "Enlil."],
  description: "Due Infinity Starter Beyblade X, stamina contro bilanciata, a €17,99 invece di €21,98.", price: eur(1799), compareAtPrice: eur(2198),
  heroSlug: "shatter-horus-9-65gb", includes: ["shatter-horus-9-65gb", "hurricane-enlil-is-7-55t"],
};

/**
 * Shipping stops being charged only once the order can carry it. The stadium box is 45×45×15, so
 * every carrier bills it at its 6 kg volumetric weight: a parcel that costs far more than the
 * shipping collected. At €59 a single arena plus one small piece
 * cleared the threshold and shipped a bulky box for free, so the owner raised it to €100 on
 * 2026-09-29.
 */
export const FREE_SHIPPING_THRESHOLD = 10000;

export type ShippingMethodDefinition = {
  /** Stored on the order and sent by the checkout form; "standard" is Poste to the door, the code orders already carry. */
  readonly code: string;
  readonly carrier: "poste" | "inpost";
  readonly label: string;
  readonly priceCents: number;
  /** The buyer names the InPost point or locker the parcel goes to. */
  readonly pickupPoint: boolean;
};

/**
 * What the buyer picks at checkout, at what the parcel costs the shop to send.
 * History (owner decisions):
 *   2026-10-07 — InPost punto di ritiro 5,65 + Poste Italiane a casa 6,65.
 *   2026-10-13 — InPost Locker 4,90 added as the cheapest and default method.
 *   2026-10-14 — InPost punto di ritiro replaced by Poste Italiane punto di ritiro at the same
 *                5,65; mixed Hasbro+Takara carts locked to poste-point instead of inpost-point.
 *   2026-10-23 — InPost only: the shop ships every parcel through its InPost merchant account
 *                (labels and tracking from the API). Poste punto di ritiro is retired; Poste to the
 *                door stays only for the stadium boxes, which no Locker takes (BULKY_SHIPPING_METHOD).
 *
 * The first entry is the cheapest and the one a cart is priced with until the buyer chooses.
 * Free shipping from FREE_SHIPPING_THRESHOLD applies to every method.
 */
export const SHIPPING_METHODS: readonly ShippingMethodDefinition[] = [
  { code: "inpost-locker", carrier: "inpost", label: "InPost · Locker", priceCents: 490, pickupPoint: true },
];

/**
 * The stadium box (45×45×15 cm) does not fit the largest InPost Locker compartment (41×38×64 cm),
 * and the shop's InPost contract has no delivery to the door. A cart holding one ships to the
 * buyer's door with Poste Italiane instead, whatever else is in it (owner, 2026-10-23).
 */
export const BULKY_SHIPPING_METHOD: ShippingMethodDefinition = {
  code: "standard",
  carrier: "poste",
  label: "Poste Italiane · consegna a casa",
  priceCents: 665,
  pickupPoint: false,
};

/** Items whose box no InPost Locker takes. A bundle holding one is too big as well (fitsLocker). */
export const LOCKER_TOO_BIG: ReadonlySet<string> = new Set(["drop-attack-battle-set", "sneak-attack-battle-set", "bx-53-all-in-one-set"]);

/** False for a stadium box, or a bundle that holds one. */
export function fitsLocker(product: Pick<Product, "slug" | "bundleOf">): boolean {
  if (LOCKER_TOO_BIG.has(product.slug)) return false;
  return !(product.bundleOf ?? []).some((component) => LOCKER_TOO_BIG.has(component.slug));
}

/**
 * Retired shipping methods: no longer offered for new orders but still resolvable for display
 * in historical orders that were placed when these codes were active. Added to ALL_METHODS so
 * shippingMethodByCode() can still look them up for admin pages, emails and the webhook.
 * The checkout validation (quoteCart) never returns these codes.
 */
const RETIRED_SHIPPING_METHODS: readonly ShippingMethodDefinition[] = [
  // 2026-10-07–2026-10-13: InPost punto di ritiro replaced by poste-point on 2026-10-14.
  { code: "inpost-point", carrier: "inpost", label: "InPost · punto di ritiro", priceCents: 565, pickupPoint: true },
  // 2026-10-14–2026-10-22: Poste Italiane punto di ritiro, retired when the shop moved to InPost only.
  { code: "poste-point", carrier: "poste", label: "Poste Italiane · punto di ritiro", priceCents: 565, pickupPoint: true },
];

/**
 * Derived from the cheapest entry in SHIPPING_METHODS: the "da X €" shown on every banner.
 * Currently InPost Locker at €4,90 (owner, 2026-10-13). Changing the first SHIPPING_METHODS
 * entry automatically updates every banner, label and SEO string that imports this constant.
 */
export const SHIPPING_FLAT_RATE = Math.min(...SHIPPING_METHODS.map((m) => m.priceCents));

/**
 * Pieces sold out of an opened Battle Set or starter: a sealed bag with no retail box, so no barcode
 * of their own. Merchant Center is told so; every boxed Hasbro item does have an EAN, recorded when known.
 */
export const SOLD_WITHOUT_BARCODE: ReadonlySet<string> = new Set([
  "soar-phoenix-9-60gf-solo-trottola",
  "impact-drake-9-60lr",
  "hover-wyvern-3-85n",
  "winder-launcher-takara-tomy",
  "string-launcher-takara-tomy",
  "long-winder-launcher-takara-tomy",
]);

/** Where the buyer finds the InPost point or Locker nearest to them. */
export const INPOST_POINT_FINDER_URL = "https://inpost.it/trova-un-locker";

/** Where the buyer finds the nearest Poste Italiane Punto Poste or Locker. */
export const POSTE_POINT_FINDER_URL = "https://www.poste.it/cerca/index.html";

/**
 * The delivery method used for Takara Tomy consignment orders: our partner ships via Poste
 * Italiane to a Punto Poste or Locker. The price is €5,00 — lower than our Poste door-delivery
 * because it goes to a collection point, not straight to the buyer's address. The partner keeps
 * his own Poste account: the move to InPost (2026-10-23) is the shop's, not his.
 */
export const PARTNER_SHIPPING_METHOD: ShippingMethodDefinition = {
  code: "poste-point-partner",
  carrier: "poste",
  label: "Poste Italiane · Punto Poste o Locker",
  priceCents: 500,
  pickupPoint: true,
};

/**
 * All methods the shop can use, including the partner route for Takara Tomy consignment and
 * retired codes kept for historical order display. Retired codes are never offered at checkout.
 */
const ALL_METHODS: readonly ShippingMethodDefinition[] = [
  ...SHIPPING_METHODS,
  BULKY_SHIPPING_METHOD,
  PARTNER_SHIPPING_METHOD,
  ...RETIRED_SHIPPING_METHODS,
];

export function shippingMethodByCode(code: string | null | undefined): ShippingMethodDefinition | undefined {
  return ALL_METHODS.find((method) => method.code === code);
}

/**
 * The methods a single item ships with on its own: what its product page, the Merchant Center feed
 * and its structured data quote.
 */
export function shippingMethodsFor(
  product: Pick<Product, "slug" | "bundleOf" | "consignment" | "unofficial">,
): readonly ShippingMethodDefinition[] {
  if (shippingBrandOf(product) === "takara-tomy") return [PARTNER_SHIPPING_METHOD];
  return fitsLocker(product) ? SHIPPING_METHODS : [BULKY_SHIPPING_METHOD];
}

export type ShippingPlan = {
  /** The methods available for this cart, in preference order. */
  readonly methods: readonly ShippingMethodDefinition[];
  /** True when the composition forces a single method and the buyer cannot switch. */
  readonly locked: boolean;
  /** Human-readable description of the composition that triggered this plan. */
  readonly composition: "hasbro-only" | "takara-only" | "mixed" | "empty";
  /** Set on a locked plan: what forced it, so the checkout can say so. */
  readonly lockReasons?: readonly ShippingLockReason[];
};

/**
 * Derives the shipping plan for a cart based on whose warehouses its pieces leave from
 * (shippingBrandOf: "takara-tomy" stands for the partner's, "hasbro" for the shop's, whoever made
 * the piece) and whether one of its boxes is too big for a Locker.
 *
 * - Shop's pieces only (or empty): SHIPPING_METHODS (the InPost Locker).
 * - A stadium box in the cart: Poste to the door only, locked (owner, 2026-10-23).
 * - Partner's pieces only: only the partner's Poste Punto-Poste route, locked.
 * - Mixed: InPost Locker for the shop's parcel, locked; the partner sends his to the buyer's
 *   address with Poste (owner, 2026-10-23 — one charge, two warehouses, two parcels; was
 *   poste-point from 2026-10-14 and inpost-point before).
 *
 * FREE_SHIPPING_THRESHOLD applies to every plan at the quoting layer.
 */
export function shippingPlanFor(brands: ReadonlySet<BrandSlug>, bulky = false): ShippingPlan {
  const hasHasbro = brands.has("hasbro");
  const hasTakara = brands.has("takara-tomy");
  const composition = hasTakara && hasHasbro ? "mixed" : hasTakara ? "takara-only" : brands.size === 0 ? "empty" : "hasbro-only";

  if (composition === "takara-only") {
    return { methods: [PARTNER_SHIPPING_METHOD], locked: true, composition, lockReasons: ["partner"] };
  }
  if (bulky) {
    return {
      methods: [BULKY_SHIPPING_METHOD],
      locked: true,
      composition,
      lockReasons: composition === "mixed" ? ["bulky", "mixed"] : ["bulky"],
    };
  }
  if (composition === "mixed") {
    return { methods: SHIPPING_METHODS.slice(0, 1), locked: true, composition, lockReasons: ["mixed"] };
  }
  return { methods: SHIPPING_METHODS, locked: false, composition };
}

/**
 * Converts a ShippingMethodDefinition to a ShippingOption for the quote.
 * Pass `locked` to mark the option as non-switchable, and `lockReasons` to say why.
 */
export function toShippingOption(
  method: ShippingMethodDefinition,
  hint: string | null,
  locked?: boolean,
  lockReasons?: readonly ShippingLockReason[],
): ShippingOption {
  return {
    code: method.code,
    label: method.label,
    hint,
    price: { amount: method.priceCents, currency: "EUR" },
    ...(locked ? { locked: true } : {}),
    ...(locked && lockReasons?.length ? { lockReasons } : {}),
  };
}
