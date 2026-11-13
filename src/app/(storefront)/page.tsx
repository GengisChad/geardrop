import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Arsenal } from "@/components/home/arsenal";
import { HERO_CARDS, Hero } from "@/components/home/hero";
import { PROMO_SPOTLIGHT_HERO_TITLE, SPOTLIGHT_HERO_TITLE } from "@/lib/home/hero-title";
import { ProductShelf } from "@/components/home/product-shelf";
import { TrustBandDark } from "@/components/home/trust";
import { Reveal } from "@/components/ui/reveal";
import { ManagedHomepage, type ManagedHomepageFallback } from "@/components/content/managed-homepage";
import { getCommerceProvider } from "@/lib/commerce/provider";
import { storefrontContent } from "@/lib/content/provider";
import { RELEASE_DELIVERY, STANDARD_DELIVERY } from "@/lib/labels";
import { HOME_FEATURED_LIMIT, SPOTLIGHT_PROMO_SLUG, homepagePlan } from "@/lib/home/product-selection";
import { PRODUCTS } from "@/data/catalog";
import { jsonLd, siteJsonLd } from "@/lib/seo";
import { resolveHomepageSections } from "@/lib/storefront/homepage-resolver";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

/** The bundle the managed homepage can spotlight. */
const DUO_SLUG = "duo-horus-enlil";

export default async function HomePage() {
  const commerce = await getCommerceProvider();

  const [featured, latest, bestSellers, bundle, bundleHero, all, managed] = await Promise.all([
    commerce.listProducts({ sort: "popolari", perPage: HOME_FEATURED_LIMIT }),
    commerce.listProducts({ sort: "novita", perPage: 6 }),
    commerce.listProducts({ sort: "popolari", category: "beyblade-x", perPage: 5 }),
    commerce.getBundle(),
    commerce.getProduct(DUO_SLUG),
    commerce.listProducts({ perPage: 100 }),
    storefrontContent.getHomepage(),
  ]);

  // Without a catalogue the page has nothing to deal.
  if (all.items.length === 0) notFound();

  // The new releases still on sale lead, then what ships right away, then the rest.
  const plan = homepagePlan(all.items, HERO_CARDS);
  // The red Phoenix promotion (2026-11-13) is Hasbro: while it is in the spotlight the pitch names it.
  const promoInHero = plan.heroIsSpotlight && plan.hero.some((product) => product.slug === SPOTLIGHT_PROMO_SLUG);

  const fallback: ManagedHomepageFallback = {
    heroProducts: plan.hero,
    heroIsNewRelease: plan.heroIsNewRelease,
    bundleHero,
    bundle,
    featured: featured.items,
    latest: latest.items,
    bestSellers: bestSellers.items,
    all: all.items,
  };

  // Tells Google who sells here and how to search the shop (sitelinks search box).
  const hasPartnerPieces = PRODUCTS.some((p) => p.consignment);
  const structuredData = <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(siteJsonLd({ includePartner: hasPartnerPieces })) }} />;

  // Managed path: the CMS controls order, copy, visibility and product targets; the same
  // Holo Drop components render them. When no managed content is published, the approved
  // composition below stands in.
  if (managed && managed.length > 0) {
    const sections = await resolveHomepageSections(managed, commerce);
    return (
      <>
        {structuredData}
        <ManagedHomepage sections={sections} fallback={fallback} />
      </>
    );
  }

  // A spotlight, when the owner sets one (2026-11-06), takes the first screen and the best sellers
  // follow it. Otherwise the owner's order (2026-10-05): the best sellers on the first screen, the new arrivals and
  // the pre-order drop right under them, then what ships now, then everything else. It used to open on the drop
  // (2026-09-21); a shopper who arrives wanting what everyone buys now finds it first.
  // Clean on purpose: no fight animation, no banner in between.
  return (
    <>
      {structuredData}
      {/* The hero holds the LCP image, so it is never revealed on scroll: it paints at once. */}
      <Hero
        products={plan.hero}
        isNewRelease={plan.heroIsNewRelease || plan.heroIsSpotlight}
        limit={plan.heroIsSpotlight ? plan.hero.length : HERO_CARDS}
        {...(plan.heroIsSpotlight
          ? {
              heading: promoInHero ? "Offerta e nuovi arrivi Takara Tomy" : "Nuovi arrivi Takara Tomy",
              content: {
                eyebrow: promoInHero ? "Disponibili ora · Offerta e nuovi arrivi" : "Disponibili ora · Nuovi arrivi",
                title: promoInHero ? PROMO_SPOTLIGHT_HERO_TITLE : SPOTLIGHT_HERO_TITLE,
                description: promoInHero
                  ? "Soar Phoenix 9-60GF solo trottola, senza lanciatore, finché dura. Poi i Takara Tomy originali giapponesi: Random Booster BX-48 e CX-18, Custom Grip, Long Winder, String e Winder Launcher."
                  : "Random Booster BX-48 e CX-18, Custom Grip, Long Winder, String e Winder Launcher. Originali giapponesi, pronti da spedire.",
                ctaHref: "/negozio/takara-tomy",
                ctaLabel: "Tutto Takara Tomy",
              },
            }
          : {})}
        {...(plan.heroIsBestsellers
          ? {
              heading: "I più venduti",
              content: {
                eyebrow: "I più venduti · Pronti da spedire",
                description: "I pezzi che si vendono di più, pronti da spedire oggi.",
              },
            }
          : {})}
      />
      <ProductShelf testId="best-sellers" title="I più venduti" note={STANDARD_DELIVERY} products={plan.bestsellers} />
      <ProductShelf
        testId="new-arrivals"
        title="Appena arrivati"
        note={STANDARD_DELIVERY}
        products={plan.arrivals}
        tile={{ href: "/negozio?sort=novita", kicker: "Nuovi arrivi", title: "Tutte le novità" }}
      />
      {/* Violet means "on its way" across the shop: the pre-order drop sits on its own band. */}
      <ProductShelf testId="preorder-drop" tone="violet" title="Pre-ordini aperti" note={RELEASE_DELIVERY} products={plan.drop} />
      <ProductShelf testId="ready-to-ship" title="Pronti da spedire" note={STANDARD_DELIVERY} products={plan.ready} />
      <Arsenal products={plan.rest} title="Tutto il resto" />
      <Reveal>
        <TrustBandDark />
      </Reveal>
    </>
  );
}
