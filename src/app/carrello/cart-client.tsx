"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { CartTotalsPanel, FreeShippingMeter } from "@/components/cart/cart-summary";
import { QuantityStepper } from "@/components/product/quantity-stepper";
import { StockBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useCartDetails } from "@/lib/use-cart-details";
import { useCart } from "@/lib/store/cart";
import { formatPrice } from "@/lib/format";

export function CartClient() {
  const { lines, totals, hydrated } = useCartDetails();
  const setQuantity = useCart((s) => s.setQuantity);
  const remove = useCart((s) => s.remove);

  // Until the persisted cart is read, render a skeleton rather than a wrong "empty".
  if (!hydrated) {
    return (
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-3">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-[--radius-card] bg-grey-200" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-[--radius-card] bg-grey-200" />
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <EmptyState
        className="mt-8"
        icon="cart"
        title="Il tuo carrello è vuoto"
        message="Non hai ancora aggiunto nulla. Dai un'occhiata agli ultimi drop."
        href="/negozio"
      />
    );
  }

  return (
    <div className="mt-8 grid items-start gap-8 lg:grid-cols-[1fr_22rem]">
      <ul data-testid="cart-lines" className="flex flex-col gap-3">
        <AnimatePresence initial={false}>
          {lines.map(({ product, quantity, lineTotal }) => {
            const image = product.images[0];
            return (
              <motion.li
                key={product.slug}
                layout
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                transition={{ duration: 0.22 }}
                data-testid="cart-line"
                data-slug={product.slug}
                className="gd-glass-panel flex gap-4 overflow-hidden rounded-[--radius-glass] p-4"
              >
                <Link href={`/prodotto/${product.slug}`} className="shrink-0">
                  {image ? (
                    <Image
                      src={image.src}
                      alt={image.alt}
                      width={image.width}
                      height={image.height}
                      sizes="96px"
                      className="size-20 object-contain sm:size-24"
                    />
                  ) : null}
                </Link>

                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-small font-bold text-graphite">
                        <Link href={`/prodotto/${product.slug}`} className="hover:text-violet">
                          {product.name}
                        </Link>
                      </h2>
                      <p className="mt-1 flex items-center gap-2">
                        <StockBadge status={product.stock} />
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(product.slug)}
                      aria-label={`Rimuovi ${product.name} dal carrello`}
                      data-testid="cart-remove"
                      className="shrink-0 rounded-full p-2 text-grey-600 transition-colors hover:bg-soldout-bg hover:text-soldout"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </div>

                  <div className="mt-auto flex items-center justify-between gap-3">
                    <QuantityStepper
                      value={quantity}
                      size="sm"
                      onChange={(next) => setQuantity(product.slug, next)}
                      label={`Quantità di ${product.name}`}
                    />
                    <p className="tabular gd-display text-body font-bold text-graphite" data-testid="line-total">
                      {formatPrice({ amount: lineTotal, currency: "EUR" })}
                    </p>
                  </div>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>

      <aside className="gd-glass-panel sticky top-28 flex flex-col gap-4 rounded-[--radius-glass] p-5">
        <h2 className="gd-display text-small font-bold tracking-wider text-graphite">Riepilogo</h2>
        <FreeShippingMeter totals={totals} />
        <CartTotalsPanel totals={totals} />
        <Button as={Link} href="/checkout" variant="primary" size="lg" fullWidth data-testid="go-to-checkout">
          Vai al checkout
          <ArrowRight className="size-4" aria-hidden="true" />
        </Button>
        <Link href="/negozio" className="text-center text-small text-grey-600 transition-colors hover:text-violet">
          Continua ad acquistare
        </Link>
      </aside>
    </div>
  );
}
