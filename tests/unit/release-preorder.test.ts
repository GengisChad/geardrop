import { describe, expect, it } from "vitest";
import { BUNDLES, PRODUCTS } from "@/data/catalog";
import { createMockProvider } from "@/lib/commerce/mock-provider";
import { isReleasePreorder } from "@/lib/commerce/release-preorder";
import { cartDelivery, deliveryClause, preorderDelivery, preorderNote, PREORDER_DELIVERY, RELEASE_DELIVERY } from "@/lib/labels";
import { buildCheckoutSessionFields, matchStripePrices, openQuoteForStripe } from "@/lib/payments/stripe-checkout";
import { ownerOrderEmail, customerOrderEmail } from "@/lib/orders/order-email";
import { stripeProductId } from "@/lib/payments/stripe-api";
import type { PaidCheckout } from "@/lib/orders/stripe-order";
import type { PlaceOrderInput } from "@/lib/checkout-schema";

const provider = createMockProvider();
const drop = PRODUCTS.filter((product) => product.releasePreorder);
const superion = PRODUCTS.find((product) => product.slug === "suppress-superion-0-70lp")!;

const order: PlaceOrderInput = {
  contact: {
    email: "buyer@example.com", firstName: "Mario", lastName: "Rossi", address: "Via Roma 1", city: "Milano",
    postalCode: "20121", province: "MI", phone: "3331234567", shippingMethod: "standard",
  },
  lines: [{ slug: "suppress-superion-0-70lp", quantity: 1 }],
  idempotencyKey: "3b241101-e2bb-4255-8caf-4136c566a962",
};

describe("the September drop ships at the Hasbro release", () => {
  it("marks every piece of the drop, and nothing else", () => {
    expect(drop.map((product) => product.slug)).toEqual([
      "cobalt-drake-4-60f",
      "mirage-clock-9-65b",
      "suppress-superion-0-70lp",
      "strike-dran-4-50ff",
      "tread-croc-tq-5-50gn",
    ]);
    for (const product of drop) expect(isReleasePreorder(product.slug)).toBe(true);
    // An open pre-order is a shelf that ran out, not an unreleased piece.
    expect(isReleasePreorder("glory-valkerion-lf")).toBe(false);
    expect(isReleasePreorder("cobalt-dragoon-2-60c")).toBe(false);
  });

  it("says the release wait, and keeps the 10/15 days for what only left the shelf", () => {
    expect(RELEASE_DELIVERY).toContain("uscita Hasbro");
    expect(RELEASE_DELIVERY).toContain("circa 20 giorni lavorativi");
    expect(RELEASE_DELIVERY).toContain("dipende dalle consegne");
    expect(preorderDelivery(true)).toBe(RELEASE_DELIVERY);
    expect(preorderDelivery(false)).toBe(PREORDER_DELIVERY);
    expect(preorderDelivery()).toBe(PREORDER_DELIVERY);
  });

  it("carries the wait from the catalogue into the cart", async () => {
    const quote = await provider.quoteCart({ lines: [{ slug: superion.slug, quantity: 2 }] });
    const line = quote.lines[0]!;

    expect(line.releasePreorder).toBe(true);
    // Only the first letter drops its case, so Hasbro keeps its own.
    expect(preorderNote(line)).toBe(`In pre-ordine · ${deliveryClause(RELEASE_DELIVERY)}`);
    expect(preorderNote(line)).toContain("uscita Hasbro");
    expect(cartDelivery(quote.lines)).toBe(RELEASE_DELIVERY);
  });

  it("names the longest wait when the cart mixes a release with pieces on the shelf", async () => {
    const quote = await provider.quoteCart({
      lines: [{ slug: superion.slug, quantity: 1 }, { slug: "hurricane-enlil-is-7-55t", quantity: 1 }],
    });

    const delivery = cartDelivery(quote.lines);
    expect(delivery).toContain("Consegna in 1-5 giorni lavorativi");
    expect(delivery).toContain("uscita Hasbro");
    expect(delivery).not.toContain("10/15");
  });

  it("tells the buyer on the Stripe page and in the order email", async () => {
    const quote = openQuoteForStripe(await provider.quoteCart({ lines: [{ slug: superion.slug, quantity: 1 }] }));
    const prices = [{ id: "price_superion", lookup_key: stripeProductId(superion.slug), unit_amount: superion.price.amount, currency: "eur", active: true }];
    const fields = buildCheckoutSessionFields({ quote, order, origin: "https://geardropshop.it" }, matchStripePrices(quote, prices)!);
    expect(String(fields["custom_text[submit][message]"])).toContain("uscita Hasbro");

    const checkout = {
      sessionId: "cs_live_release", paymentIntentId: "pi_release", reference: "GD-RELEASE1", email: "buyer@example.com",
      phone: null, shipping: { name: "Mario Rossi", address: "Via Roma 1", postalCode: "20121", city: "Milano", province: "MI", country: "IT" },
      notes: null, lines: [{ slug: superion.slug, name: superion.name, quantity: 1, unitPriceCents: superion.price.amount, releasePreorder: true as const }],
      shippingCents: 490, discountCents: 0, couponCode: null, totalCents: superion.price.amount + 490, createdAt: "2026-09-22T09:00:00.000Z",
    } satisfies PaidCheckout;
    const stored = { id: 1, orderNumber: "GD-RELEASE1", created: true, preorderQuantities: [1] };

    expect(customerOrderEmail(checkout, stored).text).toContain("uscita Hasbro");
    // The owner's copy keeps its own wording: what to buy, not how long the buyer waits.
    expect(ownerOrderEmail(checkout, stored, []).text).toContain("PRE-ORDINE");
  });
});

describe("prices of 2026-09-22", () => {
  it("puts five Suppress Superion back on sale, the pieces left after the owner's own", () => {
    expect(superion).toMatchObject({ stock: "pre-ordine", availableQuantity: 5, releasePreorder: true });
  });

  it("carries the owner's new prices", () => {
    const price = (slug: string) => PRODUCTS.find((product) => product.slug === slug)!.price.amount;
    expect(price("strike-dran-4-50ff")).toBe(2300);
    expect(price("shatter-horus-9-65gb")).toBe(1800);
    expect(price("hurricane-enlil-is-7-55t")).toBe(1800);
  });

  it("keeps every bundle cheaper than the packs it ships", () => {
    for (const bundle of BUNDLES) {
      const parts = (bundle.bundleOf ?? []).reduce(
        (sum, part) => sum + part.quantity * PRODUCTS.find((product) => product.slug === part.slug)!.price.amount,
        0,
      );
      expect(parts, bundle.slug).toBeGreaterThan(0);
      expect(bundle.price.amount, `${bundle.slug} must undercut its packs`).toBeLessThan(parts);
      // The struck-through price is what the packs really cost, never an invented one.
      expect(bundle.compareAtPrice?.amount, bundle.slug).toBe(parts);
    }
  });
});
