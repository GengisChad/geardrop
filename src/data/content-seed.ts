import { LEGAL_PAGES, SUPPORT_PAGES, type ContentPage } from "./pages";
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
    description: "Prodotti originali, drop esclusivi e una community di appassionati. Massima performance, ogni battaglia.",
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
      "stadio-beystadium-x-attack-set", "wizard-arrow-4-80b", "cobalt-dragoon-2-60c",
      "phoenix-wing-9-60gf", "shark-edge-3-60lf", "dran-sword-4-80db",
    ],
  },
  { key: "trust", type: "trust", title: "Prodotti originali. Spedizione veloce. Resi semplici." },
  {
    key: "latest-drops",
    type: "latest_drops",
    title: "Ultimi drop",
    cta: { label: "Scopri i nuovi arrivi", href: "/negozio?sort=novita" },
    productSlugs: [
      "stadio-beystadium-x-attack-set", "wizard-arrow-4-80b", "cobalt-dragoon-2-60c",
      "phoenix-wing-9-60gf", "shark-edge-3-60lf", "dran-sword-4-80db",
    ],
  },
  {
    key: "bestsellers",
    type: "bestsellers",
    title: "Più venduti",
    cta: { label: "Vedi Beyblade X", href: "/negozio/beyblade-x" },
    productSlugs: [
      "wizard-arrow-4-80b", "cobalt-dragoon-2-60c", "phoenix-wing-9-60gf",
      "shark-edge-3-60lf", "dran-sword-4-80db",
    ],
  },
  {
    key: "champion-bundle",
    type: "bundle",
    title: "Bundle campione",
    bundleSlugs: ["bundle-campione"],
  },
  {
    key: "competitive-picks",
    type: "competitive_products",
    title: "Scelti per il competitivo",
    cta: { label: "Guida alle combo", href: "/negozio/beyblade-x" },
    productSlugs: [
      "wizard-arrow-4-80b", "cobalt-dragoon-2-60c", "shark-edge-3-60lf",
      "dran-sword-4-80db", "phoenix-wing-9-60gf", "dran-buster-1-60a",
    ],
  },
  {
    key: "club",
    type: "club",
    title: "GEAR//DROP Club",
    subtitle: "Entra nel club. Sblocca vantaggi esclusivi.",
    cta: { label: "Scopri di più", href: "/account" },
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
  ...Object.entries(LEGAL_PAGES),
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
    excerpt: "GEAR//DROP è uno store indipendente costruito da blader per blader.",
    markdownSource: [
      "## Nati nello stadio. Cresciuti nella community.",
      "",
      "GEAR//DROP è uno store indipendente costruito da blader per blader. Un posto dove trovare i pezzi giusti, sapere davvero cosa stai comprando e riceverlo in fretta.",
      "",
      "## Come lavoriamo",
      "",
      "### Solo prodotti originali",
      "",
      "Vendiamo esclusivamente Beyblade X ufficiali. Nessuna replica: quello che compri è quello che porti in torneo.",
      "",
      "### Drop, non scaffali",
      "",
      "Ogni settimana entrano nuovi pezzi. Quando un drop finisce, finisce: preferiamo dirlo che fingere disponibilità.",
      "",
      "### Parliamo la lingua del gioco",
      "",
      "Attacco, difesa, stamina, bilanciato: se ci chiedi un consiglio su un assetto, sappiamo di cosa parli.",
      "",
      "### Community prima di tutto",
      "",
      "Siamo nati dalla community italiana di Beyblade X e continuiamo a farne parte, dentro e fuori dallo stadio.",
    ].join("\n"),
    seoTitle: "Chi siamo",
    seoDescription: "GEAR//DROP è il punto di riferimento italiano per Beyblade X: prodotti originali, spedizione veloce, community.",
    sortOrder: reviewedPages.length,
  },
] as const;

export const INITIAL_PUBLIC_SETTINGS = {
  storeName: "GEAR//DROP",
  seoTitle: "GEAR//DROP — Beyblade X per la community italiana",
  seoDescription: "Trottole, lanciatori, stadi e accessori Beyblade X. Prodotti originali, spedizione veloce in tutta Italia, drop settimanali.",
} as const;
