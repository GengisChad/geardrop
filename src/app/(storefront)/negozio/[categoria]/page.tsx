import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CatalogHero } from "@/components/catalog/catalog-hero";
import { CatalogView } from "@/components/catalog/catalog-view";
import { TrustBandDark } from "@/components/home/trust";
import { CATEGORIES } from "@/data/catalog";
import { getCommerceProvider } from "@/lib/commerce/provider";
import { parseProductQuery, type RawSearchParams } from "@/lib/search-params";
import { breadcrumbJsonLd, categoryTitle, jsonLd } from "@/lib/seo";

type Params = { categoria: string };

export function generateStaticParams(): Params[] {
  return CATEGORIES.map((category) => ({ categoria: category.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const commerce=await getCommerceProvider();
  const category = await commerce.getCategory((await params).categoria);
  if (!category) return { title: "Categoria non trovata" };
  const title = categoryTitle(category.slug);
  return {
    title,
    description: category.description,
    alternates: { canonical: `/negozio/${category.slug}` },
    openGraph: {
      type: "website",
      url: `/negozio/${category.slug}`,
      title,
      description: category.description,
    },
    twitter: { card: "summary_large_image" },
  };
}

export default async function CategoriaPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<RawSearchParams>;
}) {
  const commerce=await getCommerceProvider();
  const { categoria } = await params;
  const category = await commerce.getCategory(categoria);
  if (!category) notFound();

  const query = { ...parseProductQuery(await searchParams), category: category.slug };
  const [page, facets] = await Promise.all([commerce.listProducts(query), commerce.getFacets(query)]);

  const breadcrumbData = breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Negozio", path: "/negozio" },
    { name: category.name, path: `/negozio/${category.slug}` },
  ]);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbData) }} />
      <CatalogHero
        title={category.name}
        tagline={category.tagline}
        description={category.description}
        crumbs={[{ label: "Home", href: "/" }, { label: "Negozio", href: "/negozio" }, { label: category.name }]}
      />

      <div className="py-8">
        <Suspense fallback={null}>
          <CatalogView
            page={page}
            facets={facets}
            lockedCategory={category.slug}
            emptyMessage={`Non ci sono ancora prodotti in ${category.name}. Stiamo lavorando al prossimo drop.`}
          />
        </Suspense>
      </div>

      <TrustBandDark className="pb-16" />
    </>
  );
}
