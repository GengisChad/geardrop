import { notFound } from "next/navigation";
import { Hero } from "@/components/home/hero";
import { CategoryTiles } from "@/components/home/category-tiles";
import { TrustBandDark } from "@/components/home/trust";
import { CompetitivePicks } from "@/components/home/competitive-picks";
import { ProductCarousel } from "@/components/product/product-carousel";
import { Reveal } from "@/components/ui/reveal";
import { getCommerceProvider } from "@/lib/commerce/provider";

export default async function HomePage() {
  const commerce = await getCommerceProvider();
  const [featured, latest, bestSellers, hero, all] = await Promise.all([
    commerce.listProducts({ sort: "popolari", perPage: 6 }),
    commerce.listProducts({ sort: "novita", perPage: 6 }),
    commerce.listProducts({ sort: "popolari", category: "beyblade-x", perPage: 5 }),
    commerce.getProduct("drop-attack-battle-set"),
    commerce.listProducts({ perPage: 100 }),
  ]);

  // The hero product is the catalogue's anchor SKU; without it the page is meaningless.
  if (!hero) notFound();

  return (
    <>
      <Hero product={hero} />

      <Reveal>
        <CategoryTiles />
      </Reveal>

      <Reveal>
        <ProductCarousel title="In evidenza" products={featured.items} href="/negozio" dots className="pb-12 pt-2" />
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
          className="pb-12"
        />
      </Reveal>

      <Reveal>
        <CompetitivePicks products={all.items} />
      </Reveal>
    </>
  );
}
