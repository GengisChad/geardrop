import { describe, expect, it } from "vitest";
import {
  BULKY_SHIPPING_METHOD,
  BUNDLES,
  INPOST_POINT_FINDER_URL,
  PARTNER_SHIPPING_METHOD,
  POSTE_POINT_FINDER_URL,
  PRODUCTS,
  SHIPPING_FLAT_RATE,
  SHIPPING_METHODS,
  fitsLocker,
  shippingMethodByCode,
} from "@/data/catalog";
import { checkoutFormSchema, expressCheckoutSchema, placeOrderSchema, type PlaceOrderInput } from "@/lib/checkout-schema";
import { shipmentChoice } from "@/lib/admin/orders";
import { createMockProvider } from "@/lib/commerce/mock-provider";
import type { CartQuoteRequest } from "@/lib/commerce/types";
import { customerOrderEmail, ownerOrderEmail } from "@/lib/orders/order-email";
import { paidCheckoutFromStripe, shippingChoice, type PaidCheckout } from "@/lib/orders/stripe-order";
import { buildCheckoutSessionFields, openQuoteForStripe } from "@/lib/payments/stripe-checkout";

/*
 * The owner's rules on shipping:
 * 2026-10-13: InPost Locker 4,90 € (cheapest, default), InPost punto di ritiro 5,65 €,
 *             Poste Italiane a casa 6,65 €.
 * 2026-10-14: InPost punto di ritiro (inpost-point) replaced by Poste Italiane punto di
 *             ritiro (poste-point) at the same 5,65 €. inpost-point is retired but still
 *             resolvable for historical orders.
 * 2026-10-23: InPost only. The Locker (4,90 €) is the one method offered; poste-point is
 *             retired too. Poste Italiane a casa (standard, 6,65 €) stays for the stadium boxes
 *             alone: they do not fit a Locker (BULKY_SHIPPING_METHOD).
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

const order = (shippingMethod: string, pickupPoint?: string, pickupPointId?: string): PlaceOrderInput => ({
  contact: { ...contact, shippingMethod, ...(pickupPoint ? { pickupPoint } : {}), ...(pickupPointId ? { pickupPointId } : {}) },
  lines: [{ slug: "cobalt-dragoon-2-60c", quantity: 1 }],
  idempotencyKey: "3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607",
});

const STADIUM = "sneak-attack-battle-set";
const prices = new Map([["cobalt-dragoon-2-60c", "price_cobalt"], [STADIUM, "price_sneak"]]);
const quoteWith = async (shippingCode: string, slug = "cobalt-dragoon-2-60c") =>
  openQuoteForStripe(await createMockProvider().quoteCart({ lines: [{ slug, quantity: 1 }], shippingCode } as CartQuoteRequest));

describe("the carriers", () => {
  // Updated 2026-10-23: InPost only. poste-point is retired and Poste a casa is no longer offered
  // alongside the Locker: it is the stadium boxes' method (BULKY_SHIPPING_METHOD).
  it("one method offered: the InPost Locker at 4,90 (2026-10-23: InPost only)", () => {
    expect(SHIPPING_METHODS.map((method) => [method.code, method.carrier, method.priceCents, method.pickupPoint])).toEqual([
      ["inpost-locker", "inpost", 490, true],
    ]);
    expect(INPOST_POINT_FINDER_URL).toBe("https://inpost.it/trova-un-locker");
    expect(POSTE_POINT_FINDER_URL).toBe("https://www.poste.it/cerca/index.html");
  });

  it("Poste a casa is the stadium boxes' method alone: 6,65, to the door, never offered with the Locker", () => {
    expect([BULKY_SHIPPING_METHOD.code, BULKY_SHIPPING_METHOD.carrier, BULKY_SHIPPING_METHOD.priceCents, BULKY_SHIPPING_METHOD.pickupPoint]).toEqual([
      "standard", "poste", 665, false,
    ]);
    expect(SHIPPING_METHODS.some((m) => m.code === "standard")).toBe(false);
    // Orders already placed with it still resolve.
    expect(shippingMethodByCode("standard")).toBe(BULKY_SHIPPING_METHOD);
  });

  it("only the stadium boxes, and the kits that hold one, are too big for a Locker", () => {
    for (const slug of ["drop-attack-battle-set", "sneak-attack-battle-set"]) {
      expect(fitsLocker(PRODUCTS.find((product) => product.slug === slug)!), slug).toBe(false);
    }
    for (const slug of ["kit-arena-drop-completo", "kit-arena-sneak-completo"]) {
      expect(fitsLocker(BUNDLES.find((product) => product.slug === slug)!), slug).toBe(false);
    }
    for (const slug of ["cobalt-dragoon-2-60c", "shadow-shinobi-1-80mn", "porta-deck-giallo"]) {
      expect(fitsLocker(PRODUCTS.find((product) => product.slug === slug)!), slug).toBe(true);
    }
  });

  it("inpost-point and poste-point are not offered for new orders but still resolve for historical display", () => {
    for (const code of ["inpost-point", "poste-point"]) {
      expect(SHIPPING_METHODS.some((m) => m.code === code), code).toBe(false);
    }
    // Legacy resolution via shippingMethodByCode — still returns the retired entries.
    const legacy = shippingMethodByCode("inpost-point");
    expect(legacy).toBeDefined();
    expect(legacy?.label).toBe("InPost · punto di ritiro");
    expect(legacy?.carrier).toBe("inpost");
    // Retired 2026-10-23 with the move to InPost only.
    const poste = shippingMethodByCode("poste-point");
    expect(poste).toMatchObject({ label: "Poste Italiane · punto di ritiro", carrier: "poste", priceCents: 565, pickupPoint: true });
  });

  it("the Locker is the cheapest and default method at 4,90 (owner, 2026-10-13)", () => {
    const locker = SHIPPING_METHODS[0]!;
    expect(locker.code).toBe("inpost-locker");
    expect(locker.priceCents).toBe(490);
    expect(locker.pickupPoint).toBe(true);
    // SHIPPING_FLAT_RATE is derived from the cheapest method, so banners read "da 4,90 €".
    expect(SHIPPING_FLAT_RATE).toBe(490);
  });

  it("the Locker requires a pickup point name, like the punto di ritiro", () => {
    expect(checkoutFormSchema.safeParse({ ...contact, shippingMethod: "inpost-locker" }).success).toBe(false);
    expect(checkoutFormSchema.safeParse({ ...contact, shippingMethod: "inpost-locker", pickupPoint: "  " }).success).toBe(false);
    expect(checkoutFormSchema.safeParse({ ...contact, shippingMethod: "inpost-locker", pickupPoint: "LOC001" }).success).toBe(true);
  });

  // Added 2026-10-23: InPost's own id of the Locker picked from the search is what the label is made out to.
  it("takes the InPost id of the Locker picked from the search, and refuses a malformed one", () => {
    const withId = (pickupPointId: string | undefined) =>
      checkoutFormSchema.safeParse({ ...contact, shippingMethod: "inpost-locker", pickupPoint: "Locker Roma Termini", pickupPointId });
    expect(withId("IT_ITROM44128M").success).toBe(true);
    // A Locker typed by hand has no id.
    expect(withId(undefined).success).toBe(true);
    for (const bad of ["roma", "it_itrom44128m", "IT_AB", "ITROM44128M", "IT_ITROM 44128M"]) {
      expect(withId(bad).success, bad).toBe(false);
    }
  });

  it("takes the Locker and its id from the cart for express checkout, both optional", () => {
    const express = { lines: [{ slug: "cobalt-dragoon-2-60c", quantity: 1 }], idempotencyKey: "3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607" };
    expect(expressCheckoutSchema.safeParse(express).success).toBe(true);
    const parsed = expressCheckoutSchema.safeParse({ ...express, pickupPoint: "  Locker Roma Termini ", pickupPointId: "IT_ITROM44128M" });
    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({ pickupPoint: "Locker Roma Termini", pickupPointId: "IT_ITROM44128M" });
    expect(expressCheckoutSchema.safeParse({ ...express, pickupPoint: "Locker Roma Termini", pickupPointId: "roma" }).success).toBe(false);
  });
});

describe("the checkout form", () => {
  it("asks for the pickup point for poste-point just like it did for inpost-point (both retired, still validated)", () => {
    expect(checkoutFormSchema.safeParse({ ...contact, shippingMethod: "poste-point" }).success).toBe(false);
    expect(checkoutFormSchema.safeParse({ ...contact, shippingMethod: "poste-point", pickupPoint: "  " }).success).toBe(false);
    expect(checkoutFormSchema.safeParse({ ...contact, shippingMethod: "poste-point", pickupPoint: "RM001" }).success).toBe(true);
    expect(checkoutFormSchema.safeParse({ ...contact, shippingMethod: "standard" }).success).toBe(true);
    // The server applies the same rule to the order it receives.
    expect(placeOrderSchema.safeParse(order("poste-point")).success).toBe(false);
  });
});

describe("the Stripe payment page", () => {
  // Updated 2026-10-23: a small cart pays the Locker; Poste a casa is charged only on a stadium box.
  it("names the carrier and charges its price: the Locker", async () => {
    const fields = buildCheckoutSessionFields({ quote: await quoteWith("inpost-locker"), order: order("inpost-locker"), origin: "https://geardropshop.it" }, prices);
    expect(fields["shipping_options[0][shipping_rate_data][display_name]"]).toBe("InPost · Locker");
    expect(fields["shipping_options[0][shipping_rate_data][fixed_amount][amount]"]).toBe(490);
    expect(fields["metadata[shipping_method]"]).toBe("inpost-locker");
    expect(fields["metadata[pickup_point]"]).toBeUndefined();
  });

  it("names Poste a casa and charges 6,65 for a stadium box", async () => {
    const quote = await quoteWith("standard", STADIUM);
    const fields = buildCheckoutSessionFields({ quote, order: order("standard"), origin: "https://geardropshop.it" }, prices);
    expect(fields["shipping_options[0][shipping_rate_data][display_name]"]).toBe("Poste Italiane · consegna a casa");
    expect(fields["shipping_options[0][shipping_rate_data][fixed_amount][amount]"]).toBe(665);
    expect(fields["metadata[shipping_method]"]).toBe("standard");
    expect(fields["metadata[pickup_point]"]).toBeUndefined();
  });

  it("carries the Locker the buyer named, and only for a pickup (2026-10-23: inpost-locker)", async () => {
    const point = buildCheckoutSessionFields({ quote: await quoteWith("inpost-locker"), order: order("inpost-locker", "RM001"), origin: "https://geardropshop.it" }, prices);
    expect(point["shipping_options[0][shipping_rate_data][fixed_amount][amount]"]).toBe(490);
    expect(point["metadata[pickup_point]"]).toBe("RM001");
    expect(point["metadata[pickup_point_id]"]).toBeUndefined();
    const door = buildCheckoutSessionFields({ quote: await quoteWith("standard", STADIUM), order: order("standard", "RM001"), origin: "https://geardropshop.it" }, prices);
    expect(door["metadata[pickup_point]"]).toBeUndefined();
  });

  it("carries InPost's id of the Locker next to its name (2026-10-23)", async () => {
    const fields = buildCheckoutSessionFields(
      { quote: await quoteWith("inpost-locker"), order: order("inpost-locker", "Locker Roma Termini", "IT_ITROM44128M"), origin: "https://geardropshop.it" },
      prices,
    );
    expect(fields["metadata[pickup_point]"]).toBe("Locker Roma Termini");
    expect(fields["metadata[pickup_point_id]"]).toBe("IT_ITROM44128M");
  });

  it("never reads a retired poste-point from a stale cart: the session is charged as the Locker (2026-10-23)", async () => {
    const fields = buildCheckoutSessionFields({ quote: await quoteWith("poste-point"), order: order("poste-point", "RM001"), origin: "https://geardropshop.it" }, prices);
    expect(fields["metadata[shipping_method]"]).toBe("inpost-locker");
    expect(fields["shipping_options[0][shipping_rate_data][fixed_amount][amount]"]).toBe(490);
    expect(fields["shipping_options[0][shipping_rate_data][display_name]"]).toBe("InPost · Locker");
  });
});

describe("the paid order", () => {
  it("records the carrier and the point from the session, and nothing for older sessions", () => {
    // Updated 2026-10-13: inpost-point relabelled to "InPost · punto di ritiro".
    expect(shippingChoice({ shipping_method: "inpost-point", pickup_point: " MIL123M " })).toEqual({
      method: "inpost-point", methodLabel: "InPost · punto di ritiro", pickupPoint: "MIL123M",
    });
    // inpost-home no longer exists in the catalogue; an older session that used it falls back to nothing,
    // the same as any other unrecognised code.
    expect(shippingChoice({ shipping_method: "inpost-home", pickup_point: "MIL123M" })).toEqual({});
    expect(shippingChoice({ order_ref: "GD-OLD" })).toEqual({});
    expect(shippingChoice({ shipping_method: "brt" })).toEqual({});
    expect(shippingMethodByCode("standard")?.label).toBe("Poste Italiane · consegna a casa");
    expect(shippingMethodByCode("inpost-locker")?.label).toBe("InPost · Locker");
    expect(shippingMethodByCode("inpost-point")?.label).toBe("InPost · punto di ritiro");
  });

  // Added 2026-10-23: the Locker's InPost id rides in pickup_point_id; the label is made out to it.
  it("records InPost's id of the Locker next to its name, trimmed", () => {
    expect(shippingChoice({ shipping_method: "inpost-locker", pickup_point: " Locker Roma Termini ", pickup_point_id: " IT_ITROM44128M " })).toEqual({
      method: "inpost-locker", methodLabel: "InPost · Locker", pickupPoint: "Locker Roma Termini", pickupPointId: "IT_ITROM44128M",
    });
    // A Locker typed by hand has a name and no id.
    expect(shippingChoice({ shipping_method: "inpost-locker", pickup_point: "Locker Roma Termini" })).toEqual({
      method: "inpost-locker", methodLabel: "InPost · Locker", pickupPoint: "Locker Roma Termini",
    });
  });

  it("drops an id that is not an InPost point id, rather than label a parcel to it", () => {
    for (const bad of ["roma", "it_itrom44128m", "IT_AB", "IT_ITROM 44128M", "IT_ITROM44128M; DROP", "ITROM44128M"]) {
      expect(shippingChoice({ shipping_method: "inpost-locker", pickup_point: "Locker Roma Termini", pickup_point_id: bad }), bad).toEqual({
        method: "inpost-locker", methodLabel: "InPost · Locker", pickupPoint: "Locker Roma Termini",
      });
    }
  });

  it("keeps the id only with a Locker name on an InPost method", () => {
    // An id with no name is not a pickup.
    expect(shippingChoice({ shipping_method: "inpost-locker", pickup_point_id: "IT_ITROM44128M" })).toEqual({
      method: "inpost-locker", methodLabel: "InPost · Locker",
    });
    // The partner's Poste route and a door delivery are not InPost: no InPost id.
    expect(shippingChoice({ shipping_method: PARTNER_SHIPPING_METHOD.code, pickup_point: "Punto Poste Milano", pickup_point_id: "IT_ITROM44128M" })).toEqual({
      method: PARTNER_SHIPPING_METHOD.code, methodLabel: PARTNER_SHIPPING_METHOD.label, pickupPoint: "Punto Poste Milano",
    });
    expect(shippingChoice({ shipping_method: "standard", pickup_point: "Locker Roma Termini", pickup_point_id: "IT_ITROM44128M" })).toEqual({
      method: "standard", methodLabel: "Poste Italiane · consegna a casa",
    });
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
    // The session was placed with inpost-point; the snapshot records whatever label the catalogue
    // had at order time. The new label "InPost · punto di ritiro" applies to future orders.
    expect(checkout.shipping).toMatchObject({ method: "inpost-point", methodLabel: "InPost · punto di ritiro", pickupPoint: "MIL123M" });
    // An older session has no InPost id for its point.
    expect(checkout.shipping).not.toHaveProperty("pickupPointId");
    expect(checkout.shippingCents).toBe(565);
    // The panel reads it back from the stored snapshot (updated 2026-10-23: it reads the Locker id too).
    expect(shipmentChoice(checkout.shipping)).toEqual({ method: "inpost-point", label: "InPost · punto di ritiro", pickupPoint: "MIL123M", pickupPointId: null });
    expect(shipmentChoice({ name: "Old order" })).toEqual({ method: null, label: null, pickupPoint: null, pickupPointId: null });
  });

  it("keeps the Locker and its InPost id in the snapshot, and tells the owner and the buyer where to collect (2026-10-23)", () => {
    const lockerSession = {
      ...session,
      client_reference_id: "GD-LOCKER",
      amount_total: 2790,
      metadata: { order_ref: "GD-LOCKER", lines: "cobalt-dragoon-2-60c x1", shipping_method: "inpost-locker", pickup_point: "Locker Roma Termini", pickup_point_id: "IT_ITROM44128M" },
      total_details: { amount_shipping: 490 },
    };
    const paid = paidCheckoutFromStripe(lockerSession, items) as PaidCheckout;
    expect(paid.shipping).toMatchObject({ method: "inpost-locker", methodLabel: "InPost · Locker", pickupPoint: "Locker Roma Termini", pickupPointId: "IT_ITROM44128M" });
    expect(paid.shippingCents).toBe(490);
    expect(shipmentChoice(paid.shipping)).toEqual({ method: "inpost-locker", label: "InPost · Locker", pickupPoint: "Locker Roma Termini", pickupPointId: "IT_ITROM44128M" });
    const recorded = { id: 10, orderNumber: "GD-LOCKER", preorderQuantities: [0] };
    for (const email of [ownerOrderEmail(paid, recorded), customerOrderEmail(paid, recorded)]) {
      expect(email.text).toContain("Spedizione: InPost · Locker");
      expect(email.text).toContain("Punto InPost: Locker Roma Termini");
    }
  });

  it("tells the owner and the buyer which carrier, and where to collect", () => {
    const recorded = { id: 9, orderNumber: "GD-INPOST", preorderQuantities: [0] };
    for (const email of [ownerOrderEmail(checkout, recorded), customerOrderEmail(checkout, recorded)]) {
      // Updated 2026-10-13: inpost-point relabelled; the email text reflects the current label.
      expect(email.text).toContain("Spedizione: InPost · punto di ritiro");
      expect(email.text).toContain("Punto InPost: MIL123M");
    }
  });
});

describe("what Google is told about shipping", () => {
  it("lists every carrier in the Merchant feed, at the price the checkout charges", async () => {
    const { GET } = await import("@/app/google-merchant.xml/route");
    const xml = await (await GET()).text();
    const item = (id: string) => xml.split("<item>").find((chunk) => chunk.includes(`<g:id>${id}</g:id>`)) ?? "";
    const shipping = (chunk: string) => [...chunk.matchAll(/<g:service>([^<]+)<\/g:service><g:price>([^<]+)<\/g:price>/g)].map((m) => [m[1], m[2]]);
    // Updated 2026-10-23: InPost only. A small Hasbro piece lists the Locker alone.
    expect(shipping(item("cobalt-dragoon-2-60c"))).toEqual([["InPost · Locker", "4.90 EUR"]]);
    // A stadium box fits no Locker: its offer lists Poste a casa, the method the checkout charges for it.
    expect(shipping(item("drop-attack-battle-set"))).toEqual([["Poste Italiane · consegna a casa", "6.65 EUR"]]);
    expect(shipping(item("sneak-attack-battle-set"))).toEqual([["Poste Italiane · consegna a casa", "6.65 EUR"]]);
    const items = xml.split("<item>").slice(1);
    expect(items.length).toBeGreaterThan(0);
    // Every offer lists exactly one carrier: the partner's route for Takara Tomy pieces, Poste a casa for a
    // stadium box or a kit holding one, the Locker for the rest.
    const bulky = new Set(["drop-attack-battle-set", "sneak-attack-battle-set", "kit-arena-drop-completo", "kit-arena-sneak-completo"]);
    for (const chunk of items) {
      const id = chunk.match(/<g:id>([^<]+)<\/g:id>/)?.[1] ?? "";
      const expected = chunk.includes("<g:brand>Takara Tomy</g:brand>")
        ? PARTNER_SHIPPING_METHOD.label
        : bulky.has(id)
          ? BULKY_SHIPPING_METHOD.label
          : "InPost · Locker";
      expect(shipping(chunk).map(([service]) => service), id).toEqual([expected]);
    }
    expect(items.filter((chunk) => bulky.has(chunk.match(/<g:id>([^<]+)<\/g:id>/)?.[1] ?? "")).length).toBe(bulky.size);
  }, 60_000);

  it("files every item under Battle Tops or Battle Top Accessories, never left to Google to guess", async () => {
    const { GET } = await import("@/app/google-merchant.xml/route");
    const xml = await (await GET()).text();
    const items = xml.split("<item>").slice(1);
    const category = (id: string) =>
      items.find((chunk) => chunk.includes(`<g:id>${id}</g:id>`))?.match(/<g:google_product_category>(\d+)<\/g:google_product_category>/)?.[1];
    for (const chunk of items) expect(chunk).toMatch(/<g:google_product_category>(6329|6794)<\/g:google_product_category>/);
    expect(category("soar-phoenix-9-60gf")).toBe("6329"); // a top
    expect(category("kit-arena-drop-completo")).toBe("6329"); // a kit built on tops
    expect(category("drop-attack-battle-set")).toBe("6794"); // the stadium set
    expect(category("porta-deck-giallo")).toBe("6794"); // a deck case, not a skateboard deck
  }, 60_000);
});

describe("the shipping email", () => {
  it("sends a Poste punto buyer to their point, not to their door (historical poste-point, retired 2026-10-23)", async () => {
    const { shippingNotificationEmail } = await import("@/lib/orders/shipping-email");
    const email = shippingNotificationEmail({
      orderNumber: "GD-POSTE",
      email: "buyer@example.com",
      carrier: "Poste Italiane",
      trackingCode: "123456789012",
      trackingUrl: null,
      shippingAddress: { name: "Mario Rossi", address: "Via Roma 1", postalCode: "20121", city: "Milano", province: "MI", country: "IT", method: "poste-point", pickupPoint: "RM001" },
      items: [{ name: "Cobalt Dragoon 2-60C", quantity: 1 }],
    });
    expect(email.text).toContain("Dove ritirarlo:");
    expect(email.text).toContain("Punto di ritiro Poste: RM001");
    expect(email.text).not.toContain("Via Roma 1");
  });

  it("still sends a legacy InPost pickup order to the InPost point (historical inpost-point)", async () => {
    const { shippingNotificationEmail } = await import("@/lib/orders/shipping-email");
    const email = shippingNotificationEmail({
      orderNumber: "GD-INPOST",
      email: "buyer@example.com",
      carrier: "InPost",
      trackingCode: "620000000000000000000000",
      trackingUrl: null,
      shippingAddress: { name: "Mario Rossi", address: "Via Roma 1", postalCode: "20121", city: "Milano", province: "MI", country: "IT", method: "inpost-point", pickupPoint: "MIL123M" },
      items: [{ name: "Cobalt Dragoon 2-60C", quantity: 1 }],
    });
    expect(email.text).toContain("Dove ritirarlo:");
    expect(email.text).toContain("Punto InPost o Locker: MIL123M");
    expect(email.text).not.toContain("Via Roma 1");
  });
});

describe("the withdrawal clause", () => {
  // Updated 2026-10-13: cheapest method is now InPost Locker at 4,90 €.
  it("refunds delivery up to the cheapest InPost Locker rate, as the Codice del consumo allows", async () => {
    const { LEGAL_PAGES } = await import("@/data/pages");
    const text = JSON.stringify(LEGAL_PAGES);
    expect(text).toContain("fino al costo della consegna meno cara proposta per il tuo ordine (di norma InPost Locker, 4,90 €)");
    expect(text).toContain("art. 56 del Codice del consumo");
  });
});

describe("backorder items in the Merchant feed", () => {
  it("carry the availability date Google requires, at the far end of the delay the page states", async () => {
    const { availabilityDate } = await import("@/lib/merchant-availability");
    const { GET } = await import("@/app/google-merchant.xml/route");
    // Wednesday 7 October 2026: 15 working days is Wednesday 28, 20 is Wednesday 4 November.
    const now = new Date("2026-10-07T10:00:00Z");
    expect(availabilityDate({}, now)).toBe("2026-10-28T00:00:00Z");
    expect(availabilityDate({ releasePreorder: true }, now)).toBe("2026-11-04T00:00:00Z");

    const xml = await (await GET()).text();
    const items = xml.split("<item>").slice(1);
    for (const item of items) {
      const backorder = item.includes("<g:availability>backorder</g:availability>");
      expect(item.includes("<g:availability_date>"), item.slice(0, 80)).toBe(backorder);
    }
  }, 60_000);
});

describe("product identifiers in the Merchant feed", () => {
  it("says a loose set piece or our own deck case has no barcode, and marks the shop's kits as bundles", async () => {
    const { GET } = await import("@/app/google-merchant.xml/route");
    const { BUNDLES, PRODUCTS, SOLD_WITHOUT_BARCODE } = await import("@/data/catalog");
    const xml = await (await GET()).text();
    const item = (slug: string) => xml.split("<item>").find((chunk) => chunk.includes(`<g:id>${slug}</g:id>`)) ?? "";
    for (const slug of SOLD_WITHOUT_BARCODE) expect(item(slug), slug).toContain("<g:identifier_exists>no</g:identifier_exists>");
    // A boxed Hasbro starter has a barcode: the feed must not deny it.
    const boxed = PRODUCTS.find((product) => !product.unofficial && !product.bundleOf && !SOLD_WITHOUT_BARCODE.has(product.slug))!;
    expect(item(boxed.slug)).not.toContain("identifier_exists");
    for (const bundle of BUNDLES.filter((product) => product.bundleOf)) expect(item(bundle.slug), bundle.slug).toContain("<g:is_bundle>yes</g:is_bundle>");
  }, 60_000);
});

