import { Truck } from "lucide-react";
import { formatPrice, formatShipping } from "@/lib/format";
import type { CartTotals } from "@/lib/commerce/types";
import { cn } from "@/lib/cn";

/**
 * Progress toward free shipping. The threshold arrives with the quote rather than from a
 * local constant: it belongs to the shipping method the backend is currently selling,
 * and a shop with no free-shipping tier must not be shown a meter at all.
 */
export function FreeShippingMeter({ totals, threshold }: { totals: CartTotals; threshold: number | null }) {
  if (!threshold) return null;

  const progress = Math.min(100, (totals.subtotal.amount / threshold) * 100);
  const reached = totals.freeShippingRemaining === 0 && totals.subtotal.amount > 0;

  return (
    <div className="rounded-xl border border-grey-200 bg-grey-100 p-4">
      <p className="flex items-center gap-2 text-small">
        <Truck className={cn("size-4 shrink-0", reached ? "text-available" : "text-violet")} aria-hidden="true" />
        {reached ? (
          <span className="font-semibold text-available">Spedizione gratuita sbloccata.</span>
        ) : (
          <span className="text-grey-600">
            Ti mancano{" "}
            <span className="tabular font-bold text-graphite">
              {formatPrice({ amount: totals.freeShippingRemaining, currency: "EUR" })}
            </span>{" "}
            alla spedizione gratuita.
          </span>
        )}
      </p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-grey-300">
        <div
          className={cn("h-full rounded-full transition-[width] duration-500 ease-[--ease-out-gear]", reached ? "bg-available-solid" : "bg-lime")}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

export function CartTotalsPanel({ totals, className }: { totals: CartTotals; className?: string }) {
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
      <div className="flex justify-between text-small">
        <dt className="text-grey-600">Spedizione</dt>
        <dd
          className={cn("tabular font-semibold", totals.shipping.amount === 0 ? "text-available" : "text-graphite")}
          data-testid="cart-shipping"
        >
          {formatShipping(totals.shipping)}
        </dd>
      </div>
      <div className="flex items-baseline justify-between border-t border-grey-200 pt-3">
        <dt className="gd-display text-small font-bold tracking-wider text-graphite">Totale</dt>
        <dd className="tabular gd-display text-h3 font-extrabold text-graphite" data-testid="cart-total">
          {formatPrice(totals.total)}
        </dd>
      </div>
      <p className="text-[0.6875rem] text-grey-600">IVA inclusa. Spese di spedizione calcolate qui sopra.</p>
    </dl>
  );
}
