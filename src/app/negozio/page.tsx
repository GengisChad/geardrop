import type { Metadata } from "next";
import { Suspense } from "react";
import { CatalogHero } from "@/components/catalog/catalog-hero";
import { CatalogView } from "@/components/catalog/catalog-view";
import { TrustBandDark } from "@/components/home/trust";
import { productImages } from "@/data/assets";
import { commerce } from "@/lib/commerce/provider";
import { parseProductQuery, type RawSearchParams } from "@/lib/search-params";

export const metadata: Metadata = {
  title: "Tutti i prodotti",
  description: "Scopri l'intera collezione Beyblade X: trottole, lanciatori, stadi e accessori per dominare ogni scontro.",
};

export default async function NegozioPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const query = parseProductQuery(await searchParams);
  const [page, facets] = await Promise.all([commerce.listProducts(query), commerce.getFacets(query)]);

  return (
    <>
      <CatalogHero
        title="Tutti i prodotti"
        description="Scopri l'intera collezione Beyblade X: trottole, lanciatori, stadi e accessori per dominare ogni scontro."
        crumbs={[{ label: "Home", href: "/" }, { label: "Negozio" }]}
        art={productImages["stadio-beystadium-x-attack-set"][0]}
      />

      <div className="py-8">
        {/* useSearchParams in the filter controls needs a Suspense boundary. */}
        <Suspense fallback={<CatalogSkeleton />}>
          <CatalogView page={page} facets={facets} />
        </Suspense>
      </div>

      <TrustBandDark className="pb-16" />
    </>
  );
}

function CatalogSkeleton() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-16 sm:px-6">
      <div className="grid gap-8 lg:grid-cols-[16rem_1fr]">
        <div className="hidden h-96 animate-pulse rounded-[--radius-card] bg-grey-200 lg:block" />
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <li key={i} className="h-80 animate-pulse rounded-[--radius-card] bg-grey-200" />
          ))}
        </ul>
      </div>
    </div>
  );
}
