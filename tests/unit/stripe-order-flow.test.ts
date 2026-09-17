import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { applyLiveStock } from "@/lib/commerce/live-stock-overlay";
import { PRODUCTS } from "@/data/catalog";
import { sendEmail, orderNotificationRecipient } from "@/lib/email/resend";
import { customerOrderEmail, ownerOrderEmail } from "@/lib/orders/order-email";
import { processPaidCheckout, type LowStockProduct, type OrderStore } from "@/lib/orders/process-paid-checkout";
import {
  paidCheckoutFromStripe,
  slugFromStripeId,
  type PaidCheckout,
  type StripeLineItemForOrder,
  type StripeSessionForOrder,
} from "@/lib/orders/stripe-order";
import { stripeSignature, verifyStripeSignature, parseStripeEvent } from "@/lib/payments/stripe-webhook";

const SECRET = "whsec_test_secret";
const NOW = 1_800_000_000;

describe("Stripe webhook signature", () => {
  const payload = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", data: { object: { id: "cs_test_abcdefghij", object: "checkout.session" } } });

  it("accepts a fresh delivery signed with the endpoint secret", () => {
    const header = `t=${NOW},v1=${stripeSignature(payload, SECRET, NOW)}`;
    expect(verifyStripeSignature(payload, header, SECRET, NOW + 10)).toBe(true);
  });

  it("accepts any matching v1 when Stripe is rolling the secret", () => {
    const header = `t=${NOW},v1=${"0".repeat(64)},v1=${stripeSignature(payload, SECRET, NOW)}`;
    expect(verifyStripeSignature(payload, header, SECRET, NOW)).toBe(true);
  });

  it("refuses a tampered body, a wrong secret, a replayed delivery and a missing header", () => {
    const header = `t=${NOW},v1=${stripeSignature(payload, SECRET, NOW)}`;
    expect(verifyStripeSignature(payload.replace("evt_1", "evt_2"), header, SECRET, NOW)).toBe(false);
    expect(verifyStripeSignature(payload, header, "whsec_other", NOW)).toBe(false);
    expect(verifyStripeSignature(payload, header, SECRET, NOW + 301)).toBe(false);
    expect(verifyStripeSignature(payload, null, SECRET, NOW)).toBe(false);
    expect(verifyStripeSignature(payload, "garbage", SECRET, NOW)).toBe(false);
  });

  it("parses only event-shaped payloads", () => {
    expect(parseStripeEvent(payload)?.type).toBe("checkout.session.completed");
    expect(parseStripeEvent("{}")).toBeNull();
    expect(parseStripeEvent("not json")).toBeNull();
  });
});

const paidSession: StripeSessionForOrder = {
  id: "cs_live_a1B2c3D4e5F6g7H8",
  created: 1_789_560_960,
  payment_status: "paid",
  client_reference_id: "GD-FL3NHC8W",
  customer_email: "buyer@example.com",
  amount_total: 3490,
  metadata: { order_ref: "GD-FL3NHC8W", lines: "glory-valkyrie-lf x1", notes: "Lasciare il pacco in veranda" },
  customer_details: { email: "buyer@example.com", phone: null, name: null, address: null },
  total_details: { amount_shipping: 490 },
  payment_intent: {
    id: "pi_live_123",
    shipping: {
      name: "Mario Rossi",
      phone: "3331234567",
      address: { line1: "Via Roma 1", line2: null, postal_code: "34148", city: "Trieste", state: "TS", country: "IT" },
    },
  },
};

const lineItems: readonly StripeLineItemForOrder[] = [
  { description: "Glory Valkerion LF", quantity: 1, amount_subtotal: 3000, price: { lookup_key: "gd_glory_valkerion_lf", unit_amount: 3000, product: "gd_glory_valkerion_lf" } },
];

