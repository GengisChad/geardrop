import "server-only";

import { createHash } from "node:crypto";
import type { PlaceOrderInput } from "@/lib/checkout-schema";
import type { CartQuote } from "@/lib/commerce/types";
import { preorderDelivery, preorderUnits } from "@/lib/labels";
import { createStripeClient, stripeProductId, type StripeClient } from "./stripe-api";

/**
 * Stripe Checkout straight from the catalogue.
 *
 * Used while the storefront runs on the reviewed catalogue (COMMERCE_PROVIDER=mock): the quote
 * comes from the catalogue with the database's live stock, and the payment page is Stripe's.
 * Nothing is reserved while the buyer pays; once Stripe confirms the payment, the webhook
 * (src/app/api/stripe/webhook) records the order and takes the stock. The Supabase order
 * intake path is untouched and never combined with this one.
 */

type Env = Readonly<Record<string, string | undefined>>;

export const STRIPE_BLOCKED_NOTICE = "Alcuni articoli non sono ordinabili: aggiorna il carrello per procedere.";
export const STRIPE_UNAVAILABLE_MESSAGE =
  "Il pagamento non è disponibile in questo momento. Il carrello resta salvato: riprova tra poco.";
export const STRIPE_PRICE_MISMATCH_MESSAGE =
  "I prezzi sono in aggiornamento. Il carrello resta salvato: riprova tra qualche minuto.";

const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const METADATA_LIMIT = 500;
const CUSTOM_TEXT_LIMIT = 1200;

export function stripeCheckoutEnabled(env: Env = process.env): boolean {
  return (
    env["PAYMENTS_PROVIDER"] === "stripe" &&
    Boolean(env["STRIPE_SECRET_KEY"]?.trim()) &&
    (env["COMMERCE_PROVIDER"] ?? "mock") !== "supabase"
  );
}

/** Opens a catalogue quote for Stripe: orderable only when every line can be sold as asked. */
export function openQuoteForStripe(quote: CartQuote): CartQuote {
  if (quote.orderIntake !== "unconfigured") return quote;
  const orderable =
    quote.lines.length > 0 &&
    quote.missingSlugs.length === 0 &&
    quote.shippingCode !== null &&
    quote.lines.every((line) => line.issue === null);
  return { ...quote, orderIntake: "open", orderable, notice: orderable ? null : STRIPE_BLOCKED_NOTICE, payment: "stripe" };
}

/** Short reference shown to the buyer and stored on the payment; stable for one checkout attempt. */
export function orderReference(idempotencyKey: string): string {
  const digest = createHash("sha256").update(idempotencyKey).digest();
  let reference = "";
  // 256 is a multiple of the 32-letter alphabet, so the modulo carries no bias.
  for (let index = 0; index < 8; index += 1) reference += REFERENCE_ALPHABET[(digest[index] ?? 0) % REFERENCE_ALPHABET.length];
  return `GD-${reference}`;
}

export type StripePriceRow = {
  readonly id: string;
  readonly lookup_key: string | null;
  readonly unit_amount: number | null;
  readonly currency: string;
  readonly active: boolean;
};

/**
 * Pairs every quote line with its Stripe price. Any drift from the catalogue amount refuses the
 * whole cart: the buyer must never be charged a number the site did not show.
 */
export function matchStripePrices(quote: CartQuote, prices: readonly StripePriceRow[]): Map<string, string> | null {
  const byLookupKey = new Map<string, StripePriceRow>();
  for (const price of prices) if (price.active && price.lookup_key) byLookupKey.set(price.lookup_key, price);

  const matched = new Map<string, string>();
  for (const line of quote.lines) {
    const price = byLookupKey.get(stripeProductId(line.slug));
    if (
      !price ||
      price.unit_amount !== line.unitPrice.amount ||
      price.currency !== line.unitPrice.currency.toLowerCase()
    ) {
      return null;
    }
    matched.set(line.slug, price.id);
  }
  return matched;
}

