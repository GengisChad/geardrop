import { RotateCcw, Truck } from "lucide-react";
import { PARTNER_SHIPPING_METHOD, SHIPPING_METHODS, FREE_SHIPPING_THRESHOLD } from "@/data/catalog";
import { PREORDER_DELIVERY, RELEASE_DELIVERY } from "@/lib/labels";
import { formatPrice } from "@/lib/format";
import type { Product } from "@/lib/commerce/types";

type DeliverySummaryProps = { product: Product };

/** Short € label without a trailing ",00". */
const eur = (cents: number) =>
  formatPrice({ amount: cents, currency: "EUR" }).replace(/,00$/, "");

/**
 * Compact delivery block placed right below the cart button on the PDP
 * (owner, 2026-10-12). Prices are always derived from catalog constants so
 * they cannot drift from checkout.
 */
export function DeliverySummary({ product }: DeliverySummaryProps) {
  const isConsignment = !!product.consignment;
  const isPreorder = product.stock === "pre-ordine";

  // Method constants — never hard-coded prices, pull straight from catalog.
  const inpost = SHIPPING_METHODS.find((m) => m.code === "inpost-point")!;
  const poste = SHIPPING_METHODS.find((m) => m.code === "standard")!;
  const freeLabel = eur(FREE_SHIPPING_THRESHOLD);

  return (
    <div
      data-testid="delivery-summary"
      className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3"
    >
      {isConsignment ? (
        /* Takara consignment: ships from partner warehouse via Poste Punto Poste or Locker. */
        <ul className="flex flex-col gap-2">
          <li className="flex items-start gap-2.5 text-small text-grey-600">
            <Truck className="mt-0.5 size-3.5 shrink-0 text-violet-soft" aria-hidden="true" />
            <span>
              <span className="font-medium text-graphite">{PARTNER_SHIPPING_METHOD.label}</span>
              {" · "}
              {eur(PARTNER_SHIPPING_METHOD.priceCents)}
            </span>
          </li>
          <li className="flex items-start gap-2.5 text-small text-grey-600">
            <Truck className="mt-0.5 size-3.5 shrink-0 text-violet-soft" aria-hidden="true" />
            <span>Spedito dal nostro partner · 2-6 giorni lavorativi</span>
          </li>
          {/* Free-shipping threshold applies to every plan at the quoting layer, Takara carts
              included — showing it here keeps the promise consistent with checkout (owner, 2026-10-12).
              The 30-day return row is intentionally absent: that policy covers GearDrop-fulfilled
              orders only; NerdPoint's terms are not codified yet. */}
          <li className="flex items-start gap-2.5 text-small text-grey-600">
            <Truck className="mt-0.5 size-3.5 shrink-0 text-lime" aria-hidden="true" />
            <span>
              Gratis da {freeLabel}
            </span>
          </li>
        </ul>
      ) : isPreorder ? (
        /* Pre-orders: show the wait instead of shipping options. */
        <p className="flex items-start gap-2.5 text-small text-grey-600">
          <Truck className="mt-0.5 size-3.5 shrink-0 text-violet-soft" aria-hidden="true" />
          <span>{product.releasePreorder ? RELEASE_DELIVERY : PREORDER_DELIVERY}</span>
        </p>
      ) : (
        /* Standard Hasbro pieces: two methods, free threshold, 30-day return. */
        <ul className="flex flex-col gap-2">
          <li className="flex items-start gap-2.5 text-small text-grey-600">
            <Truck className="mt-0.5 size-3.5 shrink-0 text-violet-soft" aria-hidden="true" />
            <span>
              <span className="font-medium text-graphite">{inpost.label}</span>
              {" · "}
              {eur(inpost.priceCents)}
            </span>
          </li>
          <li className="flex items-start gap-2.5 text-small text-grey-600">
            <Truck className="mt-0.5 size-3.5 shrink-0 text-violet-soft" aria-hidden="true" />
            <span>
              <span className="font-medium text-graphite">{poste.label}</span>
              {" · "}
              {eur(poste.priceCents)}
            </span>
          </li>
          <li className="flex items-start gap-2.5 text-small text-grey-600">
            <Truck className="mt-0.5 size-3.5 shrink-0 text-lime" aria-hidden="true" />
            <span>
              Gratis da {freeLabel}
            </span>
          </li>
          <li className="flex items-start gap-2.5 text-small text-grey-600">
            <RotateCcw className="mt-0.5 size-3.5 shrink-0 text-violet-soft" aria-hidden="true" />
            <span>Reso gratuito entro 30 giorni</span>
          </li>
        </ul>
      )}
    </div>
  );
}
