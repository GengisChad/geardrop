import { describe, expect, it } from "vitest";
import { checkoutSchema } from "@/lib/checkout-schema";

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
  paymentMethod: "paypalme",
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

  it("rejects an unknown shipping or payment method", () => {
    expect(checkoutSchema.safeParse({ ...valid, shippingMethod: "drone" }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...valid, paymentMethod: "bitcoin" }).success).toBe(false);
  });

  it("treats notes as optional but caps their length", () => {
    expect(checkoutSchema.safeParse(valid).success).toBe(true);
    expect(checkoutSchema.safeParse({ ...valid, notes: "a".repeat(301) }).success).toBe(false);
  });
});
