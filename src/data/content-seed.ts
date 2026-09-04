import { SUPPORT_PAGES, type ContentPage } from "./pages";
import { FOOTER_NAV, MAIN_NAV } from "../lib/navigation";

export type HomepageSectionSeed = {
  readonly key: string;
  readonly type: "hero" | "categories" | "status_legend" | "featured_products" | "trust" | "latest_drops" | "bestsellers" | "bundle" | "competitive_products" | "club";
  readonly eyebrow?: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly description?: string;
  readonly cta?: { readonly label: string; readonly href: string };
  readonly productSlugs?: readonly string[];
  readonly categorySlugs?: readonly string[];
  readonly bundleSlugs?: readonly string[];
};

export const HOMEPAGE_SECTION_SEEDS: readonly HomepageSectionSeed[] = [
  {
    key: "hero",
    type: "hero",
    eyebrow: "Beyblade X",
    title: "Pronti alla battaglia. Nati per vincere.",
    description: "Catalogo Beyblade X in pre-ordine, con disponibilità indicate e assistenza prima della conferma.",
    cta: { label: "Esplora il catalogo", href: "/negozio" },
  },
  {
    key: "categories",
    type: "categories",
    title: "Categorie",
    categorySlugs: ["beyblade-x", "lanciatori", "stadi", "accessori"],
  },
  { key: "status-legend", type: "status_legend", title: "Legenda della disponibilità" },
  {
    key: "featured-products",
    type: "featured_products",
    title: "In evidenza",
    cta: { label: "Vedi tutto", href: "/negozio" },
    productSlugs: [
      "cobalt-dragoon-2-60c", "soar-phoenix-9-60gf", "saber-samurai-2-70l",
      "blast-pegasus-a-tr", "drop-attack-battle-set", "sneak-attack-battle-set",
    ],
  },
  { key: "trust", type: "trust", title: "Pre-ordini con disponibilità indicate e spedizione entro 14 giorni dalla conferma." },
  {
    key: "latest-drops",
    type: "latest_drops",
    title: "Catalogo Beyblade X",
    cta: { label: "Esplora il catalogo", href: "/negozio" },
    productSlugs: [
      "cobalt-dragoon-2-60c", "soar-phoenix-9-60gf", "saber-samurai-2-70l",
      "blast-pegasus-a-tr", "drop-attack-battle-set", "sneak-attack-battle-set",
    ],
  },
  {
    key: "bestsellers",
    type: "bestsellers",
    title: "Pre-ordini aperti",
    cta: { label: "Vedi Beyblade X", href: "/negozio/beyblade-x" },
    productSlugs: [
      "cobalt-dragoon-2-60c", "soar-phoenix-9-60gf", "saber-samurai-2-70l",
      "blast-pegasus-a-tr", "drop-attack-battle-set",
    ],
  },
  {
    key: "competitive-picks",
    type: "competitive_products",
    title: "Esplora il catalogo",
    cta: { label: "Vedi Beyblade X", href: "/negozio/beyblade-x" },
    productSlugs: [
      "cobalt-dragoon-2-60c", "soar-phoenix-9-60gf", "saber-samurai-2-70l",
      "blast-pegasus-a-tr", "drop-attack-battle-set", "sneak-attack-battle-set",
    ],
  },
] as const;

export const NAVIGATION_MENU_SEEDS = [
  { key: "main", label: "Navigazione principale", items: MAIN_NAV },
] as const;

const FOOTER_KEYS = ["shop", "help", "account", "info"] as const;

export const FOOTER_COLUMN_SEEDS = FOOTER_NAV.map((column, index) => ({
  key: FOOTER_KEYS[index]!,
  title: column.title,
  links: column.links,
}));

function pageToMarkdown(page: ContentPage): string {
  const notice = page.notice ? `> ${page.notice}\n\n` : "";
  const sections = page.sections.map((section) =>
    `## ${section.heading}\n\n${section.body.join("\n\n")}`,
  ).join("\n\n");
  return `${notice}${sections}`;
}

const reviewedPages = [
  ...Object.entries(SUPPORT_PAGES),
] as readonly (readonly [string, ContentPage])[];

export const CONTENT_PAGE_SEEDS = [
  ...reviewedPages.map(([slug, page], sortOrder) => ({
    slug,
    title: page.title,
    excerpt: page.lead,
    markdownSource: pageToMarkdown(page),
    seoTitle: page.title,
    seoDescription: page.lead,
    sortOrder,
  })),
  {
    slug: "chi-siamo",
    title: "Chi siamo",
    excerpt: "GEAR//DROP è un progetto indipendente dedicato al catalogo Beyblade X.",
    markdownSource: [
      "## Pensato per il catalogo. Costruito per scegliere.",
      "",
      "GEAR//DROP è un progetto indipendente dedicato a un catalogo Beyblade X chiaro, con disponibilità indicate e assistenza prima dell'ordine.",
      "",
      "## Come lavoriamo",
      "",
      "### Catalogo leggibile",
      "",
      "Raccogliamo le informazioni essenziali su trottole, set e accessori Beyblade X in un catalogo chiaro.",
      "",
      "### Disponibilità esplicita",
      "",
      "Ogni pagina mostra la disponibilità corrente del pre-ordine, senza trasformarla in una promessa di consegna immediata.",
      "",
      "### Parliamo la lingua del gioco",
      "",
      "Attacco, difesa, stamina, bilanciato: se ci chiedi un consiglio su un assetto, sappiamo di cosa parli.",
      "",
      "### Assistenza prima dell'ordine",
      "",
      "L'ordine viene gestito con assistenza e senza addebito online finché il servizio di pagamento non è attivo.",
    ].join("\n"),
    seoTitle: "Chi siamo",
    seoDescription: "GEAR//DROP è un progetto indipendente dedicato al catalogo Beyblade X.",
    sortOrder: reviewedPages.length,
  },
] as const;

export const INITIAL_PUBLIC_SETTINGS = {
  storeName: "GEAR//DROP",
  seoTitle: "GEAR//DROP — Beyblade X per la community italiana",
  seoDescription: "Catalogo Beyblade X in pre-ordine: trottole, lanciatori, stadi e accessori con disponibilità indicate.",
} as const;
