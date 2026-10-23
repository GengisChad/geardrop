"use client";

import Image from "next/image";
import { cutoutSrc } from "@/data/assets";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Loader2, Trash2, Zap } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useState } from "react";
import { BundleNudge } from "@/components/cart/bundle-nudge";
import { CartTotalsPanel, FreeShippingMeter } from "@/components/cart/cart-summary";
import { QuantityStepper } from "@/components/product/quantity-stepper";
import { StockBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ProductCard } from "@/components/product/product-card";
import { startExpressCheckout } from "@/app/(storefront)/checkout/actions";
import { useCartQuote } from "@/lib/use-cart-quote";
import { MAX_QUANTITY_PER_LINE, useCart } from "@/lib/store/cart";
import { formatPrice } from "@/lib/format";
import { holoStyle } from "@/lib/holo";
import { cartDelivery, preorderNote, stockLabel } from "@/lib/labels";
import { gaItem, sendGaEvent } from "@/lib/analytics/google";
import type { Product } from "@/lib/commerce/types";
import { visitSourceForCheckout } from "@/lib/attribution";
import { LockerPicker, type PickedLocker } from "@/components/checkout/locker-picker";
import { shippingMethodByCode } from "@/data/catalog";
import { EXPRESS_LOCKER_MISSING_MESSAGE } from "@/lib/payments/express-checkout";

type CartClientProps = {
  shelfProducts: Product[];
};

