import { describe, expect, it } from "vitest";
import {
  CHECKOUT_FALLBACK_MESSAGE,
  CHECKOUT_UNAVAILABLE,
  checkoutErrorCode,
  checkoutErrorMessage,
} from "@/lib/commerce/checkout-errors";

describe("checkout error vocabulary", () => {
  it("reads the domain code out of a PostgREST error", () => {
    expect(checkoutErrorCode({ message: "GD_ORDER_INTAKE_DISABLED", code: "55000" })).toBe(
      "GD_ORDER_INTAKE_DISABLED",
    );
  });

  it("finds the code even when the driver wraps it in prose", () => {
    const error = { message: 'failed to run RPC: GD_PRICING_PRODUCT_UNAVAILABLE (SQLSTATE P0001)' };

    expect(checkoutErrorCode(error)).toBe("GD_PRICING_PRODUCT_UNAVAILABLE");
  });

  it("falls back to details and hint when the message carries nothing", () => {
    expect(checkoutErrorCode({ message: "error", details: "GD_ORDER_QUANTITY_LIMIT" })).toBe(
      "GD_ORDER_QUANTITY_LIMIT",
    );
    expect(checkoutErrorCode({ message: "error", hint: "GD_PRICING_COUPON_INVALID" })).toBe(
      "GD_PRICING_COUPON_INVALID",
    );
  });

  it("reports no code for unrelated failures", () => {
    expect(checkoutErrorCode(new Error("fetch failed"))).toBeNull();
    expect(checkoutErrorCode(null)).toBeNull();
    expect(checkoutErrorCode(undefined)).toBeNull();
    expect(checkoutErrorCode(42)).toBeNull();
  });

  it("translates every mapped code into Italian", () => {
    const cases: readonly [string, string][] = [
      ["GD_ORDER_INTAKE_DISABLED", "Gli ordini non sono ancora attivi"],
      ["GD_ORDER_INVALID_QUANTITY", "quantità"],
      ["GD_ORDER_QUANTITY_LIMIT", "quantità massima"],
      ["GD_PRICING_PRODUCT_UNAVAILABLE", "non è più disponibile"],
      ["GD_PRICING_SHIPPING_INVALID", "spedizione"],
      ["GD_PRICING_COUPON_INVALID", "codice sconto"],
      [CHECKOUT_UNAVAILABLE, "Gli ordini non sono ancora attivi"],
    ];

    for (const [code, fragment] of cases) {
      expect(checkoutErrorMessage({ message: code })).toContain(fragment);
    }
  });

  it("never leaks an unmapped failure", () => {
    expect(checkoutErrorMessage({ message: 'relation "public.orders" does not exist' })).toBe(
      CHECKOUT_FALLBACK_MESSAGE,
    );
    expect(checkoutErrorMessage({ message: "GD_SOMETHING_NEW" })).toBe(CHECKOUT_FALLBACK_MESSAGE);
    expect(checkoutErrorMessage(new Error("ECONNREFUSED 127.0.0.1:54321"))).toBe(
      CHECKOUT_FALLBACK_MESSAGE,
    );
  });

  it("keeps SQL identifiers out of every message it can produce", () => {
    const codes = [
      "GD_ORDER_INTAKE_DISABLED",
      "GD_ORDER_INVALID_PAYLOAD",
      "GD_ORDER_INVALID_QUANTITY",
      "GD_ORDER_QUANTITY_LIMIT",
      "GD_PRICING_INVALID_LINES",
      "GD_PRICING_PRODUCT_UNAVAILABLE",
      "GD_PRICING_SHIPPING_INVALID",
      "GD_PRICING_COUPON_INVALID",
      "GD_PRICING_TOTAL_TOO_LARGE",
      "GD_PRICING_CUSTOMER_MISMATCH",
    ];

    for (const code of codes) {
      const message = checkoutErrorMessage({ message: code });
      expect(message).not.toMatch(/GD_|select |public\.|SQLSTATE/i);
    }
  });
});