describe("paid checkout mapping", () => {
  it("collects the shipping details the site sent to Stripe", () => {
    const checkout = paidCheckoutFromStripe(paidSession, lineItems);
    expect(checkout).toMatchObject({
      sessionId: "cs_live_a1B2c3D4e5F6g7H8",
      paymentIntentId: "pi_live_123",
      reference: "GD-FL3NHC8W",
      email: "buyer@example.com",
      phone: "3331234567",
      notes: "Lasciare il pacco in veranda",
      shippingCents: 490,
      totalCents: 3490,
      shipping: { name: "Mario Rossi", address: "Via Roma 1", postalCode: "34148", city: "Trieste", province: "TS", country: "IT" },
      lines: [{ slug: "glory-valkerion-lf", name: "Glory Valkerion LF", quantity: 1, unitPriceCents: 3000 }],
    });
  });

  it("ignores sessions that are not paid yet", () => {
    expect(paidCheckoutFromStripe({ ...paidSession, payment_status: "unpaid" }, lineItems)).toBeNull();
  });

  it("maps discount and promotion code from total_details", () => {
    const sessionWithDiscount: StripeSessionForOrder = {
      ...paidSession,
      amount_total: 2990,
      total_details: {
        amount_shipping: 490,
        amount_discount: 500,
        breakdown: {
          discounts: [{ discount: { promotion_code: { code: "SUMMER10" } } }],
        },
      },
    };
    const checkout = paidCheckoutFromStripe(sessionWithDiscount, lineItems);
    expect(checkout?.discountCents).toBe(500);
    expect(checkout?.couponCode).toBe("SUMMER10");
    expect(checkout?.totalCents).toBe(2990);
  });

  it("defaults discount to 0 and couponCode to null when no promo code was applied", () => {
    const checkout = paidCheckoutFromStripe(paidSession, lineItems);
    expect(checkout?.discountCents).toBe(0);
    expect(checkout?.couponCode).toBeNull();
  });

  it("expands promotion code only when total_details.breakdown is present", () => {
    const sessionNoBreakdown: StripeSessionForOrder = {
      ...paidSession,
      total_details: { amount_shipping: 490, amount_discount: 0 },
    };
    const checkout = paidCheckoutFromStripe(sessionNoBreakdown, lineItems);
    expect(checkout?.couponCode).toBeNull();
  });

  it("falls back to customer_details when payment_intent shipping is absent (recovery session)", () => {
    const recoverySession: StripeSessionForOrder = {
      ...paidSession,
      payment_intent: null,
      customer_details: {
        email: "buyer@example.com",
        phone: "3331234567",
        name: "Mario Rossi",
        address: null,
      },
    };
    const checkout = paidCheckoutFromStripe(recoverySession, lineItems);
    expect(checkout).not.toBeNull();
    expect(checkout?.shipping.name).toBe("Mario Rossi");
    // Address is empty — the owner email will warn
    expect(checkout?.shipping.address).toBe("");
    expect(checkout?.shipping.city).toBe("");
  });

  it("resolves every catalogue product from its Stripe id", () => {
    for (const product of PRODUCTS) {
      expect(slugFromStripeId(`gd_${product.slug.replaceAll("-", "_")}`)).toBe(product.slug);
    }
    expect(slugFromStripeId("gd_glory_valkyrie_lf")).toBe("glory-valkerion-lf");
    expect(slugFromStripeId("prod_unrelated")).toBeNull();
  });
});

const checkout = paidCheckoutFromStripe(paidSession, lineItems) as PaidCheckout;

function memoryStore(): OrderStore & { notified: Set<number>; records: number } {
  const orders = new Map<string, number>();
  const store = {
    notified: new Set<number>(),
    records: 0,
    async record(value: PaidCheckout) {
      store.records += 1;
      const existing = orders.get(value.sessionId);
      if (existing) return { id: existing, orderNumber: value.reference, created: false };
      orders.set(value.sessionId, 41);
      return { id: 41, orderNumber: value.reference, created: true };
    },
    async ownerNotified(id: number) {
      return store.notified.has(id);
    },
    async markOwnerNotified(id: number) {
      store.notified.add(id);
    },
  };
  return store;
}

