/**
 * Unit tests for the richer desktop PDP additions (owner, 2026-10-12):
 *   - DeliverySummary: prices derived from SHIPPING_METHODS constants
 *   - Box-contents inline block: renders product.boxContents
 */

import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { DeliverySummary } from "@/components/product/delivery-summary";
import { Providers } from "@/components/providers";
import { PARTNER_SHIPPING_METHOD, SHIPPING_METHODS, FREE_SHIPPING_THRESHOLD } from "@/data/catalog";
import { PRODUCTS } from "@/data/catalog";
import { formatPrice } from "@/lib/format";

/** Strip trailing ",00" the way eur() in delivery-summary does. */
const eur = (cents: number) => formatPrice({ amount: cents, currency: "EUR" }).replace(/,00$/, "");

const inpost = SHIPPING_METHODS.find((m) => m.code === "inpost-point")!;
const poste = SHIPPING_METHODS.find((m) => m.code === "standard")!;

// A plain in-stock Hasbro product.
const hasbro = PRODUCTS.find((p) => !p.consignment && p.stock === "disponibile")!;

// A Takara consignment product.
const consignment = PRODUCTS.find((p) => p.consignment)!;

// A pre-order product (release).
const releasePreorder = PRODUCTS.find((p) => p.releasePreorder)!;

describe("DeliverySummary — Hasbro in-stock", () => {
  let html: string;

  beforeAll(() => {
    html = renderToStaticMarkup(
      <Providers>
        <DeliverySummary product={hasbro} />
      </Providers>,
    );
  });

  it("shows the InPost price from SHIPPING_METHODS", () => {
    expect(html).toContain(inpost.label);
    expect(html).toContain(eur(inpost.priceCents));
  });

  it("shows the Poste price from SHIPPING_METHODS", () => {
    expect(html).toContain(poste.label);
    expect(html).toContain(eur(poste.priceCents));
  });

  it("shows the free-shipping threshold from FREE_SHIPPING_THRESHOLD", () => {
    expect(html).toContain(eur(FREE_SHIPPING_THRESHOLD));
  });

  it("shows a 30-day return mention", () => {
    expect(html).toContain("30 giorni");
  });

  it("carries the delivery-summary testid", () => {
    expect(html).toContain('data-testid="delivery-summary"');
  });
});

describe("DeliverySummary — consignment (Takara)", () => {
  let html: string;

  beforeAll(() => {
    html = renderToStaticMarkup(
      <Providers>
        <DeliverySummary product={consignment} />
      </Providers>,
    );
  });

  it("shows the partner shipping label and price", () => {
    expect(html).toContain(PARTNER_SHIPPING_METHOD.label);
    expect(html).toContain(eur(PARTNER_SHIPPING_METHOD.priceCents));
  });

  it("mentions the partner timing", () => {
    expect(html).toContain("2-6 giorni lavorativi");
  });
});

describe("DeliverySummary — what every buyer reads next to the button", () => {
  const render = (product: (typeof PRODUCTS)[number]) =>
    renderToStaticMarkup(
      <Providers>
        <DeliverySummary product={product} />
      </Providers>,
    );

  it("says payment happens on Stripe, for shop and partner pieces alike", () => {
    expect(render(hasbro)).toContain("Pagamento sicuro sulla pagina di Stripe");
    expect(render(consignment)).toContain("Pagamento sicuro sulla pagina di Stripe");
  });

  it("gives a pre-order its shipping prices, leaving the wait to the status panel above", () => {
    const html = render(releasePreorder);
    expect(html).not.toContain("uscita Hasbro");
    expect(html).toContain(eur(inpost.priceCents));
    expect(html).toContain(eur(poste.priceCents));
  });

  it("promises no 30-day return on a partner piece", () => {
    expect(render(consignment)).not.toContain("30 giorni");
  });
});