function truncate(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;
}

export type CheckoutSessionInput = {
  readonly quote: CartQuote;
  readonly order: PlaceOrderInput;
  /** Absolute origin the buyer returns to, without a trailing slash. */
  readonly origin: string;
  /** Milliseconds since the epoch; the session's expiry counts from here. */
  readonly now?: number;
};

/**
 * How long a buyer has to pay once on Stripe. Stock is checked when the session opens, so a
 * session left open for the default 24 hours could still be paid after the last piece had gone
 * (a pre-order drop sells out in an hour). Stripe accepts 30 minutes to 24 hours; the margin
 * keeps a slow clock from asking for less than 30.
 */
export const CHECKOUT_SESSION_MINUTES = 35;

export function buildCheckoutSessionFields(
  { quote, order, origin, now = Date.now() }: CheckoutSessionInput,
  priceIds: ReadonlyMap<string, string>,
): Record<string, string | number> {
  const { contact } = order;
  const reference = orderReference(order.idempotencyKey);
  const shipping = quote.totals.shipping.amount;

  const fields: Record<string, string | number> = {
    mode: "payment",
    locale: "it",
    customer_email: contact.email,
    client_reference_id: reference,
    // Stripe substitutes the literal placeholder; it must not be URL-encoded.
    success_url: `${origin}/checkout/successo?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/checkout`,
    expires_at: Math.floor(now / 1000) + CHECKOUT_SESSION_MINUTES * 60,
    // No consent_collection or after_expiration recovery: Stripe refuses promotions consent for
    // Italian accounts ("not available in your country") and fails the whole session, and
    // recovery emails need that consent. Manual promotion codes are fine.
    "allow_promotion_codes": "true",
    "metadata[order_ref]": reference,
    "metadata[lines]": truncate(quote.lines.map((line) => `${line.slug} x${line.quantity}`).join(", "), METADATA_LIMIT),
    "payment_intent_data[description]": `Ordine ${reference} · GEAR//DROP`,
    "payment_intent_data[metadata][order_ref]": reference,
    // The address was already collected and validated on the site; Stripe keeps it with the payment.
    "payment_intent_data[shipping][name]": `${contact.firstName} ${contact.lastName}`.trim(),
    "payment_intent_data[shipping][phone]": contact.phone,
    "payment_intent_data[shipping][address][line1]": contact.address,
    "payment_intent_data[shipping][address][city]": contact.city,
    "payment_intent_data[shipping][address][postal_code]": contact.postalCode,
    "payment_intent_data[shipping][address][state]": contact.province,
    "payment_intent_data[shipping][address][country]": "IT",
    "shipping_options[0][shipping_rate_data][type]": "fixed_amount",
    "shipping_options[0][shipping_rate_data][display_name]": shipping === 0 ? "Spedizione gratuita" : "Spedizione standard",
    "shipping_options[0][shipping_rate_data][fixed_amount][amount]": shipping,
    "shipping_options[0][shipping_rate_data][fixed_amount][currency]": "eur",
    "shipping_options[0][shipping_rate_data][tax_behavior]": "inclusive",
  };

  quote.lines.forEach((line, index) => {
    const priceId = priceIds.get(line.slug);
    if (!priceId) throw new Error(`Missing Stripe price for ${line.slug}`);
    fields[`line_items[${index}][price]`] = priceId;
    fields[`line_items[${index}][quantity]`] = line.quantity;
  });

  const notes = contact.notes?.trim();
  if (notes) fields["metadata[notes]"] = truncate(notes, METADATA_LIMIT);

  // Pieces beyond the shelf are pre-ordered: the buyer reads it next to the pay button, and the
  // webhook compares what was announced here with what the stock allowed at payment time.
  const preorders = quote.lines.flatMap((line) => {
    const units = preorderUnits(line);
    return units > 0 ? [{ line, units }] : [];
  });
  if (preorders.length > 0) {
    fields["metadata[preorder]"] = truncate(preorders.map(({ line, units }) => `${line.slug} x${units}`).join(", "), METADATA_LIMIT);
    fields["custom_text[submit][message]"] = truncate(
      `In pre-ordine: ${preorders.map(({ line, units }) => `${units} × ${line.name}`).join(", ")}. ${preorderDelivery(preorders.some(({ line }) => line.releasePreorder))}.`,
      CUSTOM_TEXT_LIMIT,
    );
  }

  return fields;
}

