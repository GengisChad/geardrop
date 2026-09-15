"use server";

import { headers } from "next/headers";
import {
  cartQuoteSchema,
  placeOrderSchema,
  type CartQuoteInput,
  type PlaceOrderInput,
} from "@/lib/checkout-schema";
import {
  CHECKOUT_FALLBACK_MESSAGE,
  CHECKOUT_UNAVAILABLE,
  checkoutErrorMessage,
} from "@/lib/commerce/checkout-errors";
import { placeOrder } from "@/lib/commerce/order-intake";
import { getCommerceProvider, resolveCommerceProviderName } from "@/lib/commerce/provider";
import type { CartQuote, Money } from "@/lib/commerce/types";
import { createStripeCheckout, openQuoteForStripe, stripeCheckoutEnabled } from "@/lib/payments/stripe-checkout";
import { authRedirectUrl, PRODUCTION_ORIGIN } from "@/lib/site-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PlaceOrderResult =
  | { readonly ok: true; readonly orderNumber: string; readonly total: Money | null }
  /** Stripe takes the payment: the browser must continue at this URL. */
  | { readonly ok: true; readonly redirectUrl: string }
  | { readonly ok: false; readonly message: string };

/**
 * Prices a cart server-side.
 *
 * The browser sends slugs and quantities; everything with a currency on it comes back
 * from the provider, which for Supabase means the `calculate_cart_pricing` RPC. Nothing
 * the caller sends can influence an amount.
 */
export async function requestCartQuote(input: CartQuoteInput): Promise<CartQuote> {
  const parsed = cartQuoteSchema.safeParse(input);
  if (!parsed.success) {
    return unavailableQuote("Il carrello contiene righe non valide. Ricarica la pagina.");
  }
  if (parsed.data.lines.length === 0) return emptyQuote();

  const provider = await getCommerceProvider();
  try {
    const quote = await provider.quoteCart({
      lines: toQuoteLines(parsed.data.lines),
      ...(parsed.data.shippingCode ? { shippingCode: parsed.data.shippingCode } : {}),
      ...(parsed.data.couponCode ? { couponCode: parsed.data.couponCode } : {}),
    });
    return stripeCheckoutEnabled() ? openQuoteForStripe(quote) : quote;
  } catch (error) {
    return unavailableQuote(checkoutErrorMessage(error));
  }
}

/**
 * Registers a real order.
 *
 * Uses the request-scoped Supabase client so PostgreSQL sees the caller's own identity:
 * a guest arrives as `anon` and the order is filed without a customer, a signed-in
 * shopper arrives as `authenticated` and the order is bound to them. The service-role
 * key is never involved — it would authenticate as nobody.
 */
export async function submitOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const parsed = placeOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Controlla i dati inseriti e riprova." };
  }

  if (stripeCheckoutEnabled()) {
    // No order database: the catalogue prices the cart again here, whatever the browser
    // last saw, and Stripe records the order once it is paid.
    try {
      const provider = await getCommerceProvider();
      const quote = openQuoteForStripe(
        await provider.quoteCart({
          lines: toQuoteLines(parsed.data.lines),
          shippingCode: parsed.data.contact.shippingMethod,
        }),
      );
      if (!quote.orderable) return { ok: false, message: quote.notice ?? CHECKOUT_FALLBACK_MESSAGE };

      const checkout = await createStripeCheckout({ quote, order: parsed.data, origin: await checkoutOrigin() });
      return checkout.ok ? { ok: true, redirectUrl: checkout.url } : { ok: false, message: checkout.message };
    } catch (error) {
      return { ok: false, message: checkoutErrorMessage(error) };
    }
  }

  if (resolveCommerceProviderName() !== "supabase") {
    // No order backend is configured. Refusing is the honest answer; the previous
    // implementation invented an order number here.
    return { ok: false, message: checkoutErrorMessage({ message: CHECKOUT_UNAVAILABLE }) };
  }

  try {
    const client = await createSupabaseServerClient();
    const order = await placeOrder(client, parsed.data);
    return { ok: true, orderNumber: order.orderNumber, total: order.total };
  } catch (error) {
    return { ok: false, message: checkoutErrorMessage(error) };
  }
}

function toQuoteLines(lines: readonly { readonly slug: string; readonly quantity: number }[]) {
  return lines.map((line) => ({
    slug: line.slug as CartQuote["lines"][number]["slug"],
    quantity: line.quantity,
  }));
}

/**
 * Where Stripe sends the buyer back. Production is pinned to the canonical origin; previews
 * and local runs return to the host that served the checkout.
 */
async function checkoutOrigin(): Promise<string> {
  if (process.env["VERCEL_ENV"] === "production") return PRODUCTION_ORIGIN;
  return new URL(authRedirectUrl((await headers()).get("origin"), "/")).origin;
}

function emptyQuote(): CartQuote {
  return {
    lines: [],
    missingSlugs: [],
    shippingOptions: [],
    shippingCode: null,
    totals: {
      subtotal: { amount: 0, currency: "EUR" },
      discount: { amount: 0, currency: "EUR" },
      shipping: { amount: 0, currency: "EUR" },
      total: { amount: 0, currency: "EUR" },
      freeShippingRemaining: 0,
    },
    freeShippingThreshold: null,
    couponCode: null,
    couponError: null,
    orderIntake: "closed",
    orderable: false,
    notice: null,
  };
}

function unavailableQuote(notice: string): CartQuote {
  return { ...emptyQuote(), notice };
}
