"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useDragControls } from "framer-motion";
import { ArrowRight, Palette, X } from "lucide-react";
import { AddToCartButton } from "@/components/product/add-to-cart-button";
import { Button } from "@/components/ui/button";
import { FREE_SHIPPING_FROM_LABEL, SHIPPING_FLAT_LABEL } from "@/lib/labels";
import { useCartPulse } from "@/lib/store/cart";
import { useQuickView, type QuickViewOrigin, type QuickViewProduct } from "@/lib/store/quick-view";
import { cn } from "@/lib/cn";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Opens the quick view from a card's photo. It sits over the plate, above the card's own link and
 * under its favourite button; the product name still leads to the full page.
 */
export function QuickViewButton({ product }: { readonly product: QuickViewProduct }) {
  const open = useQuickView((state) => state.open);
  return (
    <button
      type="button"
      data-testid="quick-view-open"
      aria-label={`Anteprima: ${product.name}`}
      aria-haspopup="dialog"
      onClick={(event) => {
        const photo = event.currentTarget.closest("article")?.querySelector("img") ?? null;
        const box = photo?.getBoundingClientRect();
        open(product, photo && box ? { left: box.left, top: box.top, width: box.width, height: box.height, src: photo.currentSrc || photo.src } : null);
      }}
      className="absolute inset-0 z-[15] cursor-zoom-in"
    />
  );
}

/**
 * The quick view (owner, 2026-11-19): the card's photo leaves the card and rises into a sheet
 * with what a buyer needs to decide (price, availability, what shipping costs) and the buy
 * button, without leaving the list. On a phone it is a bottom sheet that drags away; from `sm`
 * a panel in the middle of the screen. Escape, the backdrop and the X close it, the focus stays
 * inside while it is open and goes back to the card afterwards.
 */
export function QuickView() {
  const product = useQuickView((state) => state.product);
  const origin = useQuickView((state) => state.origin);
  const close = useQuickView((state) => state.close);
  const pathname = usePathname();
  const adds = useCartPulse((state) => state.adds);

  // A page change closes it; so does a piece going into the cart, once its photo has left.
  useEffect(() => close, [pathname, close]);
  const addsAtOpen = useRef(adds);
  useEffect(() => {
    if (!product) {
      addsAtOpen.current = adds;
      return;
    }
    if (adds === addsAtOpen.current) return;
    const timer = window.setTimeout(close, 240);
    return () => window.clearTimeout(timer);
  }, [adds, product, close]);

  return <AnimatePresence>{product ? <Sheet key={product.slug} product={product} origin={origin} close={close} /> : null}</AnimatePresence>;
}

