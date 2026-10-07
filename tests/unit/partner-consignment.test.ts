/**
 * Tests for partner consignment order handling:
 *   - partnerLines helper and owed math
 *   - partnerOrderEmail: content and data-minimisation
 *   - ownerOrderEmail: NerdPoint box
 *   - processPaidCheckout: partner email sent only when partner lines exist, idempotency key
 */
import { describe, expect, it, vi } from "vitest";
import { CONSIGNMENT_PARTNER, partnerLines } from "@/data/catalog";
import { partnerOrderEmail } from "@/lib/orders/partner-email";
import { ownerOrderEmail } from "@/lib/orders/order-email";
import { processPaidCheckout, type OrderStore } from "@/lib/orders/process-paid-checkout";
import type { PaidCheckout } from "@/lib/orders/stripe-order";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A minimal Takara Tomy consignment checkout line (slug must be a real catalogue slug). */
const TAKARA_SLUG = "cx-00-evangelion-deck-set"; // commissionCents: 500, price: 13500
const TAKARA_PRICE = 13500;
const HASBRO_SLUG = "cobalt-dragoon-2-60c";
const HASBRO_PRICE = 1199;

const baseShipping = {
  name: "Mario Rossi",
  address: "Via Roma 1",
  postalCode: "20121",
  city: "Milano",
  province: "MI",
  country: "IT",
  method: "poste-point-partner",
  methodLabel: "Poste Italiane · Punto Poste o Locker",
  pickupPoint: "MIL-LOCKER-7",
};

function makeCheckout(overrides?: Partial<PaidCheckout>): PaidCheckout {
  return {
    sessionId: "cs_test_abc",
    paymentIntentId: "pi_test_abc",
    reference: "GD-00000042",
    email: "buyer@example.com",
    phone: "+39 333 0000000",
    shipping: baseShipping,
    notes: null,
    lines: [
      { slug: TAKARA_SLUG, name: "CX-00 Evangelion Deck Set", quantity: 1, unitPriceCents: TAKARA_PRICE },
    ],
    shippingCents: 500,
    discountCents: 0,
    couponCode: null,
    totalCents: TAKARA_PRICE + 500,
    createdAt: "2026-10-07T10:00:00.000Z",
    ...overrides,
  };
}

const recorded = { id: 42, orderNumber: "GD-00000042", created: true };

// ---------------------------------------------------------------------------
// partnerLines helper
// ---------------------------------------------------------------------------

describe("partnerLines", () => {
  it("returns an empty array when there are no consignment lines", () => {
    const lines = [{ slug: HASBRO_SLUG, name: "Cobalt Dragoon 2-60C", quantity: 2, unitPriceCents: HASBRO_PRICE }];
    expect(partnerLines(lines)).toHaveLength(0);
  });

  it("picks up a consignment line and computes owed correctly", () => {
    const lines = [{ slug: TAKARA_SLUG, name: "CX-00 Evangelion Deck Set", quantity: 2, unitPriceCents: TAKARA_PRICE }];
    const result = partnerLines(lines);
    expect(result).toHaveLength(1);
    const [line] = result;
    expect(line!.commissionCents).toBe(500);
    // owed = (13500 − 500) × 2 = 26000
    expect(line!.owed).toBe(26000);
  });

  it("floors owed at 0 when commission equals or exceeds unit price", () => {
    // Inject a synthetic line with a price below the commission in catalog.
    // We can do this by passing a unitPriceCents that is 0, which is lower than any commission.
    const lines = [{ slug: TAKARA_SLUG, name: "CX-00 Evangelion Deck Set", quantity: 1, unitPriceCents: 0 }];
    const result = partnerLines(lines);
    expect(result[0]!.owed).toBe(0);
  });

  it("ignores non-consignment (Hasbro) lines and processes mixed carts correctly", () => {
    const lines = [
      { slug: HASBRO_SLUG, name: "Cobalt Dragoon", quantity: 1, unitPriceCents: HASBRO_PRICE },
      { slug: TAKARA_SLUG, name: "CX-00 Evangelion Deck Set", quantity: 1, unitPriceCents: TAKARA_PRICE },
    ];
    const result = partnerLines(lines);
    expect(result).toHaveLength(1);
    expect(result[0]!.slug).toBe(TAKARA_SLUG);
  });

  it("handles multiple consignment lines and sums owed correctly", () => {
    const TIGARAGE_SLUG = "cx-00-tigarage-ft3-60t"; // price: 10399, commission: 500
    const lines = [
      { slug: TAKARA_SLUG, name: "Evangelion", quantity: 1, unitPriceCents: TAKARA_PRICE },
      { slug: TIGARAGE_SLUG, name: "Tigarage", quantity: 2, unitPriceCents: 10399 },
    ];
    const result = partnerLines(lines);
    expect(result).toHaveLength(2);
    const totalOwed = result.reduce((sum, l) => sum + l.owed, 0);
    // evangelion: (13500-500)*1 = 13000; tigarage: (10399-500)*2 = 19798; total = 32798
    expect(totalOwed).toBe(32798);
  });
});

