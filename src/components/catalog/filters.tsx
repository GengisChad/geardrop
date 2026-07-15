"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useId, useMemo, useOptimistic, useTransition } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { BLADE_TYPE_LABEL, CATEGORY_LABEL, STOCK_DOT, STOCK_LABEL } from "@/lib/labels";
import { formatPrice } from "@/lib/format";
import type { BladeType, CategorySlug, Facets, StockStatus } from "@/lib/commerce/types";
import { cn } from "@/lib/cn";

type FiltersProps = {
  facets: Facets;
  /** Locked when rendering inside a category route — the category is the page itself. */
  lockedCategory?: CategorySlug;
};

type Selection = {
  stock: StockStatus[];
  type: BladeType[];
  /** Max price in cents, or null for "no cap". */
  max: number | null;
};

/**
 * Filter state lives in the URL, so a filtered view is shareable and the back button
 * works. Every control writes the query string and lets the server re-render.
 *
 * The controls are driven by `useOptimistic`, not by the URL directly: a checkbox bound
 * straight to searchParams stays visually unchecked until the server round-trip lands,
 * which reads as a broken control on a slow connection. The optimistic value snaps back
 * to the URL once the transition settles, so the URL remains the source of truth.
 */
export function Filters({ facets, lockedCategory }: FiltersProps) {
  const router = useRouter();
  const params = useSearchParams();

  const actual = useMemo<Selection>(() => {
    const max = params.get("max");
    return {
      stock: (params.get("stock")?.split(",").filter(Boolean) ?? []) as StockStatus[],
      type: (params.get("type")?.split(",").filter(Boolean) ?? []) as BladeType[],
      max: max !== null && Number.isFinite(Number(max)) ? Math.round(Number(max) * 100) : null,
    };
  }, [params]);

  const [selection, setSelection] = useOptimistic(actual);
  const [isPending, startTransition] = useTransition();

  const apply = useCallback(
    (next: Selection) => {
      const query = new URLSearchParams(params.toString());
      if (next.stock.length) query.set("stock", next.stock.join(","));
      else query.delete("stock");
      if (next.type.length) query.set("type", next.type.join(","));
      else query.delete("type");
      if (next.max !== null && next.max < facets.priceRange.max) query.set("max", String(next.max / 100));
      else query.delete("max");
      query.delete("page"); // any filter change invalidates the current page number

      startTransition(() => {
        setSelection(next);
        const qs = query.toString();
        router.push(qs ? `?${qs}` : "?", { scroll: false });
      });
    },
    [params, router, setSelection, facets.priceRange.max],
  );

  const toggle = useCallback(
    <T extends string>(key: "stock" | "type", value: T) => {
      const current = selection[key] as T[];
      const updated = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      apply({ ...selection, [key]: updated });
    },
    [apply, selection],
  );

  const activeCount = selection.stock.length + selection.type.length + (selection.max !== null ? 1 : 0);

  return (
    <div data-testid="filters" aria-busy={isPending} className={cn("flex flex-col gap-6", isPending && "opacity-70")}>
      <div className="flex items-center justify-between">
        <p className="gd-display flex items-center gap-2 text-small font-bold tracking-wider text-graphite">
          <SlidersHorizontal className="size-4 text-violet" aria-hidden="true" />
          Filtri
        </p>
        {activeCount > 0 ? (
          <button
            type="button"
            data-testid="reset-filters"
            onClick={() => apply({ stock: [], type: [], max: null })}
            className="gd-display text-[0.6875rem] font-bold tracking-wider text-violet hover:text-violet-ink"
          >
            Resetta tutto
          </button>
        ) : null}
      </div>

      {activeCount > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {selection.stock.map((value) => (
            <FilterChip key={value} label={STOCK_LABEL[value]} onRemove={() => toggle("stock", value)} />
          ))}
          {selection.type.map((value) => (
            <FilterChip key={value} label={BLADE_TYPE_LABEL[value]} onRemove={() => toggle("type", value)} />
          ))}
          {selection.max !== null ? (
            <FilterChip
              label={`Fino a ${formatPrice({ amount: selection.max, currency: "EUR" })}`}
              onRemove={() => apply({ ...selection, max: null })}
            />
          ) : null}
        </ul>
      ) : null}

      {!lockedCategory ? (
        <FilterGroup title="Categorie">
          <ul className="flex flex-col">
            {facets.categories.map((facet) => (
              <li key={facet.value}>
                <a
                  href={`/negozio/${facet.value}`}
                  className="flex items-center justify-between py-2 text-small text-grey-600 transition-colors hover:text-violet"
                >
                  {CATEGORY_LABEL[facet.value]}
                  <span className="tabular text-[0.6875rem] text-grey-400">{facet.count}</span>
                </a>
              </li>
            ))}
          </ul>
        </FilterGroup>
      ) : null}

      <FilterGroup title="Disponibilità">
        <ul className="flex flex-col gap-2.5">
          {facets.stock.map((facet) => (
            <li key={facet.value}>
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 text-small",
                  facet.count === 0 && !selection.stock.includes(facet.value)
                    ? "cursor-not-allowed text-grey-400"
                    : "text-grey-600",
                )}
              >
                <input
                  type="checkbox"
                  disabled={facet.count === 0 && !selection.stock.includes(facet.value)}
                  checked={selection.stock.includes(facet.value)}
                  onChange={() => toggle("stock", facet.value)}
                  data-testid={`filter-stock-${facet.value}`}
                  className="size-4 shrink-0 rounded border-grey-300 accent-violet focus:ring-violet"
                />
                <span className={cn("size-2 shrink-0 rounded-full", STOCK_DOT[facet.value])} aria-hidden="true" />
                <span className="flex-1">{STOCK_LABEL[facet.value]}</span>
                <span className="tabular text-[0.6875rem] text-grey-400">{facet.count}</span>
              </label>
            </li>
          ))}
        </ul>
      </FilterGroup>

      <FilterGroup title="Tipo">
        <ul className="flex flex-col gap-2.5">
          {facets.bladeType.map((facet) => (
            <li key={facet.value}>
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 text-small",
                  facet.count === 0 && !selection.type.includes(facet.value)
                    ? "cursor-not-allowed text-grey-400"
                    : "text-grey-600",
                )}
              >
                <input
                  type="checkbox"
                  disabled={facet.count === 0 && !selection.type.includes(facet.value)}
                  checked={selection.type.includes(facet.value)}
                  onChange={() => toggle("type", facet.value)}
                  data-testid={`filter-type-${facet.value}`}
                  className="size-4 shrink-0 rounded border-grey-300 accent-violet focus:ring-violet"
                />
                <span className="flex-1">{BLADE_TYPE_LABEL[facet.value]}</span>
                <span className="tabular text-[0.6875rem] text-grey-400">{facet.count}</span>
              </label>
            </li>
          ))}
        </ul>
      </FilterGroup>

      <FilterGroup title="Fascia prezzo">
        <PriceSlider
          min={facets.priceRange.min}
          max={facets.priceRange.max}
          value={selection.max ?? facets.priceRange.max}
          onCommit={(cents) => apply({ ...selection, max: cents >= facets.priceRange.max ? null : cents })}
        />
      </FilterGroup>
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-grey-200 pt-5">
      <h3 className="gd-display mb-3 text-[0.6875rem] font-bold tracking-[0.15em] text-graphite">{title}</h3>
      {children}
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onRemove}
        className="inline-flex items-center gap-1.5 rounded-full border border-violet/40 bg-violet-tint px-2.5 py-1 text-[0.6875rem] font-semibold text-violet transition-colors hover:border-violet"
      >
        {label}
        <X className="size-3" aria-hidden="true" />
        <span className="sr-only">Rimuovi filtro</span>
      </button>
    </li>
  );
}