function Sheet({ product, origin, close }: { readonly product: QuickViewProduct; readonly origin: QuickViewOrigin | null; readonly close: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const photo = useRef<HTMLImageElement>(null);
  const dragControls = useDragControls();
  const phone = typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches;
  const href = `/prodotto/${product.slug}` as const;

  // Focus goes in and comes back; Tab stays inside; the page behind does not scroll.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true });
    const overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        return;
      }
      if (event.key !== "Tab" || !panel.current) return;
      const stops = [...panel.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")];
      const first = stops[0];
      const last = stops.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = overflow;
      opener?.focus({ preventScroll: true });
    };
  }, [close]);

  // The card's photo travels into the sheet: a copy flies from where it stood to where the
  // sheet's own photo will rest, and that one shows as it lands.
  useLayoutEffect(() => {
    const target = photo.current;
    const sheet = panel.current;
    if (!origin || !target || !sheet || typeof target.animate !== "function") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const to = target.getBoundingClientRect();
    const box = sheet.getBoundingClientRect();
    // On a phone the sheet is still below the screen at this point: measure where it will rest.
    const rise = phone ? box.top - (window.innerHeight - box.height) : 0;
    const copy = new Image();
    copy.alt = "";
    copy.src = origin.src;
    copy.style.cssText = `position:fixed;z-index:120;pointer-events:none;left:${origin.left}px;top:${origin.top}px;width:${origin.width}px;height:${origin.height}px;object-fit:contain;transform-origin:0 0;filter:drop-shadow(0 14px 14px rgba(0,0,0,0.55))`;
    document.body.append(copy);
    target.style.opacity = "0";
    let done = false;
    const land = () => {
      if (done) return;
      done = true;
      target.style.opacity = "";
      copy.remove();
    };
    copy
      .animate(
        [
          { transform: "none" },
          { transform: `translate(${to.left - origin.left}px, ${to.top - rise - origin.top}px) scale(${to.width / origin.width}, ${to.height / origin.height})` },
        ],
        { duration: 420, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "forwards" },
      )
      .finished.then(land, land);
    const timer = window.setTimeout(land, 700);
    return () => {
      window.clearTimeout(timer);
      land();
    };
  }, [origin, phone]);

  const rise = (order: number) => ({ animationDelay: `${200 + order * 45}ms` });
  const copyIn = "motion-safe:animate-[gd-quick-in_0.32s_var(--ease-out-gear)_backwards]";

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center sm:items-center sm:p-6">
      <motion.div
        aria-hidden="true"
        data-testid="quick-view-backdrop"
        onClick={close}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.2 } }}
        transition={{ duration: 0.24 }}
        className="absolute inset-0 bg-[#030306]/75"
      />
      <motion.div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={`Anteprima: ${product.name}`}
        data-testid="quick-view"
        initial={phone ? { y: "100%" } : { opacity: 0 }}
        animate={phone ? { y: 0 } : { opacity: 1 }}
        exit={phone ? { y: "100%", transition: { duration: 0.22, ease: [0.5, 0, 0.9, 0.4] } } : { opacity: 0, transition: { duration: 0.18 } }}
        transition={{ duration: 0.36, ease: EASE }}
        drag={phone ? "y" : false}
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.7 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 80 || info.velocity.y > 500) close();
        }}
        className={cn(
          "on-dark relative max-h-[92dvh] w-full overflow-y-auto overscroll-contain border-t border-cyan/40 bg-surface px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] pt-1 shadow-[0_-18px_40px_rgba(0,0,0,0.6)]",
          "sm:max-w-[30rem] sm:border sm:pb-5 sm:pt-5 sm:shadow-[0_24px_60px_rgba(0,0,0,0.7)]",
          "bg-[linear-gradient(var(--color-cyan),var(--color-cyan)),linear-gradient(var(--color-cyan),var(--color-cyan))] bg-[length:22px_2px,2px_22px] bg-[position:left_top,left_top] bg-no-repeat",
        )}
      >
        <div aria-hidden="true" onPointerDown={(event) => dragControls.start(event)} className="flex h-6 cursor-grab touch-none items-center justify-center sm:hidden">
          <span className="h-1 w-11 -skew-x-[18deg] bg-grey-300" />
        </div>
        <button
          type="button"
          onClick={close}
          data-autofocus=""
          aria-label="Chiudi anteprima"
          data-testid="quick-view-close"
          className="absolute right-1 top-1 z-10 inline-flex size-12 items-center justify-center text-grey-600 transition-colors hover:text-graphite"
        >
          <X className="size-5" aria-hidden="true" />
        </button>

        {/* An article with the photo first: the add button finds it for the flight into the cart. */}
        <article>
          <div className="gd-product-plate relative aspect-[16/11] overflow-hidden">
            {product.mark ? (
              <span aria-hidden="true" className="gd-watermark left-3 top-1.5 text-[4.2rem] motion-safe:animate-[gd-mark-in_0.52s_var(--ease-out-gear)_0.26s_backwards]">
                {product.mark}
              </span>
            ) : null}
            {product.image ? (
              // eslint-disable-next-line @next/next/no-img-element -- the very file the card already loaded: no second request, no second size
              <img
                ref={photo}
                src={origin?.src ?? product.image.src}
                alt={product.image.alt}
                className="absolute inset-0 size-full object-contain p-3 drop-shadow-[0_14px_14px_rgba(0,0,0,0.55)]"
              />
            ) : null}
          </div>

          <p className={cn("mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1", copyIn)} style={rise(0)}>
            {product.code ? <span className="gd-code px-1.5 pb-[3px] pt-1 text-[0.6875rem]">{product.code}</span> : null}
            <span className={cn("flex items-center gap-1.5 text-[0.8125rem] font-medium", product.availabilityTone)} data-testid="quick-view-availability">
              <span aria-hidden="true" className="gd-dot size-2" />
              {product.availability}
            </span>
          </p>
          <h2 className={cn("gd-name mt-2 text-[1.0625rem] font-bold leading-tight text-graphite", copyIn)} style={rise(1)} data-testid="quick-view-name">
            {product.title}
          </h2>
          {product.tagline ? (
            <p className={cn("mt-1 text-small text-grey-600", copyIn)} style={rise(2)}>
              {product.tagline}
            </p>
          ) : null}

          <div className={cn("mt-4 flex items-center gap-4", copyIn)} style={rise(3)}>
            <p className="shrink-0">
              <span className="gd-display-wide gd-price-split tabular block whitespace-nowrap text-[1.75rem] font-extrabold leading-none [font-stretch:118%]" data-testid="quick-view-price">
                {product.price}
              </span>
              {product.compareAt ? <span className="tabular mt-1 block text-[0.8125rem] text-grey-400 line-through">{product.compareAt}</span> : null}
            </p>
            <div className="min-w-0 flex-1">
              {product.colours > 1 ? (
                <Button as={Link} href={href} variant="primary" size="md" fullWidth data-testid="quick-view-colours">
                  <Palette className="size-4" aria-hidden="true" />
                  Scegli il colore
                </Button>
              ) : (
                <AddToCartButton slug={product.slug} name={product.name} priceCents={product.priceCents} stock={product.stock} emphasis="primary" />
              )}
            </div>
          </div>

          <p className={cn("mt-3 text-[0.75rem] text-grey-600", copyIn)} style={rise(4)}>
            Spedizione da {SHIPPING_FLAT_LABEL}, gratis da {FREE_SHIPPING_FROM_LABEL}.
          </p>
          <Link
            href={href}
            data-testid="quick-view-full"
            className={cn("gd-mono mt-3 inline-flex min-h-11 items-center gap-2 text-[0.8125rem] text-cyan hover:text-lime", copyIn)}
            style={rise(5)}
          >
            Apri la scheda completa
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </article>
      </motion.div>
    </div>
  );
}
