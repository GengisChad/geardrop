import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Arsenal } from "@/components/home/arsenal";
import { HERO_CARDS, Hero } from "@/components/home/hero";
import { PROMOS_HERO_TITLE, SPOTLIGHT_HERO_TITLE } from "@/lib/home/hero-title";
import { ProductShelf } from "@/components/home/product-shelf";
import { TrustBandDark } from "@/components/home/trust";
import { Reveal } from "@/components/ui/reveal";
import { ManagedHomepage, type ManagedHomepageFallback } from "@/components/content/managed-homepage";
import { getCommerceProvider } from "@/lib/commerce/provider";
import { storefrontContent } from "@/lib/content/provider";
import { RELEASE_DELIVERY, STANDARD_DELIVERY } from "@/lib/labels";
import { HOME_FEATURED_LIMIT, homepagePlan } from "@/lib/home/product-selection";
import { PRODUCTS } from "@/data/catalog";
import { NewsletterBanner } from "@/components/home/newsletter-banner";
import { displayName } from "@/lib/holo";
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
  // Owner, 2026-11-13: the promotions and bundles on sale open the page, named from the catalogue of the day.
  const promoBundles = plan.hero.filter((product) => product.bundleOf).length;
  const promoSingles = plan.hero.filter((product) => !product.bundleOf).map((product) => displayName(product.name));
  const promoDescription = [
    promoSingles.join(", "),
    promoBundles > 0 ? `${promoBundles} ${promoBundles === 1 ? "bundle che costa" : "bundle che costano"} meno dei pezzi presi da soli` : "",
  ]
    .filter(Boolean)
    .join(promoSingles.length > 0 && promoBundles > 0 ? " e " : "");

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
        limit={plan.heroIsPromos || plan.heroIsSpotlight ? plan.hero.length : HERO_CARDS}
        {...(plan.heroIsPromos
          ? {
              heading: "Promo e bundle attivi",
              content: {
                eyebrow: `Disponibili ora · ${plan.hero.length} ${plan.hero.length === 1 ? "offerta" : "offerte"}`,
                title: PROMOS_HERO_TITLE,
                description: `${promoDescription}.`,
              },
            }
          : {})}
        {...(plan.heroIsSpotlight
          ? {
              heading: "Nuovi arrivi Takara Tomy",
              content: {
                eyebrow: "Disponibili ora · Nuovi arrivi",
                title: SPOTLIGHT_HERO_TITLE,
                description: "Random Booster BX-48 e CX-18, Custom Grip, Long Winder, String e Winder Launcher. Originali giapponesi, pronti da spedire.",
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
      {plan.spotlight.length > 0 ? (
        <ProductShelf
          testId="spotlight"
          title="Nuovi arrivi Takara Tomy"
          note={STANDARD_DELIVERY}
          products={plan.spotlight}
          tile={{ href: "/negozio/takara-tomy", kicker: "Originali giapponesi", title: "Tutto Takara Tomy" }}
        />
      ) : null}
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
      {/* Owner, 2026-11-13: the newsletter ask, on the live site only, like the cookie banner it waits for. */}
      <NewsletterBanner
        enabled={process.env["VERCEL_ENV"] === "production" || process.env["NEWSLETTER_BANNER_PREVIEW"] === "1"}
        cookieBanner={process.env["VERCEL_ENV"] === "production" || process.env["COOKIE_BANNER_PREVIEW"] === "1"}
      />
    </>
  );
}
