"use client";

import { useState } from "react";
import { Truck } from "lucide-react";
import { formatPrice, formatShipping } from "@/lib/format";
import type { CartTotals } from "@/lib/commerce/types";
import { METER_TEETH, meterTeeth, toothDelay } from "@/lib/commerce/free-shipping-meter";
import { STANDARD_DELIVERY } from "@/lib/labels";
import { cn } from "@/lib/cn";

/**
 * Progress toward free shipping. The threshold arrives with the quote rather than from a
 * local constant: it belongs to the shipping method the backend is currently selling,
 * and a shop with no free-shipping tier must not be shown a meter at all.
 *
 * The meter is the stadium's toothed rail in twenty teeth (lib/commerce/free-shipping-meter). The
 * first paint is at rest; when a new quote lights more teeth, only those light, one after the
 * other. Crossing the threshold during the visit turns the rail green, sends one cut of light
 * along it and slaps the sticker on; a cart that opens above the threshold shows both at rest.
 */
export function FreeShippingMeter({ totals, threshold }: { totals: CartTotals; threshold: number | null }) {
  // Measured on what the buyer pays, as freeShippingRemaining is: a club discount counts.
  const reached = totals.freeShippingRemaining === 0 && totals.subtotal.amount > 0;
  const lit = reached ? METER_TEETH : meterTeeth(totals.subtotal.amount - totals.discount.amount, threshold);

  // What the meter showed before this quote, so only the change animates (React's "adjust state
  // when a prop changes" pattern: no effect, no extra paint).
  const [shown, setShown] = useState({ lit, reached, from: lit, unlockedNow: false });
  if (shown.lit !== lit || shown.reached !== reached) {
    setShown({ lit, reached, from: shown.lit, unlockedNow: reached && !shown.reached });
  }

  if (!threshold) return null;

  return (
    <div data-testid="free-shipping-meter" className="relative rounded-[--radius-glass] border border-white/10 bg-grey-100 p-4">
      {reached ? (
        <span
          className={cn(
            "gd-sticker absolute -top-3 right-3 bg-available-solid px-2 py-1 text-[0.6875rem] text-void",
            shown.unlockedNow && "animate-[gd-slap_0.42s_var(--ease-out-gear)_0.6s_backwards] motion-reduce:animate-none",
          )}
        >
          Spedizione gratis
        </span>
      ) : null}
      <p className="flex items-center gap-2 text-small">
        <Truck className={cn("size-4 shrink-0", reached ? "text-available" : "text-lime")} aria-hidden="true" />
        {reached ? (
          <span className="font-semibold text-available">Spedizione gratuita sbloccata.</span>
        ) : (
          <span className="text-grey-700">
            Ancora{" "}
            <span className="tabular font-bold text-graphite">
              {formatPrice({ amount: totals.freeShippingRemaining, currency: "EUR" })}
            </span>{" "}
            e la spedizione è gratis.
          </span>
        )}
      </p>
      <MeterRail lit={lit} from={shown.from} reached={reached} sweep={shown.unlockedNow} className="mt-3 h-3.5 gap-1" />
    </div>
  );
}

/** The rail itself, shared by the cart meter and the add toast. Decorative: the words carry the state. */
export function MeterRail({
  lit,
  from,
  reached,
  sweep = false,
  className,
}: {
  lit: number;
  /** Teeth already lit before this render; the ones between `from` and `lit` light in turn. */
  from: number;
  reached: boolean;
  /** One cut of light along the rail, when the threshold has just been crossed. */
  sweep?: boolean;
  className?: string;
}) {
  return (
    <div aria-hidden="true" data-reached={reached ? "true" : undefined} className={cn("relative flex", className)}>
      {Array.from({ length: METER_TEETH }, (_, index) => {
        const delay = toothDelay(index, from, lit);
        const on = index < lit;
        return (
          <span
            key={index}
            data-tooth=""
            data-lit={on ? "true" : "false"}
            style={delay === null ? undefined : { animationDelay: `${delay}ms` }}
            className={cn(
              "flex-1 origin-bottom transition-colors duration-300",
              on ? (reached ? "bg-available-solid" : "bg-lime") : "bg-white/[0.14]",
              delay !== null && "animate-[gd-tooth_0.34s_var(--ease-out-gear)_backwards] motion-reduce:animate-none",
            )}
          />
        );
      })}
      {sweep ? (
        <span className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden">
          <span className="absolute inset-0 animate-[gd-slab_0.8s_var(--ease-out-gear)_0.45s_both] bg-[linear-gradient(100deg,transparent_30%,rgba(255,255,255,0.75)_50%,transparent_70%)]" />
        </span>
      ) : null}
    </div>
  );
}

export function CartTotalsPanel({
  totals,
  deliveryHint = STANDARD_DELIVERY,
  carrierChosenLater = false,
  className,
}: {
  totals: CartTotals;
  /** Delivery time shown under the shipping row. Defaults to the in-stock estimate. */
  deliveryHint?: string;
  /**
   * Set when the cart prices the cheapest of several deliveries and the buyer picks one at
   * checkout. A bare price there read as what any choice would cost, so the cart says "da" and
   * where the choice happens. Since 2026-10-23 every cart has one method (the InPost Locker, or
   * Poste to the door for a stadium box), so the price is final.
   */
  carrierChosenLater?: boolean;
  className?: string;
}) {
  const startingPrice = carrierChosenLater && totals.shipping.amount > 0;
  return (
    <dl className={cn("flex flex-col gap-3", className)}>
      <div className="flex justify-between text-small">
        <dt className="text-grey-600">Subtotale</dt>
        <dd className="tabular font-semibold text-graphite" data-testid="cart-subtotal">
          {formatPrice(totals.subtotal)}
        </dd>
      </div>
      {totals.discount.amount > 0 ? (
        <div className="flex justify-between text-small">
          <dt className="text-grey-600">Sconto</dt>
          <dd className="tabular font-semibold text-available" data-testid="cart-discount">
            −{formatPrice(totals.discount)}
          </dd>
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-small">
          <dt className="text-grey-600">Spedizione</dt>
          <dd
            className={cn("tabular font-semibold", totals.shipping.amount === 0 ? "text-available" : "text-graphite")}
            data-testid="cart-shipping"
          >
            {startingPrice ? `da ${formatShipping(totals.shipping)}` : formatShipping(totals.shipping)}
          </dd>
        </div>
        {startingPrice ? (
          <p className="text-[0.6875rem] text-grey-600" data-testid="cart-carrier-note">
            Al checkout scegli come ricevere il pacco: il totale si aggiorna.
          </p>
        ) : null}
        <p className="text-[0.6875rem] text-grey-600">{deliveryHint}</p>
      </div>
      <div className="flex items-baseline justify-between border-t border-grey-200 pt-3">
        <dt className="gd-display text-small font-bold tracking-wider text-graphite">{startingPrice ? "Totale da" : "Totale"}</dt>
        <dd className="tabular gd-display text-h3 font-extrabold text-graphite" data-testid="cart-total">
          {formatPrice(totals.total)}
        </dd>
      </div>
      <p className="text-[0.6875rem] text-grey-600">IVA inclusa. Spese di spedizione calcolate qui sopra.</p>
    </dl>
  );
}
