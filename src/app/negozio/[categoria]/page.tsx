import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CatalogHero } from "@/components/catalog/catalog-hero";
import { CatalogView } from "@/components/catalog/catalog-view";
import { TrustBandDark } from "@/components/home/trust";
import { categoryArt, productImages } from "@/data/assets";
import { CATEGORIES } from "@/data/catalog";
import { getCommerceProvider } from "@/lib/commerce/provider";
import { parseProductQuery, type RawSearchParams } from "@/lib/search-params";
import type { CategorySlug } from "@/lib/commerce/types";

type Params = { categoria: string };

const HERO_ART: Record<CategorySlug, { src: string; width: number; height: number }> = {
  "beyblade-x": productImages["cobalt-dragoon-2-60c"][0],
  lanciatori: categoryArt.lanciatori,
  stadi: productImages["drop-attack-battle-set"][0],
  accessori: categoryArt.accessori,
};

export function generateStaticParams(): Params[] {
  return CATEGORIES.map((category) => ({ categoria: category.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const commerce = await getCommerceProvider();
  const category = await commerce.getCategory((await params).categoria);
  if (!category) return { title: "Categoria non trovata" };
  return { title: category.name, description: category.description };
}

export default async function CategoriaPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<RawSearchParams>;
}) {
  const { categoria } = await params;
  const commerce = await getCommerceProvider();
  const category = await commerce.getCategory(categoria);
  if (!category) notFound();

  const query = { ...parseProductQuery(await searchParams), category: category.slug };
  const [page, facets] = await Promise.all([commerce.listProducts(query), commerce.getFacets(query)]);

  return (
    <>
      <CatalogHero
        title={category.name}
        tagline={category.tagline}
        description={category.description}
        crumbs={[{ label: "Home", href: "/" }, { label: "Negozio", href: "/negozio" }, { label: category.name }]}
        art={HERO_ART[category.slug]}
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
