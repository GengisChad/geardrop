/**
 * The local catalogue.
 *
 * Every field is taken from the supplied mockups; nothing here is invented. Where the
 * mockups contradict each other (they are AI-generated and do), the resolution is
 * documented in docs/reference-audit.md §8. Only products with a real supplied image
 * exist — no SKU was fabricated to pad the grid.
 */

import { productImages } from "@/data/assets";
import type { Bundle, Category, Product } from "@/lib/commerce/types";

const eur = (amount: number) => ({ amount, currency: "EUR" }) as const;

export const CATEGORIES: readonly Category[] = [
  {
    slug: "beyblade-x",
    name: "Beyblade X",
    tagline: "Scatena la tua energia. Domina lo stadio.",
    description:
      "Tutta la collezione di trottole Beyblade X: attacco, difesa, stamina e bilanciate, pronte per ogni scontro.",
  },
  {
    slug: "lanciatori",
    name: "Lanciatori",
    tagline: "Potenza e controllo nelle tue mani.",
    description: "Lanciatori a corda e accessori di lancio per colpi precisi e ripetibili.",
  },
  {
    slug: "stadi",
    name: "Stadi",
    tagline: "Arene per battaglie epiche.",
    description: "Stadi e set arena ufficiali Beyblade X, studiati per urti estremi e KO spettacolari.",
  },
  {
    slug: "accessori",
    name: "Accessori",
    tagline: "Personalizza. Migliora. Vinci.",
    description: "Attrezzi, custodie e ricambi per tenere il tuo arsenale sempre pronto.",
  },
];

