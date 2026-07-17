import { Filters } from "@/components/catalog/filters";
import { FiltersSheet } from "@/components/catalog/filters-sheet";
import { Pagination } from "@/components/catalog/pagination";
import { SortSelect } from "@/components/catalog/sort-select";
import { ProductCard } from "@/components/product/product-card";
import { EmptyState } from "@/components/ui/empty-state";
import type { CategorySlug, Facets, ProductPage } from "@/lib/commerce/types";

type CatalogViewProps = {
  page: ProductPage;
  facets: Facets;
  lockedCategory?: CategorySlug;
  /** Shown when the category exists but has no SKUs yet. (audit §9.2) */
  emptyMessage?: string;
};

export function CatalogView({ page, facets, lockedCategory, emptyMessage }: CatalogViewProps) {
  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-16 sm:px-6">
      <div className="grid gap-8 lg:grid-cols-[16rem_1fr] lg:gap-10">
        <aside className="hidden lg:block">
          <div className="gd-glass-panel sticky top-28 rounded-[--radius-glass] p-5">
            <Filters facets={facets} {...(lockedCategory ? { lockedCategory } : {})} />
          </div>
        </aside>

        <div>
          <div className="mb-5 flex items-center justify-between gap-3">
            <p className="text-small text-grey-600">
              <span className="tabular font-bold text-graphite" data-testid="result-count">
                {page.total}
              </span>{" "}
              {page.total === 1 ? "prodotto trovato" : "prodotti trovati"}
            </p>
            <div className="flex items-center gap-2">
              <FiltersSheet facets={facets} {...(lockedCategory ? { lockedCategory } : {})} />
              <SortSelect />
            </div>
          </div>

          {page.items.length === 0 ? (
            <EmptyState
              title="Nessun prodotto"
              message={emptyMessage ?? "Nessun prodotto corrisponde ai filtri selezionati. Prova a rimuoverne qualcuno."}
              href="/negozio"
              linkLabel="Vedi tutto il catalogo"
            />
          ) : (
            <>
              <ul
                data-testid="product-grid"
                className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4"
              >
                {page.items.map((product, index) => (
                  <li key={product.slug}>
                    <ProductCard product={product} showTagline priority={index < 4} className="h-full" />
                  </li>
                ))}
              </ul>

              <div className="mt-10">
                <Pagination page={page.page} pageCount={page.pageCount} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
