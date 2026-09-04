import type { Metadata } from "next";
import { Suspense } from "react";
import { ProductCard } from "@/components/product/product-card";
import { EmptyState } from "@/components/ui/empty-state";
import { SortSelect } from "@/components/catalog/sort-select";
import { getCommerceProvider } from "@/lib/commerce/provider";
import { parseProductQuery, type RawSearchParams } from "@/lib/search-params";

export const metadata: Metadata = {
  title: "Ricerca",
  robots: { index: false, follow: true },
};

export default async function RicercaPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = await searchParams;
  const query = parseProductQuery(params);
  const term = typeof params["q"] === "string" ? params["q"] : "";
  const commerce = await getCommerceProvider();
  const page = await commerce.listProducts({ ...query, perPage: 24 });

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
      <h1 className="gd-display-wide text-[2rem] font-extrabold text-graphite sm:text-[2.5rem]">Ricerca</h1>

      {term ? (
        <p className="mt-2 text-small text-grey-600">
          <span className="tabular font-bold text-graphite">{page.total}</span>{" "}
          {page.total === 1 ? "risultato" : "risultati"} per <span className="font-semibold text-violet">“{term}”</span>
        </p>
      ) : (
        <p className="mt-2 text-small text-grey-600">Cerca una trottola, un lanciatore o uno stadio.</p>
      )}

      {page.items.length > 0 ? (
        <>
          <div className="mt-6 flex justify-end">
            <Suspense fallback={null}>
              <SortSelect />
            </Suspense>
          </div>
          <ul data-testid="search-results" className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
            {page.items.map((product) => (
              <li key={product.slug}>
                <ProductCard product={product} showTagline className="h-full" />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <EmptyState
          className="mt-8"
          title={term ? "Nessun risultato" : "Inizia a cercare"}
          message={
            term
              ? `Non abbiamo trovato nulla per “${term}”. Prova con un altro termine o sfoglia il catalogo.`
              : "Usa la ricerca in alto per trovare quello che ti serve."
          }
          href="/negozio"
          linkLabel="Vedi tutto il catalogo"
        />
      )}
    </div>
  );
}
