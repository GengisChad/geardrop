import { describe, expect, it } from "vitest";
import { cartQuoteSchema, checkoutSchema, placeOrderSchema } from "@/lib/checkout-schema";

const valid = {
  email: "mario.rossi@email.it",
  firstName: "Mario",
  lastName: "Rossi",
  address: "Via Roma 1",
  city: "Milano",
  postalCode: "20121",
  province: "mi",
  phone: "+39 333 1234567",
  shippingMethod: "standard",
} as const;

const validOrder = {
  contact: valid,
  lines: [{ slug: "wizard-arrow-4-80b", quantity: 2 }],
  idempotencyKey: "3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607",
} as const;

describe("checkoutSchema", () => {
  it("accepts a well-formed Italian address", () => {
    expect(checkoutSchema.safeParse(valid).success).toBe(true);
  });

  it("upper-cases the province, so 'mi' and 'MI' both work", () => {
    const parsed = checkoutSchema.parse(valid);
    expect(parsed.province).toBe("MI");
  });

  it("rejects a malformed email", () => {
    expect(checkoutSchema.safeParse({ ...valid, email: "mario@" }).success).toBe(false);
  });

  it("requires a 5-digit CAP", () => {
    expect(checkoutSchema.safeParse({ ...valid, postalCode: "2012" }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...valid, postalCode: "201211" }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...valid, postalCode: "2012A" }).success).toBe(false);
  });

  it("requires a 2-letter province", () => {
    expect(checkoutSchema.safeParse({ ...valid, province: "MIL" }).success).toBe(false);
  });

  it("accepts phone numbers with spaces, dots and a +39 prefix", () => {
    for (const phone of ["+39 333 1234567", "333.123.4567", "02 1234567", "(02) 1234567"]) {
      expect(checkoutSchema.safeParse({ ...valid, phone }).success, phone).toBe(true);
    }
  });

  it("rejects a phone number with too few digits or letters", () => {
    expect(checkoutSchema.safeParse({ ...valid, phone: "12345" }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...valid, phone: "chiamami" }).success).toBe(false);
  });

  it("trims whitespace-only names rather than accepting them", () => {
    expect(checkoutSchema.safeParse({ ...valid, firstName: "   " }).success).toBe(false);
  });

  it("accepts any well-formed shipping code, because the backend owns the list", () => {
    // The set of methods is whatever the shop currently sells. Freezing it in an enum
    // here is what let the UI offer an "express" option the database had never heard of.
    expect(checkoutSchema.safeParse({ ...valid, shippingMethod: "corriere-espresso" }).success).toBe(true);
  });

  it("rejects a malformed shipping code", () => {
    for (const shippingMethod of ["", "  ", "STANDARD", "drone express", "a".repeat(65)]) {
      expect(checkoutSchema.safeParse({ ...valid, shippingMethod }).success, shippingMethod).toBe(false);
    }
  });

  it("carries no payment method, because no gateway is integrated", () => {
    const parsed = checkoutSchema.parse({ ...valid, paymentMethod: "carta" });
    expect(parsed).not.toHaveProperty("paymentMethod");
  });

  it("treats notes as optional but caps their length", () => {
    expect(checkoutSchema.safeParse(valid).success).toBe(true);
    expect(checkoutSchema.safeParse({ ...valid, notes: "a".repeat(301) }).success).toBe(false);
  });
});

describe("placeOrderSchema", () => {
  it("accepts a minimal order payload", () => {
    expect(placeOrderSchema.safeParse(validOrder).success).toBe(true);
  });

  it("strips every amount the browser tries to send", () => {
    // This is the contract that makes client-side prices unable to influence a charge:
    // whatever the browser attaches, none of it survives parsing.
    const parsed = placeOrderSchema.parse({
      ...validOrder,
      total: 1,
      subtotalCents: 1,
      lines: [{ slug: "wizard-arrow-4-80b", quantity: 2, unitPriceCents: 1, lineTotalCents: 2 }],
      contact: { ...valid, customerId: "00000000-0000-0000-0000-000000000001" },
    });

    expect(parsed).not.toHaveProperty("total");
    expect(parsed).not.toHaveProperty("subtotalCents");
    expect(parsed.contact).not.toHaveProperty("customerId");
    expect(parsed.lines[0]).toEqual({ slug: "wizard-arrow-4-80b", quantity: 2 });
  });

  it("requires a uuid idempotency key", () => {
    expect(placeOrderSchema.safeParse({ ...validOrder, idempotencyKey: "retry-1" }).success).toBe(false);
    expect(placeOrderSchema.safeParse({ ...validOrder, idempotencyKey: "" }).success).toBe(false);
  });

  it("refuses an empty cart", () => {
    expect(placeOrderSchema.safeParse({ ...validOrder, lines: [] }).success).toBe(false);
  });

  it("refuses quantities the cart could never hold", () => {
    for (const quantity of [0, -1, 1.5, 11]) {
      const payload = { ...validOrder, lines: [{ slug: "wizard-arrow-4-80b", quantity }] };
      expect(placeOrderSchema.safeParse(payload).success, String(quantity)).toBe(false);
    }
  });

  it("refuses a malformed slug", () => {
    for (const slug of ["", "Wizard Arrow", "../../etc/passwd", "a".repeat(121)]) {
      const payload = { ...validOrder, lines: [{ slug, quantity: 1 }] };
      expect(placeOrderSchema.safeParse(payload).success, slug).toBe(false);
    }
  });
});

describe("cartQuoteSchema", () => {
  it("accepts an empty cart, so an emptied cart still gets a quote", () => {
    expect(cartQuoteSchema.safeParse({ lines: [] }).success).toBe(true);
  });

  it("keeps only slugs and quantities", () => {
    const parsed = cartQuoteSchema.parse({
      lines: [{ slug: "wizard-arrow-4-80b", quantity: 1, price: 1 }],
      shippingCode: "standard",
      total: 999,
    });

    expect(parsed).not.toHaveProperty("total");
    expect(parsed.lines[0]).toEqual({ slug: "wizard-arrow-4-80b", quantity: 1 });
  });
});
