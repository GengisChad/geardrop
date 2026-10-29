import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FreeShippingMeter } from "@/components/cart/cart-summary";
import { FreeShippingLine } from "@/components/cart/toast-free-shipping";
import { METER_TEETH, TOOTH_STAGGER_MS, meterTeeth, shippingLine, toothDelay } from "@/lib/commerce/free-shipping-meter";
import type { CartQuote, CartTotals } from "@/lib/commerce/types";

const THRESHOLD = 10000;
const eur = (amount: number) => ({ amount, currency: "EUR" as const });

/** Totals as the providers compute them: the threshold is measured on subtotal minus discount. */
function totals(subtotal: number, discount = 0): CartTotals {
  const paid = subtotal - discount;
  const free = subtotal === 0 || paid >= THRESHOLD;
  return {
    subtotal: eur(subtotal),
    discount: eur(discount),
    shipping: eur(free ? 0 : 490),
    total: eur(paid + (free ? 0 : 490)),
    freeShippingRemaining: free ? 0 : THRESHOLD - paid,
  };
}

function quote(subtotal: number, discount = 0, threshold: number | null = THRESHOLD): CartQuote {
  return { totals: totals(subtotal, discount), freeShippingThreshold: threshold } as unknown as CartQuote;
}

const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("meterTeeth", () => {
  it("lights one tooth for every twentieth of the threshold the buyer pays", () => {
    expect(METER_TEETH).toBe(20);
    expect(meterTeeth(0, THRESHOLD)).toBe(0);
    expect(meterTeeth(499, THRESHOLD)).toBe(0);
    expect(meterTeeth(500, THRESHOLD)).toBe(1);
    expect(meterTeeth(2490, THRESHOLD)).toBe(4);
    expect(meterTeeth(9999, THRESHOLD)).toBe(19);
    expect(meterTeeth(10000, THRESHOLD)).toBe(20);
    expect(meterTeeth(12345, THRESHOLD)).toBe(20);
  });

  it("lights nothing without a threshold or for a negative amount", () => {
    expect(meterTeeth(5000, 0)).toBe(0);
    expect(meterTeeth(5000, null)).toBe(0);
    expect(meterTeeth(-300, THRESHOLD)).toBe(0);
  });
});

describe("toothDelay", () => {
  it("staggers only the teeth lit since the previous count", () => {
    expect([3, 4, 5, 6, 7, 8].map((index) => toothDelay(index, 4, 8))).toEqual([
      null,
      0,
      TOOTH_STAGGER_MS,
      2 * TOOTH_STAGGER_MS,
      3 * TOOTH_STAGGER_MS,
      null,
    ]);
  });

  it("animates nothing when the count stays or drops", () => {
    expect([0, 3, 5].map((index) => toothDelay(index, 6, 6))).toEqual([null, null, null]);
    expect([0, 3, 5].map((index) => toothDelay(index, 8, 4))).toEqual([null, null, null]);
  });
});

describe("shippingLine", () => {
  it("waits for the server before saying anything about the cart", () => {
    expect(shippingLine(null, false)).toEqual({ kind: "pending" });
    expect(shippingLine(quote(2490), true)).toEqual({ kind: "pending" });
  });

  it("says nothing about free shipping when the backend sells none, or nothing is priced", () => {
    expect(shippingLine(quote(2490, 0, null), false)).toEqual({ kind: "none" });
    expect(shippingLine(quote(0), false)).toEqual({ kind: "none" });
  });

  it("reports what is still missing, on the amount after discounts", () => {
    expect(shippingLine(quote(2490), false)).toEqual({ kind: "remaining", remaining: 7510, teeth: 4 });
    expect(shippingLine(quote(10500, 1000), false)).toEqual({ kind: "remaining", remaining: 500, teeth: 19 });
  });

  it("reports the threshold as reached", () => {
    expect(shippingLine(quote(10490), false)).toEqual({ kind: "unlocked", teeth: METER_TEETH });
  });
});

describe("FreeShippingMeter", () => {
  it("is twenty teeth, lit for what the buyer pays, with today's copy", () => {
    const html = renderToStaticMarkup(<FreeShippingMeter totals={totals(2490)} threshold={THRESHOLD} />);
    expect(count(html, 'data-tooth=""')).toBe(METER_TEETH);
    expect(count(html, 'data-lit="true"')).toBe(4);
    expect(html).toContain("Ancora");
    expect(html).toContain("€75,10");
    expect(html).toContain("e la spedizione è gratis.");
    expect(html).not.toContain("Spedizione gratis</span>");
    // The first paint is at rest: nothing is staggered before the quote changes.
    expect(html).not.toContain("animation-delay");
  });

  it("turns green and shows the sticker once the threshold is met", () => {
    const html = renderToStaticMarkup(<FreeShippingMeter totals={totals(10490)} threshold={THRESHOLD} />);
    expect(count(html, 'data-lit="true"')).toBe(METER_TEETH);
    expect(html).toContain('data-reached="true"');
    expect(html).toContain("Spedizione gratuita sbloccata.");
    expect(html).toContain("Spedizione gratis");
  });

  it("is not shown by a shop with no free-shipping tier", () => {
    expect(renderToStaticMarkup(<FreeShippingMeter totals={totals(2490)} threshold={null} />)).toBe("");
  });
});

describe("FreeShippingLine", () => {
  it("keeps today's line until the quote answers", () => {
    const html = renderToStaticMarkup(<FreeShippingLine line={{ kind: "pending" }} />);
    expect(html).toMatch(/spedizione gratis da €100/i);
    expect(html).not.toContain("data-tooth");
  });

  it("disappears when there is no free shipping to promise", () => {
    expect(renderToStaticMarkup(<FreeShippingLine line={{ kind: "none" }} />)).toBe("");
  });

  it("says how much is missing over a mini rail", () => {
    const html = renderToStaticMarkup(<FreeShippingLine line={{ kind: "remaining", remaining: 7510, teeth: 4 }} />);
    expect(html).toContain("Ancora");
    expect(html).toContain("€75,10");
    expect(html).toContain("per la spedizione gratis");
    expect(count(html, 'data-tooth=""')).toBe(METER_TEETH);
    expect(count(html, 'data-lit="true"')).toBe(4);
  });

  it("celebrates the unlocked threshold", () => {
    const html = renderToStaticMarkup(<FreeShippingLine line={{ kind: "unlocked", teeth: METER_TEETH }} />);
    expect(html).toContain("Spedizione gratuita sbloccata");
    expect(count(html, 'data-lit="true"')).toBe(METER_TEETH);
  });
});
