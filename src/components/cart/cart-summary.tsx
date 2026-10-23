import { Truck } from "lucide-react";
import { formatPrice, formatShipping } from "@/lib/format";
import type { CartTotals } from "@/lib/commerce/types";
import { STANDARD_DELIVERY } from "@/lib/labels";
import { cn } from "@/lib/cn";

/**
 * Progress toward free shipping. The threshold arrives with the quote rather than from a
 * local constant: it belongs to the shipping method the backend is currently selling,
 * and a shop with no free-shipping tier must not be shown a meter at all.
 */
export function FreeShippingMeter({ totals, threshold }: { totals: CartTotals; threshold: number | null }) {
  if (!threshold) return null;

  // Measured on what the buyer pays, as freeShippingRemaining is: a club discount counts.
  const progress = Math.min(100, ((totals.subtotal.amount - totals.discount.amount) / threshold) * 100);
  const reached = totals.freeShippingRemaining === 0 && totals.subtotal.amount > 0;

  // The meter is the stadium's toothed rail: each tooth that lights up is a step closer.
  return (
    <div className="rounded-[--radius-glass] border border-white/10 bg-grey-100 p-4">
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
      <div className="relative mt-3 h-3.5 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.14)_0_8px,transparent_8px_12px)]">
        <div
          className={cn(
            "absolute inset-y-0 left-0 transition-[width] duration-500 ease-[--ease-out-gear]",
            reached
              ? "bg-[repeating-linear-gradient(90deg,var(--color-available-solid)_0_8px,transparent_8px_12px)]"
              : "bg-[repeating-linear-gradient(90deg,var(--color-lime)_0_8px,transparent_8px_12px)]",
          )}
          style={{ width: `${progress}%` }}
        />
      </div>
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
