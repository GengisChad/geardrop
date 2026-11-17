/**
 * Unit tests for the richer desktop PDP additions (owner, 2026-10-12):
 *   - DeliverySummary: prices derived from SHIPPING_METHODS constants
 *   - Box-contents inline block: renders product.boxContents
 */

import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { DeliverySummary } from "@/components/product/delivery-summary";
import { Providers } from "@/components/providers";
import {
  BULKY_SHIPPING_METHOD,
  BUNDLES,
  PARTNER_SHIPPING_METHOD,
  SHIPPING_METHODS,
  FREE_SHIPPING_THRESHOLD,
  shippingMethodByCode,
} from "@/data/catalog";
import { PRODUCTS } from "@/data/catalog";
import { formatPrice } from "@/lib/format";

/** Strip trailing ",00" the way eur() in delivery-summary does. */
const eur = (cents: number) => formatPrice({ amount: cents, currency: "EUR" }).replace(/,00$/, "");

// InPost only (owner, 2026-10-23): a small item ships with the Locker 4,90; a stadium box, which no
// Locker takes, with Poste to the door 6,65. The Poste punto di ritiro 5,65 is retired.
const locker = SHIPPING_METHODS.find((m) => m.code === "inpost-locker")!;
const poste = BULKY_SHIPPING_METHOD;
const retiredPoint = shippingMethodByCode("poste-point")!;
const STADIUM_NOTE = "La scatola dello stadio non entra nei Locker InPost: arriva a casa";

// A plain in-stock Hasbro product.
const hasbro = PRODUCTS.find((p) => !p.consignment && p.stock === "disponibile")!;

// A Takara consignment product.
const consignment = PRODUCTS.find((p) => p.consignment)!;

// A pre-order product (release).
const releasePreorder = PRODUCTS.find((p) => p.releasePreorder)!;

// A stadium box, and a kit that holds one: neither fits an InPost Locker.
const stadium = PRODUCTS.find((p) => p.slug === "drop-attack-battle-set")!;
const stadiumKit = BUNDLES.find((p) => p.slug === "kit-arena-sneak-completo")!;

describe("DeliverySummary — Hasbro in-stock", () => {
  let html: string;

  beforeAll(() => {
    html = renderToStaticMarkup(
      <Providers>
        <DeliverySummary product={hasbro} />
      </Providers>,
    );
  });

  it("shows the InPost Locker price from SHIPPING_METHODS", () => {
    expect(html).toContain(locker.label);
    expect(html).toContain(eur(locker.priceCents));
  });

  it("offers the Locker alone: no Poste punto di ritiro, no Poste to the door (2026-10-23: InPost only)", () => {
    expect(html).not.toContain(retiredPoint.label);
    expect(html).not.toContain(poste.label);
    expect(html).not.toContain(eur(poste.priceCents));
    expect(html).not.toContain(STADIUM_NOTE);
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
    expect(render(hasbro)).toContain("Pagamento sicuro su Stripe: carta, PayPal, Apple Pay, Google Pay");
    expect(render(consignment)).toContain("Pagamento sicuro su Stripe: carta, PayPal, Apple Pay, Google Pay");
  });

  it("gives a pre-order its shipping prices, leaving the wait to the status panel above", () => {
    const html = render(releasePreorder);
    expect(html).not.toContain("uscita Hasbro");
    expect(html).toContain(locker.label);
    expect(html).toContain(eur(locker.priceCents));
  });

  it("promises no 30-day return on a partner piece", () => {
    expect(render(consignment)).not.toContain("30 giorni");
  });
});

// Added 2026-10-23: the stadium box (45x45x15 cm) does not fit the largest InPost Locker, so its
// page quotes Poste to the door and says why.
describe("DeliverySummary — stadium box (no Locker takes it)", () => {
  const render = (product: (typeof PRODUCTS)[number]) =>
    renderToStaticMarkup(
      <Providers>
        <DeliverySummary product={product} />
      </Providers>,
    );

  it("quotes Poste to the door instead of the Locker", () => {
    const html = render(stadium);
    expect(html).toContain(poste.label);
    expect(html).toContain(eur(poste.priceCents));
    expect(html).not.toContain(locker.label);
    expect(html).not.toContain(eur(locker.priceCents));
  });

  it("tells the buyer the box does not fit a Locker and arrives at home", () => {
    expect(render(stadium)).toContain(STADIUM_NOTE);
  });

  it("does the same for a kit that holds a stadium", () => {
    const html = render(stadiumKit);
    expect(html).toContain(poste.label);
    expect(html).toContain(STADIUM_NOTE);
    expect(html).not.toContain(locker.label);
  });

  it("still shows the free-shipping threshold, the returns and the payment rows", () => {
    const html = render(stadium);
    expect(html).toContain(eur(FREE_SHIPPING_THRESHOLD));
    expect(html).toContain("30 giorni");
    expect(html).toContain("Pagamento sicuro su Stripe");
  });
});
