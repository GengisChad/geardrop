import { notFound } from "next/navigation";
import { Hero } from "@/components/home/hero";
import { CategoryTiles } from "@/components/home/category-tiles";
import { StatusLegend } from "@/components/home/status-legend";
import { TrustBandDark, TrustBarLight } from "@/components/home/trust";
import { BundleBanner } from "@/components/home/bundle-banner";
import { CompetitivePicks } from "@/components/home/competitive-picks";
import { ClubBand } from "@/components/home/club-band";
import { ProductCarousel } from "@/components/product/product-carousel";
import { getCommerceProvider } from "@/lib/commerce/provider";
import { storefrontContent } from "@/lib/content/provider";
import { HomepageSectionRenderer } from "@/components/content/homepage-section-renderer";
import { IntroGate } from "@/components/intro/intro-gate";

export default async function HomePage() {
  const commerce=await getCommerceProvider();
  const managedHomepage = await storefrontContent.getHomepage();
  if (managedHomepage !== null) {
    return (
      <>
        <IntroGate />
        {managedHomepage.map((section) => <HomepageSectionRenderer key={section.id} section={section} />)}
      </>
    );
  }
  const [featured, latest, bestSellers, bundle, hero, all] = await Promise.all([
    commerce.listProducts({ sort: "popolari", perPage: 6 }),
    commerce.listProducts({ sort: "novita", perPage: 6 }),
    commerce.listProducts({ sort: "popolari", category: "beyblade-x", perPage: 5 }),
    commerce.getBundle(),
    commerce.getProduct("stadio-beystadium-x-attack-set"),
    commerce.listProducts({ perPage: 100 }),
  ]);

  // The hero product is the catalogue's anchor SKU; without it the page is meaningless.
  if (!hero) notFound();

  return (
    <>
      <IntroGate />
      <Hero product={hero} />
      <CategoryTiles />
      <StatusLegend />

      <ProductCarousel title="In evidenza" products={featured.items} href="/negozio" dots className="pb-12" />

      <TrustBandDark className="pb-12" />

      <ProductCarousel title="Ultimi drop" products={latest.items} href="/negozio?sort=novita" className="pb-12" />

      <ProductCarousel
        title="Più venduti"
        products={bestSellers.items}
        href="/negozio/beyblade-x"
        ranked
        showRating
        className="pb-4"
      />

      {bundle ? <BundleBanner bundle={bundle} hero={hero} /> : null}

      <TrustBarLight className="pb-12" />

      <CompetitivePicks products={all.items} />

      <ClubBand />
    </>
  );
}
