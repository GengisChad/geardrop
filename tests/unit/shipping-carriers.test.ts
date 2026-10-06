import { describe, expect, it } from "vitest";
import { INPOST_POINT_FINDER_URL, SHIPPING_METHODS, shippingMethodByCode } from "@/data/catalog";
import { checkoutFormSchema, placeOrderSchema, type PlaceOrderInput } from "@/lib/checkout-schema";
import { shipmentChoice } from "@/lib/admin/orders";
import { createMockProvider } from "@/lib/commerce/mock-provider";
import type { CartQuoteRequest } from "@/lib/commerce/types";
import { customerOrderEmail, ownerOrderEmail } from "@/lib/orders/order-email";
import { paidCheckoutFromStripe, shippingChoice, type PaidCheckout } from "@/lib/orders/stripe-order";
import { buildCheckoutSessionFields, openQuoteForStripe } from "@/lib/payments/stripe-checkout";

/*
 * The owner's rule (2026-10-06): the buyer picks the carrier, and pays what it costs the shop —
 * Poste Italiane 4,90 €, InPost to a point or Locker 5,65 €, InPost to the door 6,65 € — instead
 * of every InPost parcel costing the shop a euro or more on top of a flat 4,90 €.
 */

const contact = {
  email: "mario.rossi@email.it",
  firstName: "Mario",
  lastName: "Rossi",
  address: "Via Roma 1",
  city: "Milano",
  postalCode: "20121",
  province: "MI",
  phone: "+39 333 1234567",
  shippingMethod: "standard",
};

const order = (shippingMethod: string, pickupPoint?: string): PlaceOrderInput => ({
  contact: { ...contact, shippingMethod, ...(pickupPoint ? { pickupPoint } : {}) },
  lines: [{ slug: "cobalt-dragoon-2-60c", quantity: 1 }],
  idempotencyKey: "3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607",
});

const prices = new Map([["cobalt-dragoon-2-60c", "price_cobalt"]]);
const quoteWith = async (shippingCode: string) =>
  openQuoteForStripe(await createMockProvider().quoteCart({ lines: [{ slug: "cobalt-dragoon-2-60c", quantity: 1 }], shippingCode } as CartQuoteRequest));

describe("the carriers", () => {
  it("cost what the owner pays to send the parcel", () => {
    expect(SHIPPING_METHODS.map((method) => [method.code, method.carrier, method.priceCents, method.pickupPoint])).toEqual([
      ["standard", "poste", 490, false],
      ["inpost-point", "inpost", 565, true],
      ["inpost-home", "inpost", 665, false],
    ]);
    expect(INPOST_POINT_FINDER_URL).toBe("https://inpost.it/trova-un-locker");
  });
});

describe("the checkout form", () => {
  it("asks for the InPost point only when the parcel goes to one", () => {
    expect(checkoutFormSchema.safeParse({ ...contact, shippingMethod: "inpost-point" }).success).toBe(false);
    expect(checkoutFormSchema.safeParse({ ...contact, shippingMethod: "inpost-point", pickupPoint: "  " }).success).toBe(false);
    expect(checkoutFormSchema.safeParse({ ...contact, shippingMethod: "inpost-point", pickupPoint: "MIL123M" }).success).toBe(true);
    expect(checkoutFormSchema.safeParse({ ...contact, shippingMethod: "inpost-home" }).success).toBe(true);
    expect(checkoutFormSchema.safeParse({ ...contact, shippingMethod: "standard" }).success).toBe(true);
    // The server applies the same rule to the order it receives.
    expect(placeOrderSchema.safeParse(order("inpost-point")).success).toBe(false);
  });
});

