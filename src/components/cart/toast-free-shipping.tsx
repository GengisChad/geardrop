"use client";

import { MeterRail } from "@/components/cart/cart-summary";
import { shippingLine, type ShippingLine } from "@/lib/commerce/free-shipping-meter";
import { formatPrice } from "@/lib/format";
import { FREE_SHIPPING_FROM_LABEL } from "@/lib/labels";
import { useCartQuote } from "@/lib/use-cart-quote";

/**
 * The add toast's free-shipping line, from the server's quote of the cart that now holds the new
 * piece. The browser never adds prices up: until the quote answers it keeps the shop's standing
 * offer, and when the backend sells no free shipping it says nothing at all.
 */
export function ToastFreeShipping() {
  const { quote, loading } = useCartQuote();
  return <FreeShippingLine line={shippingLine(quote, loading)} />;
}

export function FreeShippingLine({ line }: { line: ShippingLine }) {
  if (line.kind === "none") return null;
  if (line.kind === "pending") {
    return <p className="mt-0.5 text-[0.6875rem] text-grey-600">Spedizione gratis da {FREE_SHIPPING_FROM_LABEL}</p>;
  }
  const unlocked = line.kind === "unlocked";
  return (
    <div className="mt-1">
      <p className="text-[0.6875rem] text-grey-600">
        {unlocked ? (
          <span className="font-semibold text-available">Spedizione gratuita sbloccata</span>
        ) : (
          <>
            Ancora <span className="tabular font-bold text-graphite">{formatPrice({ amount: line.remaining, currency: "EUR" })}</span> per la
            spedizione gratis
          </>
        )}
      </p>
      {/* The rail fills from empty when the answer lands: it is the feedback for this add. */}
      <MeterRail lit={line.teeth} from={0} reached={unlocked} className="mt-1.5 h-1.5 gap-0.5" />
    </div>
  );
}
