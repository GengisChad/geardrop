import type { HomepageSection } from "@/lib/content/types";

const typeLabels: Record<HomepageSection["section_type"], string> = {
  hero: "Hero", announcement: "Annuncio", featured_products: "Prodotti in evidenza",
  latest_drops: "Ultimi drop", categories: "Categorie", competitive_products: "Competitivo",
  bestsellers: "Più venduti", new_arrivals: "Nuovi arrivi", offers: "Offerte", bundle: "Bundle",
  club: "Club", status_legend: "Legenda stati", trust: "Trust", newsletter: "Newsletter",
  promo_banner: "Banner promo", rich_text: "Testo", cta: "CTA",
};

export function HomepageSectionRenderer({ section, preview = false }: {
  readonly section: HomepageSection;
  readonly preview?: boolean;
}) {
  // The hero carries the page title, so it is the document's h1; every other section is
  // a sibling heading below it. Rendering h2 everywhere left the CMS-driven homepage
  // with no h1 at all — the static homepage has one, so the defect only existed on the
  // path production actually uses, and only the mock gate was watching.
  const Heading = section.section_type === "hero" ? "h1" : "h2";
  let targetCount = 0;
  switch (section.section_type) {
    case "featured_products":
    case "latest_drops":
    case "competitive_products":
    case "bestsellers":
    case "new_arrivals":
    case "offers":
      targetCount = section.productIds.length;
      break;
    case "categories":
      targetCount = section.categoryIds.length;
      break;
    case "bundle":
      targetCount = section.bundleIds.length;
      break;
    case "hero":
    case "announcement":
    case "club":
    case "status_legend":
    case "trust":
    case "newsletter":
    case "promo_banner":
    case "rich_text":
    case "cta":
      break;
    default:
      return null;
  }
  return <section className="border-b border-white/10 bg-graphite px-5 py-12 text-white sm:px-10" data-section-type={section.section_type}>
    <div className="mx-auto max-w-6xl">
      <p className="mb-3 text-[10px] font-black uppercase tracking-[.18em] text-lime">{section.eyebrow || typeLabels[section.section_type]}{preview ? " · preview" : ""}</p>
      <Heading className="gd-display max-w-4xl text-4xl font-extrabold uppercase leading-[.9] tracking-[-.045em] sm:text-6xl">{section.title || typeLabels[section.section_type]}</Heading>
      {section.subtitle ? <p className="mt-4 max-w-2xl text-base text-grey-300">{section.subtitle}</p> : null}
      {section.description ? <p className="mt-3 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-grey-400">{section.description}</p> : null}
      {targetCount > 0 ? <p className="mt-6 font-mono text-xs text-violet">{targetCount} target relazionali</p> : null}
      {section.cta_label && section.cta_href ? <a className="mt-7 inline-flex min-h-11 items-center rounded-lg bg-lime px-5 text-xs font-black text-graphite" href={section.cta_href}>{section.cta_label}</a> : null}
    </div>
  </section>;
}
