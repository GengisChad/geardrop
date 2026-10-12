import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CatalogHero } from "@/components/catalog/catalog-hero";
import { CatalogView } from "@/components/catalog/catalog-view";
import { TrustBandDark } from "@/components/home/trust";
import { BRANDS, PRODUCTS, brandOf } from "@/data/catalog";
import { getCommerceProvider } from "@/lib/commerce/provider";
import { parseProductQuery, type RawSearchParams } from "@/lib/search-params";
import { breadcrumbJsonLd, collectionJsonLd, jsonLd } from "@/lib/seo";

const BRAND = BRANDS.find((b) => b.slug === "takara-tomy")!;

export async function generateMetadata(): Promise<Metadata> {
  // notFound() in the page handles the empty case; metadata stays safe here.
  return {
    title: "Beyblade X Takara Tomy — linea giapponese originale",
    description: BRAND.description,
    alternates: { canonical: "/negozio/takara-tomy" },
    openGraph: {
      type: "website",
      url: "/negozio/takara-tomy",
      title: "Beyblade X Takara Tomy",
      description: BRAND.description,
    },
    twitter: { card: "summary_large_image" },
  };
}

export default async function TakaraTomyPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  // This page has no reason to exist until we stock Takara Tomy pieces.
  if (!PRODUCTS.some((p) => brandOf(p) === "takara-tomy")) notFound();

  const commerce = await getCommerceProvider();
  const query = { ...parseProductQuery(await searchParams), brand: "takara-tomy" as const };
  const [page, facets] = await Promise.all([commerce.listProducts(query), commerce.getFacets(query)]);

  const breadcrumbData = breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Negozio", path: "/negozio" },
    { name: BRAND.name, path: "/negozio/takara-tomy" },
  ]);
  const collectionData = collectionJsonLd(BRAND.name, "/negozio/takara-tomy", page.items);

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
            emptyMessage="Non ci sono ancora prodotti Takara Tomy disponibili. Stiamo lavorando al prossimo drop."
          />
        </Suspense>
      </div>

      <TrustBandDark className="pb-16" />
    </>
  );
}