describe("processing a paid checkout", () => {
  it("records the order and emails the owner once, however often Stripe retries", async () => {
    const store = memoryStore();
    const send = vi.fn().mockResolvedValue({ ok: true, id: "email_1" });
    const deps = { loadCheckout: async () => checkout, store, sendEmail: send, env: {} };

    const first = await processPaidCheckout(checkout.sessionId, deps);
    const retry = await processPaidCheckout(checkout.sessionId, deps);

    expect(first).toMatchObject({ status: "recorded", ownerEmail: "sent", order: { created: true } });
    expect(retry).toMatchObject({ status: "recorded", ownerEmail: "already_sent", order: { created: false } });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toMatchObject({ to: "infogeardrop@gmail.com", replyTo: "buyer@example.com", idempotencyKey: "gd-order-owner-41" });
  });

  it("fails so Stripe retries when the email provider rejects the message", async () => {
    const store = memoryStore();
    const deps = { loadCheckout: async () => checkout, store, sendEmail: async () => ({ ok: false as const, reason: "rejected" as const, detail: "500" }), env: {} };
    expect(await processPaidCheckout(checkout.sessionId, deps)).toMatchObject({ status: "failed", step: "notify" });
    expect(store.notified.size).toBe(0);
  });

  it("keeps the order when email is not configured", async () => {
    const deps = { loadCheckout: async () => checkout, store: memoryStore(), sendEmail: async () => ({ ok: false as const, reason: "not_configured" as const }), env: {} };
    expect(await processPaidCheckout(checkout.sessionId, deps)).toMatchObject({ status: "recorded", ownerEmail: "not_configured" });
  });

  it("ignores unpaid sessions and reports a failing database", async () => {
    const send = vi.fn();
    expect(await processPaidCheckout("cs_x", { loadCheckout: async () => null, store: memoryStore(), sendEmail: send, env: {} })).toEqual({ status: "ignored" });
    const broken = { ...memoryStore(), record: async () => { throw new Error("db down"); } };
    expect(await processPaidCheckout("cs_x", { loadCheckout: async () => checkout, store: broken, sendEmail: send, env: {} })).toMatchObject({ status: "failed", step: "record", detail: "db down" });
    expect(send).not.toHaveBeenCalled();
  });

  it("emails the buyer only when customer emails are switched on", async () => {
    const send = vi.fn().mockResolvedValue({ ok: true, id: "email" });
    await processPaidCheckout(checkout.sessionId, { loadCheckout: async () => checkout, store: memoryStore(), sendEmail: send, env: {} });
    expect(send).toHaveBeenCalledTimes(1);

    send.mockClear();
    await processPaidCheckout(checkout.sessionId, { loadCheckout: async () => checkout, store: memoryStore(), sendEmail: send, env: { ORDER_CUSTOMER_EMAILS: "true" } });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]?.[0]).toMatchObject({ to: "buyer@example.com", replyTo: "infogeardrop@gmail.com" });
  });

  it("passes low-stock items to the owner email when the store provides them", async () => {
    const lowItems: readonly LowStockProduct[] = [
      { name: "Glory Valkerion LF", slug: "glory-valkerion-lf", stockQuantity: 0, stockStatus: "pre-ordine" },
    ];
    const store: OrderStore = {
      ...memoryStore(),
      async lowStock() { return lowItems; },
    };
    const captured: string[] = [];
    const send = vi.fn().mockImplementation(async (msg: Record<string, unknown>) => {
      captured.push(String(msg["html"] ?? ""));
      return { ok: true as const, id: "email" };
    });
    await processPaidCheckout(checkout.sessionId, { loadCheckout: async () => checkout, store, sendEmail: send as never, env: {} });
    expect(captured[0]).toContain("Scorte basse");
    expect(captured[0]).toContain("Glory Valkerion LF — finito, ora in pre-ordine");
  });

  it("proceeds normally when the low-stock check throws", async () => {
    const store: OrderStore = {
      ...memoryStore(),
      async lowStock() { throw new Error("db unreachable"); },
    };
    const send = vi.fn().mockResolvedValue({ ok: true, id: "email" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await processPaidCheckout(checkout.sessionId, { loadCheckout: async () => checkout, store, sendEmail: send, env: {} });
    expect(result).toMatchObject({ status: "recorded", ownerEmail: "sent" });
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("order emails", () => {
  it("gives the owner everything needed to ship", () => {
    const email = ownerOrderEmail(checkout, { id: 41, orderNumber: "GD-FL3NHC8W" });
    expect(email.subject).toBe("Nuovo ordine GD-FL3NHC8W · €34,90 · Mario Rossi");
    for (const part of ["Mario Rossi", "Via Roma 1", "34148 Trieste (TS)", "3331234567", "buyer@example.com", "Lasciare il pacco in veranda", "Glory Valkerion LF", "€34,90", "https://geardropshop.it/admin/ordini/41", "https://dashboard.stripe.com/payments/pi_live_123"]) {
      expect(email.html).toContain(part);
      expect(email.text).toContain(part);
    }
  });

  it("shows the discount and promotion code in the totals", () => {
    const discountCheckout: PaidCheckout = { ...checkout, discountCents: 500, couponCode: "SUMMER10", totalCents: 2990 };
    const email = ownerOrderEmail(discountCheckout, { id: 42, orderNumber: "GD-DISC" });
    expect(email.html).toContain("Sconto (SUMMER10)");
    expect(email.html).toContain("-€5,00");
    expect(email.text).toContain("Sconto (SUMMER10): -€5,00");
    expect(email.html).toContain("€29,90");
    // Buyer email also shows discount
    const buyer = customerOrderEmail(discountCheckout, { id: 42, orderNumber: "GD-DISC" });
    expect(buyer.html).toContain("Sconto (SUMMER10)");
    expect(buyer.html).toContain("-€5,00");
  });

  it("shows a clear warning when the shipping address is missing", () => {
    const noAddress: PaidCheckout = {
      ...checkout,
      shipping: { name: "Mario Rossi", address: "", postalCode: "", city: "", province: "", country: "IT" },
    };
    const email = ownerOrderEmail(noAddress, { id: 43, orderNumber: "GD-NOAD" });
    expect(email.html).toContain("Indirizzo di spedizione mancante: contatta il cliente");
    expect(email.text).toContain("Indirizzo di spedizione mancante");
  });

  it("includes a low-stock alert box when products are running low", () => {
    const lowStock = [
      { name: "Glory Valkerion LF", slug: "glory-valkerion-lf", stockQuantity: 1, stockStatus: "disponibile" },
      { name: "Cobalt Dragoon", slug: "cobalt-dragoon", stockQuantity: 0, stockStatus: "pre-ordine" },
    ];
    const email = ownerOrderEmail(checkout, { id: 44, orderNumber: "GD-LOWST" }, lowStock);
    expect(email.html).toContain("Scorte basse");
    expect(email.html).toContain("Glory Valkerion LF — ne resta 1");
    expect(email.html).toContain("Cobalt Dragoon — finito, ora in pre-ordine");
    expect(email.text).toContain("SCORTE BASSE");
    expect(email.text).toContain("Glory Valkerion LF: ne resta 1");
    expect(email.text).toContain("Cobalt Dragoon: finito, ora in pre-ordine");
  });

  it("does not show low-stock box when all products have enough stock", () => {
    const email = ownerOrderEmail(checkout, { id: 45, orderNumber: "GD-OK" }, []);
    expect(email.html).not.toContain("Scorte basse");
    expect(email.text).not.toContain("SCORTE BASSE");
  });

  it("escapes buyer-written text", () => {
    const hostile = { ...checkout, notes: "<script>alert(1)</script>" };
    expect(ownerOrderEmail(hostile, { id: 1, orderNumber: "GD-1" }).html).not.toContain("<script>");
    expect(customerOrderEmail(hostile, { id: 1, orderNumber: "GD-1" }).html).toContain("infogeardrop@gmail.com");
  });
});

describe("Resend client", () => {
  it("posts the message with the key, sender and idempotency key", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "re_1" }), { status: 200 }));
    const result = await sendEmail(
      { to: "infogeardrop@gmail.com", subject: "S", html: "<p>H</p>", text: "H", replyTo: "b@example.com", idempotencyKey: "k1" },
      { RESEND_API_KEY: "re_key" },
      fetcher,
    );
    expect(result).toEqual({ ok: true, id: "re_1" });
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer re_key");
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("k1");
    expect(JSON.parse(String(init.body))).toMatchObject({ from: "GEAR//DROP Ordini <onboarding@resend.dev>", to: ["infogeardrop@gmail.com"], reply_to: "b@example.com" });
  });

  it("reports a missing key or a rejection without throwing", async () => {
    expect(await sendEmail({ to: "a@b.it", subject: "s", html: "h", text: "t" }, {})).toEqual({ ok: false, reason: "not_configured" });
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "domain not verified" }), { status: 403 }));
    expect(await sendEmail({ to: "a@b.it", subject: "s", html: "h", text: "t" }, { RESEND_API_KEY: "k" }, fetcher)).toMatchObject({ ok: false, reason: "rejected" });
    expect(orderNotificationRecipient({})).toBe("infogeardrop@gmail.com");
  });
});

