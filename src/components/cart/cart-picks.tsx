"use client";

import Image from "next/image";
import Link from "next/link";
import { Palette, Plus } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useToast } from "@/components/ui/toast";
import { gaItem, sendGaEvent } from "@/lib/analytics/google";
import { picksForCart, type CartPick, type CartPickShelf, type PickReason } from "@/lib/commerce/cart-picks";
import { shippingLine } from "@/lib/commerce/free-shipping-meter";
import type { CartQuote } from "@/lib/commerce/types";
import { formatPrice } from "@/lib/format";
import { trackEvent } from "@/lib/funnel";
import { hapticTick } from "@/lib/haptics";
import { displayName, holoStyle, shortName } from "@/lib/holo";
import { useCart } from "@/lib/store/cart";

/** The title says only what the shelf under it can prove (see lib/commerce/cart-picks.ts). */
const TITLE: Record<PickReason, string> = {
  together: "Altri clienti hanno preso anche",
  bestsellers: "I più venduti dello shop",
  related: "Ti potrebbe interessare",
};

const ACTION =
  "gd-chamfer gd-display inline-flex h-11 shrink-0 items-center justify-center gap-1.5 bg-lime/[0.14] px-3 text-[0.75rem] font-bold tracking-[0.08em] text-lime transition-colors duration-200 hover:bg-lime hover:text-void";

/**
 * In the cart, under the lines: a few pieces to add with one tap. They are on the shelf today and
 * travel in the same parcel, so adding one never changes the carrier or makes the order wait.
 * The cart is a task surface: rows like its own lines, no card effects, no flight.
 */
export function CartPicks({ shelf, quote }: { readonly shelf: CartPickShelf; readonly quote: CartQuote }) {
  // The cart itself, not its quote: a piece leaves the shelf on the tap that adds it.
  const lines = useCart((state) => state.lines);
  const add = useCart((state) => state.add);
  const toast = useToast();

  const suggestions = picksForCart(
    lines.map((line) => line.slug),
    shelf,
  );
  if (!suggestions) return null;

  // With one line in the cart the title already says what the pieces went with.
  const lineName = (slug: string | null) => {
    if (lines.length < 2) return null;
    const name = quote.lines.find((line) => line.slug === slug)?.name;
    return name ? shortName(name) : null;
  };
  // What is still missing for free shipping is the server's figure, as in the summary.
  const shipping = shippingLine(quote, false);

  const onAdd = (pick: CartPick) => {
    add(pick.slug, 1);
    hapticTick();
    trackEvent("add_to_cart");
    sendGaEvent("add_to_cart", {
      currency: "EUR",
      value: pick.price.amount / 100,
      items: [{ ...gaItem({ slug: pick.slug, name: pick.name, priceCents: pick.price.amount, quantity: 1 }), item_list_name: `Carrello: ${suggestions.reason}` }],
    });
    toast.push({ tone: "success", message: `${pick.name} nel carrello.` });
  };

  return (
    <section data-testid="cart-picks" data-reason={suggestions.reason} aria-labelledby="cart-picks-title" className="my-2 flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="cart-picks-title" className="gd-display text-small font-bold tracking-wider text-graphite">
          {TITLE[suggestions.reason]}
        </h2>
        {shipping.kind === "remaining" ? (
          <p className="text-[0.8125rem] text-grey-600 lg:hidden" data-testid="cart-picks-shipping">
            Ti mancano <strong className="tabular text-lime">{formatPrice({ amount: shipping.remaining, currency: "EUR" })}</strong> alla spedizione gratuita.
          </p>
        ) : null}
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        <AnimatePresence initial={false}>
          {suggestions.items.map(({ pick, with: withSlug }) => {
            const boughtWith = lineName(withSlug);
            return (
              <motion.li
                key={pick.slug}
                layout
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22 }}
                data-testid="cart-pick"
                data-slug={pick.slug}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-3 border border-white/10 bg-surface p-2">
                  <Link
                    href={`/prodotto/${pick.slug}`}
                    tabIndex={-1}
                    aria-hidden="true"
                    className="gd-product-plate shrink-0 border border-white/10"
                    style={holoStyle({ slug: pick.slug })}
                  >
                    {pick.image ? (
                      <Image src={pick.image.src} alt="" width={128} height={128} sizes="64px" className="size-16 object-contain p-1" />
                    ) : (
                      <span className="block size-16" />
                    )}
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <h3 className="gd-name line-clamp-2 text-[0.8125rem] font-bold leading-[1.15] text-graphite">
                      <Link href={`/prodotto/${pick.slug}`} className="hover:text-lime">
                        {displayName(pick.title)}
                      </Link>
                    </h3>
                    {pick.code || boughtWith ? (
                      <p className="flex min-w-0 items-center gap-1.5 text-[0.6875rem] text-grey-600">
                        {pick.code ? <span className="gd-code px-1 pb-[2px] pt-[3px] text-[0.625rem]">{pick.code}</span> : null}
                        {boughtWith ? (
                          <span className="truncate" data-testid="cart-pick-with">
                            con {boughtWith}
                          </span>
                        ) : null}
                      </p>
                    ) : null}
                    <p className="tabular gd-display-wide text-[1rem] font-extrabold leading-none text-graphite [font-stretch:118%]" data-testid="cart-pick-price">
                      {formatPrice(pick.price)}
                      {pick.compareAtPrice ? (
                        <span className="ml-2 text-[0.75rem] font-medium text-grey-400 line-through [font-stretch:100%]">{formatPrice(pick.compareAtPrice)}</span>
                      ) : null}
                    </p>
                  </div>
                  {pick.colours ? (
                    <Link href={`/prodotto/${pick.slug}`} data-testid="cart-pick-choose" aria-label={`Scegli il colore: ${pick.name}`} className={ACTION}>
                      <Palette className="size-4" aria-hidden="true" />
                      Scegli
                    </Link>
                  ) : (
                    <button type="button" onClick={() => onAdd(pick)} data-testid="cart-pick-add" aria-label={`Aggiungi ${pick.name} al carrello`} className={ACTION}>
                      <Plus className="size-4" strokeWidth={2.5} aria-hidden="true" />
                      Aggiungi
                    </button>
                  )}
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </section>
  );
}
