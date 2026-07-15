import { describe, expect, it } from "vitest";
import { discountPercent, formatCount, formatPrice, formatRating, formatShipping } from "@/lib/format";

const eur = (amount: number) => ({ amount, currency: "EUR" }) as const;

describe("formatPrice", () => {
  it("uses the Italian convention from the mockups: symbol first, comma decimal", () => {
    expect(formatPrice(eur(2499))).toBe("€24,99");
    expect(formatPrice(eur(4999))).toBe("€49,99");
  });

  it("groups thousands", () => {
    expect(formatPrice(eur(123456))).toBe("€1.234,56");
  });

  it("always shows two decimals", () => {
    expect(formatPrice(eur(2500))).toBe("€25,00");
    expect(formatPrice(eur(0))).toBe("€0,00");
  });

  it("keeps cents exact where a float would drift", () => {
    // 0.1 + 0.2 in floats is 0.30000000000000004; integer cents avoid it entirely.
    expect(formatPrice(eur(10 + 20))).toBe("€0,30");
  });
});

describe("formatShipping", () => {
  it("reads free shipping as a benefit, not as a zero", () => {
    expect(formatShipping(eur(0))).toBe("Gratis");
  });

  it("formats a real charge as a price", () => {
    expect(formatShipping(eur(490))).toBe("€4,90");
  });
});

describe("formatRating", () => {
  it("uses a comma, as the mockups do", () => {
    expect(formatRating(4.8)).toBe("4,8");
    expect(formatRating(4)).toBe("4,0");
  });
});

describe("formatCount", () => {
  it("groups thousands the Italian way", () => {
    expect(formatCount(1230)).toBe("1.230");
    expect(formatCount(45)).toBe("45");
  });
});

describe("discountPercent", () => {
  it("matches the bundle figures printed in the mockup", () => {
    // "€79,99 da €99,96 −20%"
    expect(discountPercent(eur(7999), eur(9996))).toBe(20);
  });

  it("returns 0 rather than dividing by zero", () => {
    expect(discountPercent(eur(1000), eur(0))).toBe(0);
  });
});
