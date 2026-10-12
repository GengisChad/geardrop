"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ShoppingCart } from "lucide-react";
import { ShopTile } from "@/components/home/shop-tile";
import { ProductCard } from "@/components/product/product-card";
import { Kicker } from "@/components/ui/kicker";
import { BLADE_TYPE_LABEL, CATEGORY_LABEL, FREE_SHIPPING_FROM_LABEL } from "@/lib/labels";
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
  // A shortcut to the cart once there is something in it; an empty cart needs no link here.
  const cartLabel = hydrated && count > 0 ? `${count} ${count === 1 ? "articolo" : "articoli"} nel carrello` : null;

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
          {cartLabel ? (
            <Link
              href="/carrello"
              className="gd-mono inline-flex h-9 items-center gap-2.5 self-start border border-lime/35 px-3.5 text-[0.75rem] tracking-[0.06em] text-lime transition-colors hover:bg-lime/10 lg:self-end"
            >
              <ShoppingCart className="size-4" aria-hidden="true" />
              {cartLabel}
            </Link>
          ) : null}
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
          <ShopTile href="/negozio" kicker={`Spedizione gratis da ${FREE_SHIPPING_FROM_LABEL}`} title="Vedi tutto il negozio" />
        </li>
      </ul>
    </section>
  );
}
