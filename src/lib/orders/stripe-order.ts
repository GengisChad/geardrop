import { BUNDLES, PRODUCTS } from "@/data/catalog";
import { stripeProductId, type StripeClient } from "@/lib/payments/stripe-api";

/**
 * A paid Stripe Checkout Session, reduced to what the shop needs to ship it.
 *
 * The storefront collects the address on the site and hands it to Stripe as the payment's
 * shipping details (see buildCheckoutSessionFields), so the PaymentIntent is where it comes
 * back from. Line items carry the price lookup key, which names the catalogue slug.
 */

export type PaidCheckoutLine = {
  readonly slug: string;
  readonly name: string;
  readonly quantity: number;
  readonly unitPriceCents: number;
  /** Set for a bundle: the catalogue products one unit ships, whose stock the order takes. */
  readonly components?: readonly { readonly slug: string; readonly quantity: number }[];
};

export type ShippingSnapshot = {
  readonly name: string;
  readonly address: string;
  readonly postalCode: string;
  readonly city: string;
  readonly province: string;
  readonly country: string;
};

export type PaidCheckout = {
  readonly sessionId: string;
  readonly paymentIntentId: string | null;
  readonly reference: string;
  readonly email: string;
  readonly phone: string | null;
  readonly shipping: ShippingSnapshot;
  readonly notes: string | null;
  readonly lines: readonly PaidCheckoutLine[];
  readonly shippingCents: number;
  readonly totalCents: number;
  readonly createdAt: string;
};

type StripeAddress = {
  readonly line1?: string | null;
  readonly line2?: string | null;
  readonly postal_code?: string | null;
  readonly city?: string | null;
  readonly state?: string | null;
  readonly country?: string | null;
};

export type StripeSessionForOrder = {
  readonly id: string;
  readonly created: number;
  readonly payment_status: string;
  readonly client_reference_id?: string | null;
  readonly customer_email?: string | null;
  readonly amount_total?: number | null;
  readonly metadata?: Readonly<Record<string, string>> | null;
  readonly customer_details?: {
    readonly email?: string | null;
    readonly phone?: string | null;
    readonly name?: string | null;
    readonly address?: StripeAddress | null;
  } | null;
  readonly total_details?: { readonly amount_shipping?: number | null } | null;
  readonly shipping_cost?: { readonly amount_total?: number | null } | null;
  readonly payment_intent?:
    | string
    | {
        readonly id: string;
        readonly shipping?: { readonly name?: string | null; readonly phone?: string | null; readonly address?: StripeAddress | null } | null;
      }
    | null;
};

export type StripeLineItemForOrder = {
  readonly description?: string | null;
  readonly quantity?: number | null;
  readonly amount_subtotal?: number | null;
  readonly price?: {
    readonly lookup_key?: string | null;
    readonly unit_amount?: number | null;
    readonly product?: string | { readonly id: string } | null;
  } | null;
};

/** Stripe ids of products later renamed in the catalogue; payments made before the rename still name them. */
const RENAMED_STRIPE_IDS: Readonly<Record<string, string>> = {
  gd_glory_valkyrie_lf: "glory-valkerion-lf",
};

const SLUG_BY_STRIPE_ID = new Map([
  ...Object.entries(RENAMED_STRIPE_IDS),
  ...[...PRODUCTS, ...BUNDLES].map((product) => [stripeProductId(product.slug), product.slug as string] as const),
]);

const COMPONENTS_BY_BUNDLE = new Map(
  BUNDLES.map((bundle) => [bundle.slug as string, (bundle.bundleOf ?? []).map((part) => ({ slug: part.slug as string, quantity: part.quantity }))]),
);

/** gd_glory_valkerion_lf → glory-valkerion-lf, preferring the catalogue so renamed slugs still resolve. */
export function slugFromStripeId(id: string | null | undefined): string | null {
  if (!id) return null;
  return SLUG_BY_STRIPE_ID.get(id) ?? (id.startsWith("gd_") ? id.slice(3).replaceAll("_", "-") : null);
}

const clean = (value: string | null | undefined) => value?.trim() ?? "";

/** Maps a paid session and its line items; null when the session is not (yet) paid. */
export function paidCheckoutFromStripe(
  session: StripeSessionForOrder,
  lineItems: readonly StripeLineItemForOrder[],
): PaidCheckout | null {
  if (session.payment_status !== "paid") return null;

  const intent = typeof session.payment_intent === "object" && session.payment_intent ? session.payment_intent : null;
  const shipping = intent?.shipping ?? null;
  const address = shipping?.address ?? session.customer_details?.address ?? null;
  const email = clean(session.customer_details?.email) || clean(session.customer_email);

  const lines = lineItems.flatMap((item): PaidCheckoutLine[] => {
    const productId = typeof item.price?.product === "string" ? item.price.product : item.price?.product?.id;
    const slug = slugFromStripeId(item.price?.lookup_key) ?? slugFromStripeId(productId);
    const quantity = item.quantity ?? 0;
    if (!slug || quantity < 1) return [];
    const unitPriceCents = item.price?.unit_amount ?? Math.round((item.amount_subtotal ?? 0) / quantity);
    const components = COMPONENTS_BY_BUNDLE.get(slug);
    return [{ slug, name: clean(item.description) || slug, quantity, unitPriceCents, ...(components ? { components } : {}) }];
  });

  if (!email || lines.length === 0) return null;

  const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.unitPriceCents, 0);
  const shippingCents = session.total_details?.amount_shipping ?? session.shipping_cost?.amount_total ?? 0;

  return {
    sessionId: session.id,
    paymentIntentId: intent?.id ?? (typeof session.payment_intent === "string" ? session.payment_intent : null),
    reference: clean(session.client_reference_id) || clean(session.metadata?.["order_ref"]) || `GD-${session.id.slice(-8).toUpperCase()}`,
    email,
    phone: clean(shipping?.phone) || clean(session.customer_details?.phone) || null,
    shipping: {
      name: clean(shipping?.name) || clean(session.customer_details?.name),
      address: [clean(address?.line1), clean(address?.line2)].filter(Boolean).join(", "),
      postalCode: clean(address?.postal_code),
      city: clean(address?.city),
      province: clean(address?.state),
      country: clean(address?.country) || "IT",
    },
    notes: clean(session.metadata?.["notes"]) || null,
    lines,
    shippingCents,
    totalCents: session.amount_total ?? subtotal + shippingCents,
    createdAt: new Date(session.created * 1000).toISOString(),
  };
}

/** Reads a session back from Stripe with everything the order needs. */
export async function loadPaidCheckout(sessionId: string, stripe: StripeClient): Promise<PaidCheckout | null> {
  if (!/^cs_(live|test)_[A-Za-z0-9]{10,200}$/.test(sessionId)) return null;
  const session = await stripe.get<StripeSessionForOrder>(`/checkout/sessions/${sessionId}?expand[]=payment_intent`);
  if (!session) return null;
  const items = await stripe.get<{ readonly data: readonly StripeLineItemForOrder[] }>(
    `/checkout/sessions/${sessionId}/line_items?limit=100&expand[]=data.price`,
  );
  return paidCheckoutFromStripe(session, items?.data ?? []);
}