// ---------------------------------------------------------------------------
// partnerOrderEmail: content and data minimisation
// ---------------------------------------------------------------------------

describe("partnerOrderEmail", () => {
  it("returns null for a Hasbro-only order", () => {
    const checkout = makeCheckout({
      lines: [{ slug: HASBRO_SLUG, name: "Cobalt Dragoon", quantity: 1, unitPriceCents: HASBRO_PRICE }],
    });
    expect(partnerOrderEmail(checkout, "GD-00000099")).toBeNull();
  });

  it("addresses the partner and uses the shop as reply-to address", () => {
    const email = partnerOrderEmail(makeCheckout(), "GD-00000042");
    expect(email).not.toBeNull();
    expect(email!.to).toBe(CONSIGNMENT_PARTNER.email);
    expect(email!.subject).toContain("GD-00000042");
  });

  it("contains product name and quantity", () => {
    const email = partnerOrderEmail(makeCheckout(), "GD-00000042");
    expect(email!.text).toContain("CX-00 Evangelion Deck Set");
    expect(email!.text).toMatch(/1\s*[×x]/i);
  });

  it("contains the pickup point when the buyer chose one", () => {
    const email = partnerOrderEmail(makeCheckout(), "GD-00000042");
    expect(email!.text).toContain("MIL-LOCKER-7");
    expect(email!.text).toContain("Mario Rossi");
  });

  it("contains the street address for home delivery (no pickup point)", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { pickupPoint: _unused, ...shippingNoPoint } = baseShipping;
    const checkout = makeCheckout({ shipping: shippingNoPoint });
    const email = partnerOrderEmail(checkout, "GD-00000042");
    expect(email!.text).toContain("Via Roma 1");
    expect(email!.text).toContain("Milano");
  });

  it("includes the total owed to the partner", () => {
    const email = partnerOrderEmail(makeCheckout(), "GD-00000042");
    // owed = (13500 − 500) × 1 = 13000 → €130,00
    expect(email!.text).toMatch(/130[,.]00/);
  });

  it("does NOT contain the buyer email address", () => {
    const email = partnerOrderEmail(makeCheckout(), "GD-00000042");
    expect(email!.text).not.toContain("buyer@example.com");
    expect(email!.html).not.toContain("buyer@example.com");
  });

  it("does NOT contain Hasbro line prices or payment totals for other items", () => {
    const checkout = makeCheckout({
      lines: [
        { slug: HASBRO_SLUG, name: "Cobalt Dragoon", quantity: 1, unitPriceCents: HASBRO_PRICE },
        { slug: TAKARA_SLUG, name: "CX-00 Evangelion Deck Set", quantity: 1, unitPriceCents: TAKARA_PRICE },
      ],
    });
    const email = partnerOrderEmail(checkout, "GD-00000042");
    // The Hasbro product must not appear in the partner email
    expect(email!.text).not.toContain("Cobalt Dragoon");
    expect(email!.html).not.toContain("Cobalt Dragoon");
  });
});

// ---------------------------------------------------------------------------
// ownerOrderEmail: NerdPoint box
// ---------------------------------------------------------------------------

describe("ownerOrderEmail — NerdPoint box", () => {
  it("does NOT show a NerdPoint box for a Hasbro-only order", () => {
    const checkout = makeCheckout({
      lines: [{ slug: HASBRO_SLUG, name: "Cobalt Dragoon", quantity: 1, unitPriceCents: HASBRO_PRICE }],
    });
    const email = ownerOrderEmail(checkout, recorded);
    expect(email.text).not.toContain("NerdPoint");
    expect(email.html).not.toContain("NerdPoint");
  });

  it("shows a NerdPoint box with lines and owed when partner lines exist", () => {
    const checkout = makeCheckout();
    const email = ownerOrderEmail(checkout, recorded, [], "sent");
    expect(email.text).toContain("NerdPoint");
    expect(email.text).toContain("CX-00 Evangelion Deck Set");
    // owed = 13000 → €130,00
    expect(email.text).toMatch(/130[,.]00/);
  });

  it("reports that the partner email was sent", () => {
    const email = ownerOrderEmail(makeCheckout(), recorded, [], "sent");
    expect(email.html).toContain("Email inviata");
  });

  it("warns when the partner email failed and tells the owner to forward manually", () => {
    const email = ownerOrderEmail(makeCheckout(), recorded, [], "failed");
    expect(email.html).toContain("Email al partner NON inviata");
    expect(email.text).toContain("NON INVIATA");
  });

  it("includes the partner email address in the forward instruction when sending failed", () => {
    const email = ownerOrderEmail(makeCheckout(), recorded, [], "failed");
    expect(email.html).toContain(CONSIGNMENT_PARTNER.email);
  });
});