export function CartClient({ shelfProducts }: CartClientProps) {
  const { quote, hydrated } = useCartQuote();
  const setQuantity = useCart((s) => s.setQuantity);
  const remove = useCart((s) => s.remove);

  const [expressState, setExpressState] = useState<{ pending: boolean; error: string | null }>({
    pending: false,
    error: null,
  });

  // Express checkout skips the form, so the InPost Locker is picked here (owner, 2026-10-23); a
  // cart with a stadium box goes to the door with Poste, and Takara pieces leave from the
  // partner's warehouse, so those carts take the normal checkout.
  const [expressLocker, setExpressLocker] = useState<PickedLocker | null>(null);
  const showExpressButton = Boolean(
    quote?.orderable &&
      !quote.shippingOptions.some((opt) => opt.lockReasons?.some((reason) => reason === "partner" || reason === "mixed")),
  );
  const expressNeedsLocker = Boolean(quote && shippingMethodByCode(quote.shippingCode)?.pickupPoint);
  // A Locker picked before a stadium joined the cart is forgotten once it went to the door: when
  // the stadium leaves again, the buyer picks afresh rather than paying to a choice they no longer see.
  const [lockerShown, setLockerShown] = useState(expressNeedsLocker);
  if (lockerShown !== expressNeedsLocker) {
    setLockerShown(expressNeedsLocker);
    if (!expressNeedsLocker) setExpressLocker(null);
  }

  const handleExpressCheckout = useCallback(async () => {
    if (!quote || expressState.pending) return;
    if (expressNeedsLocker && !expressLocker) {
      setExpressState({ pending: false, error: EXPRESS_LOCKER_MISSING_MESSAGE });
      document.getElementById("cart-locker-search")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setExpressState({ pending: true, error: null });
    // GA4 begin_checkout: fires as soon as the buyer chooses the express path, the same
    // event that checkout-client.tsx fires when the checkout form first loads.
    sendGaEvent("begin_checkout", {
      currency: "EUR",
      value: quote.totals.subtotal.amount / 100,
      items: quote.lines.map((line) =>
        gaItem({ slug: line.slug, name: line.name, priceCents: line.unitPrice.amount, quantity: line.quantity }),
      ),
    });
    const result = await startExpressCheckout({
      lines: quote.lines.map((line) => ({ slug: line.slug, quantity: line.quantity })),
      // Fresh key per tap: a double-tap or a back-and-retry reuses the same attempt rather
      // than creating two sessions. The key is ephemeral: it is never stored.
      idempotencyKey: crypto.randomUUID(),
      ...visitSourceForCheckout(),
      ...(expressNeedsLocker && expressLocker
        ? { pickupPoint: expressLocker.label, ...(expressLocker.id ? { pickupPointId: expressLocker.id } : {}) }
        : {}),
    });
    if (result.ok) {
      // Keep the pending state until the browser navigates away; no cleanup needed.
      window.location.assign(result.redirectUrl);
    } else {
      setExpressState({ pending: false, error: result.message });
    }
  }, [quote, expressState.pending, expressNeedsLocker, expressLocker]);

  // Until the persisted cart is read and the server has priced it, render a skeleton
  // rather than a wrong "empty" or a locally guessed price.
  if (!hydrated || !quote) {
    return (
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_22rem]" data-testid="cart-loading">
        <div className="flex flex-col gap-3">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="gd-glass-card h-32 animate-pulse rounded-[--radius-glass]" />
          ))}
        </div>
        <div className="gd-glass-panel h-64 animate-pulse rounded-[--radius-glass]" />
      </div>
    );
  }

  if (quote.lines.length === 0) {
    return (
      <>
        <EmptyState
          className="mt-8"
          icon="cart"
          title="Il tuo carrello è vuoto"
          message="Non hai ancora aggiunto nulla. Dai un'occhiata agli ultimi drop."
          href="/negozio"
        />
        {shelfProducts.length > 0 ? (
          <section className="mt-12" aria-labelledby="empty-cart-shelf-label">
            <h2
              id="empty-cart-shelf-label"
              className="gd-display text-small font-bold tracking-wider text-grey-600 mb-4"
            >
              Ti potrebbe interessare
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {shelfProducts.map((p) => (
                <ProductCard key={p.slug} product={p} />
              ))}
            </div>
          </section>
        ) : null}
      </>
    );
  }

  const blocked = !quote.orderable;

  return (
    <>
      {/* Bottom padding on mobile so the sticky bar never overlaps the last line */}
      <div className="mt-8 grid items-start gap-8 pb-24 lg:grid-cols-[1fr_22rem] lg:pb-0">
        <div className="flex min-w-0 flex-col gap-3">
          <ul data-testid="cart-lines" className="flex flex-col gap-3">
            <AnimatePresence initial={false}>
              {quote.lines.map((line) => (
                <motion.li
                  key={line.slug}
                  layout
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  transition={{ duration: 0.22 }}
                  data-testid="cart-line"
                  data-slug={line.slug}
                  className="gd-glass-panel flex gap-4 overflow-hidden rounded-[--radius-glass] p-4"
                >
                  {/* The line's packshot stands on the same tinted plate as its catalogue card. */}
                  <Link href={`/prodotto/${line.slug}`} className="gd-product-plate shrink-0 border border-white/10" style={holoStyle({ slug: line.slug })}>
                    {line.image ? (
                      <Image
                        src={cutoutSrc(line.image.src) ?? line.image.src}
                        alt={line.image.alt}
                        width={line.image.width}
                        height={line.image.height}
                        sizes="96px"
                        className="size-20 object-contain p-1 sm:size-24"
                      />
                    ) : null}
                  </Link>

                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="gd-name line-clamp-2 text-[1.0625rem] font-bold leading-tight text-graphite">
                          <Link href={`/prodotto/${line.slug}`} className="hover:text-lime">
                            {line.name}
                          </Link>
                        </h2>
                        <p className="mt-1 flex items-center gap-2">
                          <StockBadge status={line.stock} label={stockLabel(line)} />
                        </p>
                        {line.issue ? (
                          <p
                            data-testid="cart-line-issue"
                            className="mt-1 flex items-center gap-1.5 text-[0.6875rem] font-semibold text-soldout"
                          >
                            <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
                            {line.issue}
                          </p>
                        ) : null}
                        {line.stock === "pre-ordine" && !line.autoPreorder && line.availableQuantity !== undefined ? (
                          <p className="mt-1 tabular text-[0.6875rem] font-bold text-preorder" data-testid="preorder-remaining">
                            {line.availableQuantity} pre-ordini rimasti
                          </p>
                        ) : null}
                        {!line.issue && preorderNote(line) ? (
                          <p className="mt-1 text-[0.6875rem] font-bold text-preorder" data-testid="preorder-split">
                            {preorderNote(line)}
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(line.slug)}
                        aria-label={`Rimuovi ${line.name} dal carrello`}
                        data-testid="cart-remove"
                        className="shrink-0 p-2 text-grey-600 transition-colors hover:bg-soldout-bg hover:text-soldout"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </div>

                    <div className="mt-auto flex items-center justify-between gap-3">
                      <QuantityStepper
                        value={line.quantity}
                        max={
                          line.autoPreorder
                            ? MAX_QUANTITY_PER_LINE
                            : Math.min(MAX_QUANTITY_PER_LINE, line.availableQuantity ?? MAX_QUANTITY_PER_LINE)
                        }
                        size="sm"
                        onChange={(next) => setQuantity(line.slug, next)}
                        label={`Quantità di ${line.name}`}
                      />
                      <p className="tabular gd-display-wide text-[1.25rem] font-extrabold text-graphite [font-stretch:118%]" data-testid="line-total">
                        {formatPrice(line.lineTotal)}
                      </p>
                    </div>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          <BundleNudge lines={quote.lines} />
        </div>

        <aside data-testid="cart-summary" className="gd-glass-panel sticky top-28 flex flex-col gap-4 rounded-[--radius-glass] p-5">
          <h2 className="gd-display text-small font-bold tracking-wider text-graphite">Riepilogo</h2>
          <FreeShippingMeter totals={quote.totals} threshold={quote.freeShippingThreshold} />
          <CartTotalsPanel totals={quote.totals} deliveryHint={cartDelivery(quote.lines.filter((line) => !line.issue))} carrierChosenLater={quote.shippingOptions.length > 1} />
          <Button as={Link} href="/checkout" variant="primary" size="lg" fullWidth data-testid="go-to-checkout" aria-disabled={blocked}>
            Vai al checkout
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
          {showExpressButton ? (
            <div className="flex flex-col gap-2">
              {expressNeedsLocker ? (
                <div className="flex flex-col gap-1.5" data-testid="express-locker">
                  <label htmlFor="cart-locker-search" className="gd-display text-[0.6875rem] font-bold tracking-wider text-grey-600">
                    Locker InPost per Paga subito
                  </label>
                  <LockerPicker
                    idPrefix="cart"
                    value={expressLocker}
                    hasError={expressState.error === EXPRESS_LOCKER_MISSING_MESSAGE}
                    onChange={(picked) => {
                      setExpressLocker(picked);
                      if (picked) setExpressState((state) => ({ ...state, error: null }));
                    }}
                  />
                </div>
              ) : null}
              <button
                type="button"
                data-testid="express-checkout"
                disabled={expressState.pending}
                onClick={handleExpressCheckout}
                className="gd-display gd-chamfer-lg inline-flex w-full items-center justify-center gap-2 bg-violet px-7 py-3 text-[0.9375rem] font-bold tracking-[0.08em] text-white transition-[background-color,opacity] duration-200 hover:bg-[#8d58ff] disabled:cursor-not-allowed disabled:bg-grey-300 disabled:text-grey-600"
              >
                {expressState.pending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Zap className="size-4" aria-hidden="true" />
                )}
                Paga subito
              </button>
              <p className="text-center text-[0.6875rem] text-grey-600">
                {expressNeedsLocker
                  ? "Carta, PayPal, Apple Pay o Google Pay · ritiro nel Locker scelto qui sopra"
                  : "Carta, PayPal, Apple Pay o Google Pay · consegna a casa con Poste"}
              </p>
              {expressState.error ? (
                <p
                  role="alert"
                  data-testid="express-checkout-error"
                  className="rounded border border-soldout/30 bg-soldout-bg px-3 py-2 text-[0.6875rem] text-soldout"
                >
                  {expressState.error}
                </p>
              ) : null}
            </div>
          ) : null}
          <Link href="/negozio" className="text-center text-small text-grey-600 transition-colors hover:text-violet-soft">
            Continua ad acquistare
          </Link>
        </aside>
      </div>

      {/* Sticky bottom bar — mobile only, hidden on lg and above */}
      <div
        data-testid="cart-sticky-bar"
        // Sits above the mobile tab bar using the same bottom offset as sticky-buy-bar.tsx.
        className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom,0px))] z-40 border-t border-white/10 bg-[#0f0e14] lg:hidden"
        aria-hidden={blocked ? "true" : undefined}
      >
        {showExpressButton ? (
          // Express button above the checkout row so the bar grows minimally and the
          // primary "Vai al checkout" stays in thumb reach at the bottom.
          <div className="mx-auto max-w-[1400px] px-4 pb-0 pt-3 sm:px-6">
            <button
              type="button"
              data-testid="express-checkout"
              disabled={expressState.pending}
              onClick={handleExpressCheckout}
              // py-3 (24px) + text-small line-height (18px) = 42px; min-h-[44px] ensures WCAG AA
              // 44px touch-target minimum (PRODUCT.md). gd-chamfer-lg matches the desktop button
              // and every other Button secondary instance — two chamfer sizes on the same CTA
              // would break the Holo Drop brand mark (2026-10-12, owner finding).
              className="gd-display gd-chamfer-lg inline-flex min-h-[44px] w-full items-center justify-center gap-2 bg-violet py-3 text-small font-bold tracking-[0.08em] text-white transition-[background-color,opacity] duration-200 hover:bg-[#8d58ff] disabled:cursor-not-allowed disabled:bg-grey-300 disabled:text-grey-600"
            >
              {expressState.pending ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Zap className="size-3.5" aria-hidden="true" />
              )}
              Paga subito
            </button>
            {/* Honest disclosure of where express delivers: the Locker picked in the summary, or
                the door with Poste for a stadium box. Mirrors the desktop sidebar copy (PRODUCT.md:
                "A promise the shop cannot keep is a bug", 2026-10-12, owner finding). */}
            <p className="mt-1 text-center text-[0.6875rem] text-grey-600">
              {expressNeedsLocker
                ? expressLocker
                  ? `Locker ${expressLocker.label.split(" · ")[0]}`
                  : "Scegli il Locker nel riepilogo, poi paga."
                : "Consegna a casa con Poste Italiane."}
            </p>
            {expressState.error ? (
              <p
                role="alert"
                data-testid="express-checkout-error"
                className="mt-1 text-[0.625rem] text-soldout"
              >
                {expressState.error}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0 flex-1">
            <p className="gd-display text-[0.6875rem] font-bold text-grey-600 tracking-wider">
              Totale
            </p>
            <p className="tabular gd-display text-body font-extrabold text-graphite" data-testid="sticky-cart-total">
              {formatPrice(quote.totals.total)}
            </p>
          </div>
          <Button
            as={Link}
            href="/checkout"
            variant="primary"
            size="md"
            data-testid="sticky-go-to-checkout"
            aria-disabled={blocked}
            className="shrink-0"
          >
            Vai al checkout
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </>
  );
}