export type CheckoutResult = { readonly ok: true; readonly url: string } | { readonly ok: false; readonly message: string };

export async function createStripeCheckout(
  input: CheckoutSessionInput,
  env: Env = process.env,
  client?: StripeClient,
): Promise<CheckoutResult> {
  const secretKey = env["STRIPE_SECRET_KEY"]?.trim();
  if (!secretKey) return { ok: false, message: STRIPE_UNAVAILABLE_MESSAGE };
  const stripe = client ?? createStripeClient(secretKey);

  try {
    const query = new URLSearchParams({ active: "true", limit: "100" });
    input.quote.lines.forEach((line, index) => query.append(`lookup_keys[${index}]`, stripeProductId(line.slug)));
    const prices = await stripe.get<{ readonly data: readonly StripePriceRow[] }>(`/prices?${query.toString()}`);

    const priceIds = matchStripePrices(input.quote, prices?.data ?? []);
    if (!priceIds) {
      console.error("[stripe-checkout] catalogue and Stripe prices differ: run pnpm stripe:products --apply");
      return { ok: false, message: STRIPE_PRICE_MISMATCH_MESSAGE };
    }

    const fields = buildCheckoutSessionFields(input, priceIds);
    // Same attempt and same cart → same key, so a retried request returns the session Stripe already made.
    const idempotencyKey = `gd-checkout-${createHash("sha256").update(JSON.stringify(fields)).digest("hex").slice(0, 40)}`;
    const session = await stripe.post<{ readonly url: string | null }>("/checkout/sessions", fields, idempotencyKey);
    if (!session.url) throw new Error("Stripe returned a Checkout Session without a URL");
    return { ok: true, url: session.url };
  } catch (error) {
    console.error("[stripe-checkout]", error instanceof Error ? error.message : error);
    return { ok: false, message: STRIPE_UNAVAILABLE_MESSAGE };
  }
}

export type CheckoutSessionSummary = {
  readonly status: "open" | "complete" | "expired";
  readonly paymentStatus: "paid" | "unpaid" | "no_payment_required";
  readonly reference: string | null;
  readonly totalCents: number | null;
  readonly email: string | null;
};

type StripeCheckoutSession = {
  readonly status: CheckoutSessionSummary["status"];
  readonly payment_status: CheckoutSessionSummary["paymentStatus"];
  readonly client_reference_id: string | null;
  readonly amount_total: number | null;
  readonly customer_details?: { readonly email?: string | null } | null;
};

/** Reads a session back for the result page. Malformed ids never reach Stripe. */
export async function retrieveCheckoutSession(
  sessionId: string,
  env: Env = process.env,
  client?: StripeClient,
): Promise<CheckoutSessionSummary | null> {
  if (!/^cs_(live|test)_[A-Za-z0-9]{10,200}$/.test(sessionId)) return null;
  const secretKey = env["STRIPE_SECRET_KEY"]?.trim();
  if (!secretKey) return null;

  try {
    const session = await (client ?? createStripeClient(secretKey)).get<StripeCheckoutSession>(
      `/checkout/sessions/${sessionId}`,
    );
    if (!session) return null;
    return {
      status: session.status,
      paymentStatus: session.payment_status,
      reference: session.client_reference_id,
      totalCents: session.amount_total,
      email: session.customer_details?.email ?? null,
    };
  } catch (error) {
    console.error("[stripe-checkout]", error instanceof Error ? error.message : error);
    return null;
  }
}