// ---------------------------------------------------------------------------
// processPaidCheckout: partner email lifecycle
// ---------------------------------------------------------------------------

function memoryStore(): OrderStore & { notified: Set<number> } {
  const orders = new Map<string, number>();
  const store = {
    notified: new Set<number>(),
    async record(value: PaidCheckout) {
      const existing = orders.get(value.sessionId);
      if (existing) return { id: existing, orderNumber: value.reference, created: false };
      orders.set(value.sessionId, 42);
      return { id: 42, orderNumber: value.reference, created: true };
    },
    async ownerNotified(id: number) { return store.notified.has(id); },
    async markOwnerNotified(id: number) { store.notified.add(id); },
  };
  return store;
}

describe("processPaidCheckout — partner email", () => {
  it("sends the partner email once when there are partner lines", async () => {
    const send = vi.fn().mockResolvedValue({ ok: true, id: "email_1" });
    const checkout = makeCheckout();
    const result = await processPaidCheckout(checkout.sessionId, {
      loadCheckout: async () => checkout,
      store: memoryStore(),
      sendEmail: send,
      env: {},
    });
    expect(result).toMatchObject({ status: "recorded", partnerEmail: "sent" });
    // Two emails: partner first, then owner.
    expect(send).toHaveBeenCalledTimes(2);
    // Partner email idempotency key uses the order number.
    const partnerCall = send.mock.calls.find((c) => c[0].idempotencyKey?.startsWith("gd-order-partner-"));
    expect(partnerCall).toBeDefined();
    expect(partnerCall![0].idempotencyKey).toBe(`gd-order-partner-${checkout.reference}`);
    // Replies go to the shop, never to the buyer whose address this email carries.
    expect(partnerCall![0].replyTo).toBe("infogeardrop@gmail.com");
    expect(partnerCall![0].to).toBe(CONSIGNMENT_PARTNER.email);
  });

  it("does NOT send the partner email when there are no partner lines", async () => {
    const send = vi.fn().mockResolvedValue({ ok: true, id: "email_1" });
    const checkout = makeCheckout({
      lines: [{ slug: HASBRO_SLUG, name: "Cobalt Dragoon", quantity: 1, unitPriceCents: HASBRO_PRICE }],
    });
    const result = await processPaidCheckout(checkout.sessionId, {
      loadCheckout: async () => checkout,
      store: memoryStore(),
      sendEmail: send,
      env: {},
    });
    expect(result).toMatchObject({ status: "recorded", partnerEmail: "not_applicable" });
    // Only one email: owner.
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("logs and continues (never fails the webhook) when the partner email bounces", async () => {
    const send = vi.fn()
      .mockResolvedValueOnce({ ok: false, reason: "rejected", detail: "550 mailbox not found" })
      .mockResolvedValue({ ok: true, id: "owner_email" });
    const checkout = makeCheckout();
    const result = await processPaidCheckout(checkout.sessionId, {
      loadCheckout: async () => checkout,
      store: memoryStore(),
      sendEmail: send,
      env: {},
    });
    // Webhook did not fail; owner email was still sent.
    expect(result).toMatchObject({ status: "recorded", partnerEmail: "failed", ownerEmail: "sent" });
  });

  it("owner email includes the partner-email outcome (sent vs failed)", async () => {
    // When the partner email is sent, the owner email should say so.
    const send = vi.fn().mockResolvedValue({ ok: true, id: "email" });
    await processPaidCheckout(makeCheckout().sessionId, {
      loadCheckout: async () => makeCheckout(),
      store: memoryStore(),
      sendEmail: send,
      env: {},
    });
    const ownerCall = send.mock.calls.find((c) => c[0].idempotencyKey?.startsWith("gd-order-owner-"));
    expect(ownerCall![0].html).toContain("Email inviata");
  });
});