describe("live stock", () => {
  it("shows the database's stock and sells out at zero", () => {
    const glory = PRODUCTS.find((product) => product.slug === "glory-valkerion-lf")!;
    const [live] = applyLiveStock([glory], [
      { slug: "glory-valkerion-lf", stock_status: "esaurito", stock_quantity: 0, preorder_allocation: 0, availability_override: null },
    ]);
    expect(live).toMatchObject({ stock: "esaurito", availableQuantity: 0, name: glory.name, price: glory.price });
  });

  it("keeps catalogue values for products the database does not have", () => {
    expect(applyLiveStock(PRODUCTS, [])).toEqual(PRODUCTS);
  });
});

describe("record_stripe_checkout_order migration", () => {
  const migration = readFileSync(join(process.cwd(), "supabase/migrations/20260916170000_record_stripe_checkout_orders.sql"), "utf8");

  it("is callable by the server's secret key only", () => {
    expect(migration).toMatch(/revoke all on function public\.record_stripe_checkout_order\([^)]*\)\s+from public, anon, authenticated;/);
    expect(migration).toMatch(/grant execute on function public\.record_stripe_checkout_order\([^)]*\)\s+to service_role;/);
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
  });

  it("is idempotent per session and never pushes stock below zero", () => {
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("where orders.stripe_checkout_session_id = p_session_id");
    expect(migration).toContain("greatest(on_hand - line.quantity, 0)");
  });
});