export const PRODUCTS: readonly Product[] = [
  {
    slug: "stadio-beystadium-x-attack-set",
    name: "Stadio Beystadium X Attack Set",
    tagline: "Arena, 2 trottole e 2 lanciatori inclusi.",
    description:
      "Lo Stadium X Attack Set è l'arena definitiva per chi ama l'azione senza compromessi. La sua forma esclusiva guida le trottole verso il centro, aumentando la frequenza degli urti e le possibilità di KO spettacolari. Il set include 2 trottole ufficiali Beyblade X e 2 lanciatori di precisione, per sfide epiche subito pronte all'azione.",
    price: eur(4999),
    category: "stadi",
    stock: "disponibile",
    tags: ["novita"],
    rating: 4.8,
    reviewCount: 237,
    images: productImages["stadio-beystadium-x-attack-set"],
    specs: [
      { label: "Tipo", value: "Kit arena" },
      { label: "Sistema", value: "Beyblade X" },
      { label: "Componenti", value: "1 stadio, 2 trottole, 2 lanciatori" },
      { label: "Materiale", value: "Plastica e metallo" },
    ],
    features: [
      { title: "Stadio X Attack", description: "Design ottimizzato per scontri intensi e KO spettacolari" },
      { title: "Include 2 trottole", description: "Pronte all'azione con ottime performance" },
      { title: "2 lanciatori inclusi", description: "Lanci potenti e precisi per dominare l'arena" },
      { title: "Compatibile Beyblade X", description: "Usa tutte le trottole e accessori della serie Beyblade X" },
      { title: "Perfetto per sfide epiche", description: "Ideale per duelli 1 contro 1 tra amici e collezionisti" },
    ],
    boxContents: ["1 × Stadio Beystadium X", "2 × Trottole Beyblade X", "2 × Lanciatori a corda", "Manuale di gioco"],
    relatedSlugs: ["wizard-arrow-4-80b", "cobalt-dragoon-2-60c", "phoenix-wing-9-60gf", "shark-edge-3-60lf"],
  },
  {
    slug: "wizard-arrow-4-80b",
    name: "Wizard Arrow 4-80B",
    tagline: "Equilibrio perfetto tra velocità e impatto.",
    description:
      "Wizard Arrow 4-80B unisce una linea aggressiva a un assetto stabile: accelera in curva e mantiene la traiettoria anche dopo gli urti più duri. Una scelta solida per chi costruisce combo d'attacco affidabili.",
    price: eur(2499),
    category: "beyblade-x",
    bladeType: "attacco",
    stock: "disponibile",
    tags: [],
    rating: 4.5,
    reviewCount: 1230,
    images: productImages["wizard-arrow-4-80b"],
    specs: [
      { label: "Tipo", value: "Attacco" },
      { label: "Sistema", value: "Beyblade X" },
      { label: "Componenti", value: "1 Top" },
      { label: "Materiale", value: "Plastica e metallo" },
    ],
    features: [
      { title: "Assetto d'attacco", description: "Massimizza l'aggressività su ogni traiettoria" },
      { title: "Blade 4-80B", description: "Bilanciamento tra velocità di rotazione e impatto" },
      { title: "Compatibile Beyblade X", description: "Si monta con tutte le parti della serie" },
    ],
    boxContents: ["1 × Trottola Wizard Arrow 4-80B", "Manuale"],
    relatedSlugs: ["cobalt-dragoon-2-60c", "dran-buster-1-60a", "shark-edge-3-60lf", "phoenix-wing-9-60gf"],
  },
  {
    slug: "cobalt-dragoon-2-60c",
    name: "Cobalt Dragoon 2-60C Starter Pack",
    tagline: "Potenza esplosiva. Colpisci senza pietà.",
    description:
      "Cobalt Dragoon 2-60C combina un design aggressivo con prestazioni bilanciate per offrire attacchi devastanti e stabilità costante. Ideale per blader che vogliono imporsi in ogni scontro. Lo starter pack include il lanciatore a corda.",
    price: eur(3499),
    category: "beyblade-x",
    bladeType: "attacco",
    stock: "in-arrivo",
    tags: [],
    rating: 4.5,
    reviewCount: 987,
    images: productImages["cobalt-dragoon-2-60c"],
    specs: [
      { label: "Tipo", value: "Attacco" },
      { label: "Sistema", value: "Beyblade X" },
      { label: "Componenti", value: "1 Top, 1 Lancia a corda" },
      { label: "Materiale", value: "Plastica e metallo" },
    ],
    features: [
      { title: "Starter pack completo", description: "Trottola e lanciatore pronti all'uso" },
      { title: "Rotazioni stabili", description: "Attacchi rapidi senza perdere il controllo" },
      { title: "Compatibile Beyblade X", description: "Usa tutte le parti e gli accessori della serie" },
    ],
    boxContents: ["1 × Trottola Cobalt Dragoon 2-60C", "1 × Lanciatore a corda", "Manuale"],
    relatedSlugs: ["wizard-arrow-4-80b", "phoenix-wing-9-60gf", "shark-edge-3-60lf", "dran-sword-4-80db"],
  },
  {
    slug: "phoenix-wing-9-60gf",
    name: "Phoenix Wing 9-60GF",
    tagline: "Resistenza e controllo in ogni scontro.",
    description:
      "Phoenix Wing 9-60GF è costruita per durare: assorbe gli urti e restituisce rotazione, logorando gli avversari fino all'ultimo giro. La scelta di chi vince ai punti.",
    price: eur(2499),
    category: "beyblade-x",
    bladeType: "bilanciato",
    stock: "esaurito",
    tags: [],
    rating: 4.5,
    reviewCount: 845,
    images: productImages["phoenix-wing-9-60gf"],
    specs: [
      { label: "Tipo", value: "Bilanciato" },
      { label: "Sistema", value: "Beyblade X" },
      { label: "Componenti", value: "1 Top" },
      { label: "Materiale", value: "Plastica e metallo" },
    ],
    features: [
      { title: "Assetto bilanciato", description: "Versatilità totale su attacco e difesa" },
      { title: "Blade 9-60GF", description: "Resistenza agli urti e rotazione prolungata" },
      { title: "Compatibile Beyblade X", description: "Si monta con tutte le parti della serie" },
    ],
    boxContents: ["1 × Trottola Phoenix Wing 9-60GF", "Manuale"],
    relatedSlugs: ["dran-sword-4-80db", "shark-edge-3-60lf", "wizard-arrow-4-80b", "dran-buster-1-60a"],
  },
  {
    slug: "shark-edge-3-60lf",
    name: "Shark Edge 3-60LF",
    tagline: "Difesa solida. Resisti fino alla fine.",
    description:
      "Shark Edge 3-60LF è pensata per incassare: profilo basso, baricentro compatto e un bordo che devia gli attacchi invece di subirli. Chi prova a spingerti fuori se ne pentirà.",
    price: eur(2499),
    category: "beyblade-x",
    bladeType: "difesa",
    stock: "disponibile",
    tags: [],
    rating: 4.5,
    reviewCount: 612,
    images: productImages["shark-edge-3-60lf"],
    specs: [
      { label: "Tipo", value: "Difesa" },
      { label: "Sistema", value: "Beyblade X" },
      { label: "Componenti", value: "1 Top" },
      { label: "Materiale", value: "Plastica e metallo" },
    ],
    features: [
      { title: "Assetto difensivo", description: "Resistenza e controllo sotto pressione" },
      { title: "Blade 3-60LF", description: "Profilo basso che devia gli impatti" },
      { title: "Compatibile Beyblade X", description: "Si monta con tutte le parti della serie" },
    ],
    boxContents: ["1 × Trottola Shark Edge 3-60LF", "Manuale"],
    relatedSlugs: ["dran-buster-1-60a", "phoenix-wing-9-60gf", "wizard-arrow-4-80b", "cobalt-dragoon-2-60c"],
  },
  {
    slug: "dran-sword-4-80db",
    name: "Dran Sword 4-80DB",
    tagline: "Stamina infinita. Non fermarti mai.",
    description:
      "Dran Sword 4-80DB gira, e gira ancora. Dispersione minima e assetto pulito per portare il duello alla distanza e chiuderlo quando gli altri si sono già fermati.",
    price: eur(2499),
    category: "beyblade-x",
    bladeType: "stamina",
    stock: "in-arrivo",
    tags: [],
    rating: 4.5,
    reviewCount: 543,
    images: productImages["dran-sword-4-80db"],
    specs: [
      { label: "Tipo", value: "Stamina" },
      { label: "Sistema", value: "Beyblade X" },
      { label: "Componenti", value: "1 Top, 1 Lancia a corda" },
      { label: "Materiale", value: "Plastica e metallo" },
    ],
    features: [
      { title: "Assetto stamina", description: "Durata senza pari sulla lunga distanza" },
      { title: "Blade 4-80DB", description: "Rotazione pulita e dispersione minima" },
      { title: "Compatibile Beyblade X", description: "Si monta con tutte le parti della serie" },
    ],
    boxContents: ["1 × Trottola Dran Sword 4-80DB", "1 × Lanciatore", "Manuale"],
    relatedSlugs: ["phoenix-wing-9-60gf", "cobalt-dragoon-2-60c", "shark-edge-3-60lf", "dran-buster-1-60a"],
  },
  {
    slug: "dran-buster-1-60a",
    name: "Dran Buster 1-60A",
    tagline: "Impatto puro. Chiudi il match al primo colpo.",
    description:
      "Dran Buster 1-60A concentra tutta la massa dove serve: sull'urto. Costruita per chi non vuole aspettare i punti e preferisce chiudere con un KO.",
    price: eur(2499),
    category: "beyblade-x",
    bladeType: "attacco",
    stock: "disponibile",
    tags: [],
    rating: 4.5,
    reviewCount: 112,
    images: productImages["dran-buster-1-60a"],
    specs: [
      { label: "Tipo", value: "Attacco" },
      { label: "Sistema", value: "Beyblade X" },
      { label: "Componenti", value: "1 Top" },
      { label: "Materiale", value: "Plastica e metallo" },
    ],
    features: [
      { title: "Assetto d'attacco", description: "Massa concentrata sull'impatto" },
      { title: "Blade 1-60A", description: "Colpo secco, pensato per il KO" },
      { title: "Compatibile Beyblade X", description: "Si monta con tutte le parti della serie" },
    ],
    boxContents: ["1 × Trottola Dran Buster 1-60A", "Manuale"],
    relatedSlugs: ["wizard-arrow-4-80b", "shark-edge-3-60lf", "cobalt-dragoon-2-60c", "dran-sword-4-80db"],
  },
  {
    slug: "sneak-attack-battle-set",
    name: "Sneak Attack Battle Set",
    tagline: "Il set completo per iniziare a vincere.",
    description:
      "Sneak Attack Battle Set mette in scatola tutto quello che serve per il primo scontro: arena, trottole e lanciatori. Ordina ora, spediamo appena disponibile.",
    price: eur(6499),
    category: "stadi",
    stock: "pre-ordine",
    tags: ["limited"],
    rating: 4.6,
    reviewCount: 58,
    images: productImages["sneak-attack-battle-set"],
    specs: [
      { label: "Tipo", value: "Kit arena" },
      { label: "Sistema", value: "Beyblade X" },
      { label: "Componenti", value: "1 stadio, 2 trottole, 2 lanciatori" },
      { label: "Materiale", value: "Plastica e metallo" },
    ],
    features: [
      { title: "Set completo", description: "Arena, trottole e lanciatori in un'unica confezione" },
      { title: "Pronto al gioco", description: "Tutto quello che serve per il primo duello" },
      { title: "Compatibile Beyblade X", description: "Usa tutte le trottole della serie" },
    ],
    boxContents: ["1 × Stadio", "2 × Trottole Beyblade X", "2 × Lanciatori", "Manuale di gioco"],
    relatedSlugs: ["stadio-beystadium-x-attack-set", "wizard-arrow-4-80b", "cobalt-dragoon-2-60c", "dran-buster-1-60a"],
  },
];

/** "BUNDLE CAMPIONE" banner — figures taken from mockup-home-lower. */
export const BUNDLE: Bundle = {
  slug: "bundle-campione",
  eyebrow: "Bundle campione",
  title: ["Scatena il", "tuo potenziale."],
  description: "Arena, 2 trottole ad alte prestazioni e 2 lanciatori. Tutto ciò che ti serve per dominare.",
  price: eur(7999),
  compareAtPrice: eur(9996),
  heroSlug: "stadio-beystadium-x-attack-set",
  includes: ["stadio-beystadium-x-attack-set", "wizard-arrow-4-80b", "dran-buster-1-60a"],
};

/** Free shipping threshold, from the announcement bar: "SPEDIZIONE GRATUITA SOPRA 59€". */
export const FREE_SHIPPING_THRESHOLD = 5900;
/** Not stated in any mockup — chosen, and kept here so it is easy to find and change. */
export const SHIPPING_FLAT_RATE = 490;
