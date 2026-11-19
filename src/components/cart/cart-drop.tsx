"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useDragControls } from "framer-motion";
import { X } from "lucide-react";
import { MeterRail } from "@/components/cart/cart-summary";
import { Button } from "@/components/ui/button";
import { shippingLine, type ShippingLine } from "@/lib/commerce/free-shipping-meter";
import { formatPrice } from "@/lib/format";
import { displayName } from "@/lib/holo";
import { FREE_SHIPPING_FROM_LABEL } from "@/lib/labels";
import { useCartDrop } from "@/lib/store/cart-drop";
import { useCartQuote } from "@/lib/use-cart-quote";
import { cn } from "@/lib/cn";

const EASE = [0.16, 1, 0.3, 1] as const;
/** Long enough to read and to reach "Vai al carrello" with a thumb. */
const STAY_MS = 6000;

/**
 * The drop sheet (owner, 2026-11-19): what answers an add to cart once the photo has landed in it.
 * It names the piece, lights the free-shipping rail tooth by tooth from where it stood, and offers
 * the next step. On a phone it rises from the bottom edge and can be dragged away; from `sm` it is
 * a panel under the header. It never blocks the page: no backdrop, no focus trap, and it leaves on
 * its own.
 */
export function CartDrop() {
  const item = useCartDrop((state) => state.item);
  const close = useCartDrop((state) => state.close);
  const pathname = usePathname();
  const dragControls = useDragControls();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const stay = (ms: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(close, ms);
  };
  const hold = () => clearTimeout(timer.current);

  // Every add restarts the clock; the sheet is gone when the page changes.
  const itemId = item?.id;
  useEffect(() => {
    if (itemId === undefined) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(close, STAY_MS);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener("keydown", onKey);
    };
  }, [itemId, close]);
  useEffect(() => close, [pathname, close]);

  // Read when the sheet opens: it is never part of the server's HTML.
  const phone = item !== null && typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches;

  return (
    <div aria-live="polite" aria-atomic="true">
      <AnimatePresence>
        {item ? (
          <motion.aside
            key="cart-drop"
            data-testid="cart-drop"
            aria-label="Aggiunto al carrello"
            initial={phone ? { y: "100%" } : { opacity: 0, x: 28 }}
            animate={phone ? { y: 0 } : { opacity: 1, x: 0 }}
            exit={phone ? { y: "100%", transition: { duration: 0.22, ease: [0.5, 0, 0.9, 0.4] } } : { opacity: 0, x: 28, transition: { duration: 0.18 } }}
            transition={{ duration: 0.36, ease: EASE }}
            drag={phone ? "y" : false}
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.7 }}
            onDragStart={hold}
            onDragEnd={(_, info) => {
              if (info.offset.y > 70 || info.velocity.y > 500) close();
              else stay(4000);
            }}
            onPointerEnter={hold}
            onPointerLeave={() => stay(4000)}
            onFocusCapture={hold}
            className={cn(
              "on-dark fixed inset-x-0 bottom-0 z-[70] border-t border-cyan/40 bg-surface px-4 pb-[calc(1.125rem+env(safe-area-inset-bottom,0px))] pt-1 shadow-[0_-18px_40px_rgba(0,0,0,0.6)]",
              "sm:inset-x-auto sm:bottom-auto sm:right-6 sm:top-24 sm:w-[24rem] sm:border sm:pb-4 sm:pt-4 sm:shadow-[0_18px_40px_rgba(0,0,0,0.6)]",
              // The HUD corner of the product cards, at the corner the sheet enters from.
              "bg-[linear-gradient(var(--color-cyan),var(--color-cyan)),linear-gradient(var(--color-cyan),var(--color-cyan))] bg-[length:22px_2px,2px_22px] bg-[position:left_top,left_top] bg-no-repeat",
            )}
          >
            <div
              aria-hidden="true"
              onPointerDown={(event) => dragControls.start(event)}
              className="flex h-6 cursor-grab touch-none items-center justify-center sm:hidden"
            >
              <span className="h-1 w-11 -skew-x-[18deg] bg-grey-300" />
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Chiudi notifica"
              className="absolute right-1 top-1 inline-flex size-12 items-center justify-center text-grey-600 transition-colors hover:text-graphite"
            >
              <X className="size-4" aria-hidden="true" />
            </button>

            <div className="flex items-center gap-3 pr-10">
              {item.image ? (
                <span className="relative size-16 shrink-0 border border-grey-200 bg-[#0a0a10]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- the very file the card already loaded: no second request, no second size */}
                  <img
                    key={item.id}
                    src={item.image.src}
                    alt=""
                    className="absolute inset-0 size-full object-contain p-1 motion-safe:animate-[gd-drop-thumb_0.38s_var(--ease-out-gear)_0.08s_backwards]"
                  />
                </span>
              ) : null}
              <div className="min-w-0">
                <p className={cn("gd-mono flex items-center gap-1.5 text-[0.6875rem] font-bold uppercase", item.preorder ? "text-preorder" : "text-lime")}>
                  <span aria-hidden="true" className="gd-dot" />
                  {item.preorder ? "Pre-ordine nel carrello" : "Aggiunto al carrello"}
                </p>
                <p className="gd-name mt-1 text-small font-bold leading-tight text-graphite" data-testid="cart-drop-name">
                  {displayName(item.name)}
                </p>
              </div>
            </div>

            <DropShipping />

            <div className="mt-4 grid grid-cols-[1fr_1.3fr] gap-2">
              <Button variant="glass" size="sm" className="h-11" onClick={close}>
                Continua
              </Button>
              <Button as={Link} href="/carrello" variant="primary" size="sm" className="h-11" onClick={close} data-testid="cart-drop-go">
                Vai al carrello
              </Button>
            </div>
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/**
 * The free-shipping rail, from the server's quote of the cart that now holds the new piece. The
 * browser never adds prices up: until the answer lands the rail keeps the teeth it last showed and
 * the line keeps the shop's standing offer; then only the new teeth light, one after the other.
 * A backend that sells no free shipping gets no rail at all. Mounted only while the sheet is open,
 * so a closed sheet asks the server nothing.
 */
function DropShipping() {
  const { quote, loading } = useCartQuote();
  const line = shippingLine(quote, loading);
  const setLitTeeth = useCartDrop((state) => state.setLitTeeth);

  const settled = line.kind === "remaining" || line.kind === "unlocked" ? line.teeth : null;
  const [rail, setRail] = useState(() => {
    const lit = useCartDrop.getState().litTeeth;
    return { lit, from: lit };
  });
  if (settled !== null && settled !== rail.lit) setRail({ lit: settled, from: rail.lit });
  useEffect(() => {
    if (settled !== null) setLitTeeth(settled);
  }, [settled, setLitTeeth]);

  return <DropShippingLine line={line} lit={rail.lit} from={rail.from} />;
}

/** What the sheet says about free shipping for one answer of the server, over the rail. */
export function DropShippingLine({ line, lit, from }: { readonly line: ShippingLine; readonly lit: number; readonly from: number }) {
  if (line.kind === "none") return null;
  const unlocked = line.kind === "unlocked";

  return (
    <div className="mt-4" data-testid="cart-drop-shipping">
      <MeterRail lit={lit} from={from} reached={unlocked} sweep={unlocked && from < lit} className="h-3.5 gap-1" />
      <p className="mt-2 text-small text-grey-600">
        {line.kind === "pending" ? (
          <>Spedizione gratis da {FREE_SHIPPING_FROM_LABEL}</>
        ) : unlocked ? (
          <span className="gd-display font-extrabold tracking-[0.03em] text-available">Spedizione gratuita sbloccata</span>
        ) : (
          <>
            Ancora <span className="tabular font-bold text-graphite">{formatPrice({ amount: line.remaining, currency: "EUR" })}</span> per la spedizione gratis
          </>
        )}
      </p>
    </div>
  );
}