describe("discount migration (20260917161000)", () => {
  const migration = readFileSync(join(process.cwd(), "supabase/migrations/20260917161000_record_stripe_discounts.sql"), "utf8");

  it("drops the old 9-arg function and creates the new 11-arg version", () => {
    expect(migration).toContain("drop function if exists public.record_stripe_checkout_order(");
    expect(migration).toContain("p_discount_cents integer default 0");
    expect(migration).toContain("p_coupon_code text default null");
  });

  it("clamps the discount so total_cents is never negative", () => {
    expect(migration).toContain("least(greatest(p_discount_cents, 0), subtotal)");
    expect(migration).toContain("subtotal - discount_clamped + p_shipping_cents");
  });

  it("records the coupon code and includes discount in the audit after_state", () => {
    expect(migration).toContain("coupon_code, notes");
    expect(migration).toContain("'coupon_code'");
    expect(migration).toContain("'discount_cents'");
  });

  it("is callable by the server's secret key only and runs as security definer", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toMatch(/revoke all on function public\.record_stripe_checkout_order\(text, text, text, text, text, jsonb, jsonb, integer, text, integer, text\)\s+from public, anon, authenticated;/);
    expect(migration).toMatch(/grant execute on function public\.record_stripe_checkout_order\(text, text, text, text, text, jsonb, jsonb, integer, text, integer, text\)\s+to service_role;/);
  });
});
