import { notFound } from "next/navigation";
import { Hero } from "@/components/home/hero";
import { CategoryTiles } from "@/components/home/category-tiles";
import { StatusLegend } from "@/components/home/status-legend";
import { TrustBandDark, TrustBarLight } from "@/components/home/trust";
import { BundleBanner } from "@/components/home/bundle-banner";
import { CompetitivePicks } from "@/components/home/competitive-picks";
import { ClubBand } from "@/components/home/club-band";
import { ProductCarousel } from "@/components/product/product-carousel";
import { Reveal } from "@/components/ui/reveal";
import { getCommerceProvider } from "@/lib/commerce/provider";

export default async function HomePage() {
  const commerce = await getCommerceProvider();

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

  // The full liquid glass composition, served straight from the Supabase catalogue.
  //
  // The managed-homepage branch used to short-circuit this whole page and hand the CMS
  // rows to a placeholder renderer that painted a black scaffold reading "N target
  // relazionali" — real production data, wrong presentation. That branch is gone; the
  // managed CMS renderer that drives these same components lands next. This order is the
  // fallback for when no managed content is published, and it is never the black page.
  return (
    <>
      {/* The hero is the LCP element and sits above the fold, so it is never revealed on
          scroll: it must paint at once. Reveal starts below it. */}
      <Hero product={hero} />
      <CategoryTiles />
      <StatusLegend />

      <Reveal>
        <ProductCarousel title="In evidenza" products={featured.items} href="/negozio" dots className="pb-12" />
      </Reveal>

      <Reveal>
        <TrustBandDark className="pb-12" />
      </Reveal>

      <Reveal>
        <ProductCarousel title="Ultimi drop" products={latest.items} href="/negozio?sort=novita" className="pb-12" />
      </Reveal>

      <Reveal>
        <ProductCarousel
          title="Più venduti"
          products={bestSellers.items}
          href="/negozio/beyblade-x"
          ranked
          showRating
          className="pb-4"
        />
      </Reveal>

      {bundle ? (
        <Reveal>
          <BundleBanner bundle={bundle} hero={hero} />
        </Reveal>
      ) : null}

      <Reveal>
        <TrustBarLight className="pb-12" />
      </Reveal>

      <Reveal>
        <CompetitivePicks products={all.items} />
      </Reveal>

      <Reveal>
        <ClubBand />
      </Reveal>
    </>
  );
}
