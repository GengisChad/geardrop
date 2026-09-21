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
  /** Units per slug the buyer was told are pre-ordered before paying (checkout metadata). */
  readonly announcedPreorder?: Readonly<Record<string, number>>;
  readonly shippingCents: number;
  /** Discount applied at checkout (promotion code, coupon). Always >= 0. */
  readonly discountCents: number;
  /** Promotion code text (e.g. "SUMMER10") when a code was applied, else null. */
  readonly couponCode: string | null;
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
  readonly total_details?: {
    readonly amount_shipping?: number | null;
    /** Total discount applied at checkout (promotion code + coupon). */
    readonly amount_discount?: number | null;
    /** Present when expanded with total_details.breakdown.discounts.discount.promotion_code. */
    readonly breakdown?: {
      readonly discounts?: readonly {
        readonly discount?: {
          readonly promotion_code?: string | { readonly code?: string | null } | null;
        } | null;
      }[] | null;
    } | null;
  } | null;
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

/** "glory-valkerion-lf x1, duo-horus-enlil x2" → { "glory-valkerion-lf": 1, "duo-horus-enlil": 2 }. */
export function parsePreorderMetadata(value: string | null | undefined): Readonly<Record<string, number>> {
  const units: Record<string, number> = {};
  for (const entry of clean(value).split(",")) {
    const match = /^([a-z0-9-]+) x(\d+)$/.exec(entry.trim());
    if (match) units[match[1]!] = (units[match[1]!] ?? 0) + Number(match[2]);
  }
  return units;
}

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
  const discountCents = session.total_details?.amount_discount ?? 0;

  // Promotion code text: loadPaidCheckout swaps the code's id for the object that carries it.
  const firstDiscount = session.total_details?.breakdown?.discounts?.[0];
  const promoCodeValue = firstDiscount?.discount?.promotion_code;
  const couponCode =
    typeof promoCodeValue === "object" && promoCodeValue !== null
      ? (promoCodeValue.code?.trim() || null)
      : null;

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
    announcedPreorder: parsePreorderMetadata(session.metadata?.["preorder"]),
    shippingCents,
    discountCents,
    couponCode,
    totalCents: session.amount_total ?? Math.max(0, subtotal - discountCents + shippingCents),
    createdAt: new Date(session.created * 1000).toISOString(),
  };
}

/** Reads a session back from Stripe with everything the order needs. */
export async function loadPaidCheckout(sessionId: string, stripe: StripeClient): Promise<PaidCheckout | null> {
  if (!/^cs_(live|test)_[A-Za-z0-9]{10,200}$/.test(sessionId)) return null;
  // payment_intent carries the shipping address, the breakdown the discounts. Stripe expands at
  // most four levels deep, so the promotion code inside a discount stays an id and is read on its
  // own: asking for it inline fails the whole read, and with it every paid order.
  const session = await stripe.get<StripeSessionForOrder>(
    `/checkout/sessions/${sessionId}?expand[]=payment_intent&expand[]=total_details.breakdown`,
  );
  if (!session) return null;
  const items = await stripe.get<{ readonly data: readonly StripeLineItemForOrder[] }>(
    `/checkout/sessions/${sessionId}/line_items?limit=100&expand[]=data.price`,
  );
  return paidCheckoutFromStripe(await withPromotionCode(session, stripe), items?.data ?? []);
}

/** Replaces the applied promotion code's id with the code itself. The order never waits on it. */
async function withPromotionCode(session: StripeSessionForOrder, stripe: StripeClient): Promise<StripeSessionForOrder> {
  const discounts = session.total_details?.breakdown?.discounts ?? [];
  const id = discounts[0]?.discount?.promotion_code;
  if (typeof id !== "string" || !/^promo_[A-Za-z0-9]{1,200}$/.test(id)) return session;
  try {
    const promotion = await stripe.get<{ readonly code?: string | null }>(`/promotion_codes/${id}`);
    if (!promotion?.code) return session;
    return {
      ...session,
      total_details: {
        ...session.total_details,
        breakdown: { discounts: [{ discount: { promotion_code: { code: promotion.code } } }, ...discounts.slice(1)] },
      },
    };
  } catch (error) {
    console.error("[orders] promotion code not readable:", error instanceof Error ? error.message : String(error));
    return session;
  }
}