function PriceSlider({
  min,
  max,
  value,
  onCommit,
}: {
  min: number;
  max: number;
  value: number;
  onCommit: (cents: number) => void;
}) {
  // The desktop sidebar and the mobile sheet both mount a Filters instance (the sidebar
  // is only hidden with CSS), so a hardcoded id would appear twice in the DOM and make
  // the label ambiguous.
  const id = useId();

  return (
    <div>
      <label className="sr-only" htmlFor={id}>
        Prezzo massimo
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={100}
        // Uncontrolled on purpose: the thumb must track the drag at 60fps, and each
        // commit is a navigation. `key` resyncs it when the URL changes elsewhere.
        key={value}
        defaultValue={value}
        data-testid="price-slider"
        onMouseUp={(event) => onCommit(Number(event.currentTarget.value))}
        onTouchEnd={(event) => onCommit(Number(event.currentTarget.value))}
        onKeyUp={(event) => onCommit(Number(event.currentTarget.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-grey-200 accent-violet"
      />
      <div className="mt-2 flex justify-between text-[0.6875rem] text-grey-600">
        <span className="tabular">{formatPrice({ amount: min, currency: "EUR" })}</span>
        <span className="tabular">{formatPrice({ amount: max, currency: "EUR" })}</span>
      </div>
    </div>
  );
}
