import type { Metadata } from "next";
import { Suspense } from "react";
import { CatalogHero } from "@/components/catalog/catalog-hero";
import { CatalogView } from "@/components/catalog/catalog-view";
import { TrustBandDark } from "@/components/home/trust";
import { BRANDS } from "@/data/catalog";
import { getCommerceProvider } from "@/lib/commerce/provider";
import { parseProductQuery, type RawSearchParams } from "@/lib/search-params";
import { breadcrumbJsonLd, collectionJsonLd, jsonLd } from "@/lib/seo";

const BRAND = BRANDS.find((b) => b.slug === "hasbro")!;

export const metadata: Metadata = {
  title: "Beyblade X Hasbro — linea occidentale ufficiale",
  description: BRAND.description,
  alternates: { canonical: "/negozio/hasbro" },
  openGraph: {
    type: "website",
    url: "/negozio/hasbro",
    title: "Beyblade X Hasbro",
    description: BRAND.description,
  },
  twitter: { card: "summary_large_image" },
};

export default async function HasbroPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const commerce = await getCommerceProvider();
  const query = { ...parseProductQuery(await searchParams), brand: "hasbro" as const };
  const [page, facets] = await Promise.all([commerce.listProducts(query), commerce.getFacets(query)]);

  const breadcrumbData = breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Negozio", path: "/negozio" },
    { name: BRAND.name, path: "/negozio/hasbro" },
  ]);
  const collectionData = collectionJsonLd(BRAND.name, "/negozio/hasbro", page.items);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbData) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(collectionData) }} />
      <CatalogHero
        title={BRAND.name}
        tagline={BRAND.tagline}
        description={BRAND.description}
        crumbs={[{ label: "Home", href: "/" }, { label: "Negozio", href: "/negozio" }, { label: BRAND.name }]}
      />

      <div className="py-8">
        <Suspense fallback={null}>
          <CatalogView
            page={page}
            facets={facets}
            emptyMessage="Non ci sono ancora prodotti Hasbro. Stiamo lavorando al prossimo drop."
          />
        </Suspense>
      </div>

      <TrustBandDark className="pb-16" />
    </>
  );
}
