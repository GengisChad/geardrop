"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, ShoppingCart } from "lucide-react";
import { Emblem } from "@/components/layout/logo";
import { ProductCard } from "@/components/product/product-card";
import { Kicker } from "@/components/ui/kicker";
import { BLADE_TYPE_LABEL, CATEGORY_LABEL } from "@/lib/labels";
import { selectCartCount, useCart } from "@/lib/store/cart";
import type { Product } from "@/lib/commerce/types";
import { cn } from "@/lib/cn";

type Group = { readonly key: string; readonly label: string; readonly count: number };

const ALL = "tutti";

/** Tops group by blade type; stadiums, launchers and accessories by their category. */
function groupKey(product: Product): { key: string; label: string } {
  return product.bladeType
    ? { key: product.bladeType, label: BLADE_TYPE_LABEL[product.bladeType] }
    : { key: product.category, label: CATEGORY_LABEL[product.category] };
}

/**
 * "Tutto il drop": the whole catalogue as holographic cards, filtered in place by type.
 * Filtering hides cards rather than unmounting them, so the page keeps every product for
 * crawlers and the grid re-deals its entrance animation on each change.
 */
export function Arsenal({
  products,
  title = "Tutto il drop",
  kicker = "Arsenale",
}: {
  readonly products: readonly Product[];
  readonly title?: string;
  readonly kicker?: string;
}) {
  const [filter, setFilter] = useState(ALL);
  const hydrated = useCart((s) => s.hydrated);
  const count = useCart(selectCartCount);

  const groups = useMemo<readonly Group[]>(() => {
    const seen = new Map<string, Group>();
    for (const product of products) {
      const { key, label } = groupKey(product);
      seen.set(key, { key, label, count: (seen.get(key)?.count ?? 0) + 1 });
    }
    return [...seen.values()];
  }, [products]);

  if (products.length === 0) return null;

  const chips: readonly Group[] = [{ key: ALL, label: "Tutti", count: products.length }, ...groups];
  const cartLabel = hydrated && count > 0 ? `${count} ${count === 1 ? "articolo" : "articoli"} nel carrello` : "Carrello vuoto";

  return (
    <section
      data-testid="arsenal"
      aria-labelledby="arsenal-title"
      className="relative mx-auto max-w-[1400px] px-4 pb-16 pt-16 sm:px-6 lg:px-10 lg:pb-24 lg:pt-24"
    >
      <div className="mb-6 flex flex-col gap-5 lg:mb-9 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Kicker>{kicker}</Kicker>
          <h2 id="arsenal-title" className="gd-display-wide mt-3 text-[2.6rem] font-bold leading-[0.92] sm:text-[3.5rem] lg:text-[4.25rem]">
            {title}
          </h2>
        </div>

        <div className="flex min-w-0 flex-col gap-3 lg:items-end">
          {groups.length > 1 ? (
            <div
              role="group"
              aria-label="Filtra per tipo"
              className="gd-scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0 lg:justify-end"
            >
              {chips.map((chip) => {
                const on = filter === chip.key;
                return (
                  <button
                    key={chip.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setFilter(chip.key)}
                    className={cn(
                      "gd-display inline-flex h-11 shrink-0 items-center gap-2.5 border px-4 text-small font-semibold tracking-[0.05em] transition-colors duration-200",
                      on ? "border-lime bg-lime text-void" : "border-white/12 bg-white/[0.03] text-graphite hover:border-white/30",
                    )}
                  >
                    {chip.label}
                    <span className={cn("gd-mono text-[0.6875rem]", on ? "text-void" : "text-grey-400")}>{chip.count}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
          <Link
            href="/carrello"
            className="gd-mono inline-flex h-9 items-center gap-2.5 self-start border border-lime/35 px-3.5 text-[0.75rem] tracking-[0.06em] text-lime transition-colors hover:bg-lime/10 lg:self-end"
          >
            <ShoppingCart className="size-4" aria-hidden="true" />
            {cartLabel}
          </Link>
        </div>
      </div>

      <ul key={filter} data-testid="arsenal-grid" className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5 xl:gap-5">
        {products.map((product, index) => {
          const visible = filter === ALL || groupKey(product).key === filter;
          return (
            <li
              key={product.slug}
              hidden={!visible}
              className="animate-[gd-card-in_0.55s_var(--ease-out-gear)_both]"
              style={{ animationDelay: `${Math.min(index, 12) * 45}ms` }}
            >
              <ProductCard product={product} showTagline priority={index < 2} />
            </li>
          );
        })}
        <li className="animate-[gd-card-in_0.55s_var(--ease-out-gear)_both]">
          <Link
            href="/negozio"
            className="group relative flex h-full min-h-72 flex-col justify-end gap-3 overflow-hidden border border-dashed border-lime/40 bg-[radial-gradient(circle_at_70%_25%,rgba(122,60,255,0.28),transparent_60%)] p-4 transition-colors hover:border-lime sm:p-6"
          >
            <Emblem
              size={260}
              className="pointer-events-none absolute -right-12 -top-10 w-40 opacity-35 animate-[gd-spin_20s_linear_infinite] sm:w-64"
            />
            <span className="gd-mono relative text-[0.625rem] uppercase tracking-[0.12em] text-lime sm:text-[0.6875rem]">
              Spedizione gratis da €59
            </span>
            <span className="gd-display-wide relative text-[1.45rem] font-bold leading-[0.95] sm:text-[2.1rem]">
              Vedi tutto il negozio
            </span>
            <span className="gd-chamfer relative grid size-12 place-items-center bg-lime text-void transition-transform duration-200 group-hover:translate-x-1">
              <ArrowRight className="size-5" aria-hidden="true" />
            </span>
          </Link>
        </li>
      </ul>
    </section>
  );
}