describe("the Stripe payment page", () => {
  it("names the carrier and charges its price", async () => {
    const fields = buildCheckoutSessionFields({ quote: await quoteWith("inpost-home"), order: order("inpost-home"), origin: "https://geardropshop.it" }, prices);
    expect(fields["shipping_options[0][shipping_rate_data][display_name]"]).toBe("InPost · consegna a casa");
    expect(fields["shipping_options[0][shipping_rate_data][fixed_amount][amount]"]).toBe(665);
    expect(fields["metadata[shipping_method]"]).toBe("inpost-home");
    expect(fields["metadata[pickup_point]"]).toBeUndefined();
  });

  it("carries the InPost point the buyer named, and only for a pickup", async () => {
    const point = buildCheckoutSessionFields({ quote: await quoteWith("inpost-point"), order: order("inpost-point", "MIL123M"), origin: "https://geardropshop.it" }, prices);
    expect(point["shipping_options[0][shipping_rate_data][fixed_amount][amount]"]).toBe(565);
    expect(point["metadata[pickup_point]"]).toBe("MIL123M");
    const poste = buildCheckoutSessionFields({ quote: await quoteWith("standard"), order: order("standard", "MIL123M"), origin: "https://geardropshop.it" }, prices);
    expect(poste["metadata[pickup_point]"]).toBeUndefined();
  });
});

describe("the paid order", () => {
  it("records the carrier and the point from the session, and nothing for older sessions", () => {
    expect(shippingChoice({ shipping_method: "inpost-point", pickup_point: " MIL123M " })).toEqual({
      method: "inpost-point", methodLabel: "InPost · punto di ritiro o Locker", pickupPoint: "MIL123M",
    });
    expect(shippingChoice({ shipping_method: "inpost-home", pickup_point: "MIL123M" })).toEqual({ method: "inpost-home", methodLabel: "InPost · consegna a casa" });
    expect(shippingChoice({ order_ref: "GD-OLD" })).toEqual({});
    expect(shippingChoice({ shipping_method: "brt" })).toEqual({});
    expect(shippingMethodByCode("standard")?.label).toBe("Poste Italiane · consegna a casa");
  });

  const session = {
    id: "cs_live_a1B2c3D4e5F6g7H8",
    created: 1_789_560_960,
    payment_status: "paid",
    client_reference_id: "GD-INPOST",
    customer_email: "buyer@example.com",
    amount_total: 2865,
    metadata: { order_ref: "GD-INPOST", lines: "cobalt-dragoon-2-60c x1", shipping_method: "inpost-point", pickup_point: "MIL123M" },
    customer_details: { email: "buyer@example.com", phone: null, name: null, address: null },
    total_details: { amount_shipping: 565 },
    payment_intent: {
      id: "pi_live_123",
      shipping: {
        name: "Mario Rossi",
        phone: "3331234567",
        address: { line1: "Via Roma 1", line2: null, postal_code: "20121", city: "Milano", state: "MI", country: "IT" },
      },
    },
  };
  const items = [
    { description: "Cobalt Dragoon 2-60C", quantity: 1, amount_subtotal: 2300, price: { lookup_key: "gd_cobalt_dragoon_2_60c", unit_amount: 2300, product: "gd_cobalt_dragoon_2_60c" } },
  ];
  const checkout = paidCheckoutFromStripe(session, items) as PaidCheckout;

  it("keeps the choice in the shipping snapshot the order stores", () => {
    expect(checkout.shipping).toMatchObject({ method: "inpost-point", methodLabel: "InPost · punto di ritiro o Locker", pickupPoint: "MIL123M" });
    expect(checkout.shippingCents).toBe(565);
    // The panel reads it back from the stored snapshot.
    expect(shipmentChoice(checkout.shipping)).toEqual({ method: "inpost-point", label: "InPost · punto di ritiro o Locker", pickupPoint: "MIL123M" });
    expect(shipmentChoice({ name: "Old order" })).toEqual({ method: null, label: null, pickupPoint: null });
  });

  it("tells the owner and the buyer which carrier, and where to collect", () => {
    const recorded = { id: 9, orderNumber: "GD-INPOST", preorderQuantities: [0] };
    for (const email of [ownerOrderEmail(checkout, recorded), customerOrderEmail(checkout, recorded)]) {
      expect(email.text).toContain("Spedizione: InPost · punto di ritiro o Locker");
      expect(email.text).toContain("Punto InPost: MIL123M");
    }
  });
});
