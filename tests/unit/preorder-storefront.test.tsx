import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HomePage from "@/app/(storefront)/page";
import ProdottoPage from "@/app/(storefront)/prodotto/[slug]/page";
import { BuyPanel } from "@/components/product/buy-panel";
import { QuantityStepper } from "@/components/product/quantity-stepper";
import { Footer } from "@/components/layout/footer";
import { Providers } from "@/components/providers";
import { PRODUCTS } from "@/data/catalog";
import type { StorefrontChrome } from "@/lib/content/types";

const product = PRODUCTS[0]!;

describe("preorder quantity presentation", () => {
  it("offers an inline restock form instead of a cart button for a sold-out product", () => {
    const html = renderToStaticMarkup(<Providers><BuyPanel product={{ ...product, stock: "esaurito", availableQuantity: 0 }} /></Providers>);
    // The restock form replaces the AddToCartButton on the PDP.
    expect(html).toContain('id="restock-form"');
    expect(html).toContain('type="email"');
    expect(html).toContain("Avvisami");
    expect(html).not.toContain('data-testid="add-to-cart"');
    expect(html).not.toContain('data-testid="notify-me"');
    expect(html).not.toContain('data-testid="qty-input"');
  });
  it("renders the current allocation and caps the PDP control at the lower availability", () => {
    const html = renderToStaticMarkup(
      <Providers>
        <BuyPanel product={{ ...product, stock: "pre-ordine", availableQuantity: 3 }} />
      </Providers>,
    );

    expect(html).toContain("3 pre-ordini rimasti");
    expect(html).toMatch(/<input[^>]*max="3"[^>]*data-testid="qty-input"/);
  });

  it("keeps an excessive persisted quantity visible while preventing an increase", () => {
    const html = renderToStaticMarkup(
      <QuantityStepper value={12} max={3} onChange={() => undefined} />,
    );

    expect(html).toMatch(/data-testid="qty-input"[^>]*value="12"/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-testid="qty-increase"/);
  });
});

describe("truthful public presentation", () => {
  it("omits zero-review rating UI and AggregateRating structured data", async () => {
    const html = renderToStaticMarkup(
      <Providers>
        {await ProdottoPage({ params: Promise.resolve({ slug: product.slug }) })}
      </Providers>,
    );

    expect(html).not.toContain("recensioni");
    expect(html).not.toContain("AggregateRating");
  });

  it("renders the neutral preorder homepage without bestseller, Club, bundle, or rating decoration", async () => {
    const html = renderToStaticMarkup(<Providers>{await HomePage()}</Providers>);

    expect(html).toContain("Disponibili ora");
    expect(html).toContain("Tutto il drop");
    expect(html).toContain("Scegli. Carica.");
    expect(html).not.toContain("Più venduti");
    expect(html).not.toContain("Scelti per il competitivo");
    expect(html).not.toContain("GEAR//DROP Club");
    expect(html).not.toContain("Bundle campione");
    expect(html).not.toContain("recensioni");
  });

  it("renders a project description in the footer without a fake newsletter success path or audience count", () => {
    const chrome: StorefrontChrome = {
      desktopNavigation: [],
      mobileNavigation: [],
      footerColumns: [],
      socialLinks: [],
    };
    const html = renderToStaticMarkup(<Footer content={chrome} />);

    expect(html).toContain("progetto indipendente");
    expect(html).not.toContain("newsletter");
    expect(html).not.toContain("45.000");
    expect(html).not.toContain("newsletter-success");
  });

  it("publishes only the seller VAT number in the footer", () => {
    const chrome: StorefrontChrome = {
      desktopNavigation: [],
      mobileNavigation: [],
      footerColumns: [],
      socialLinks: [],
    };
    const html = renderToStaticMarkup(<Footer content={chrome} />);

    expect(html).toContain("P.IVA 18464231002");
    expect(html).toContain("Alessia Brunetti");
    expect(html).not.toContain("18655971002");
    expect(html).not.toMatch(/gear sports/i);
  });

  it("tells how long a pre-order may take without promising a dispatch date", () => {
    const html = renderToStaticMarkup(<Providers><BuyPanel product={{ ...product, stock: "pre-ordine" }} /></Providers>);

    expect(html).toContain("Potrebbe arrivare tra 10/15 giorni lavorativi");
    expect(html).not.toContain("entro 14 giorni");
    expect(html).not.toContain("24/48h");
  });
});
