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
  it("offers notify instead of purchase for an explicitly sold-out product", () => {
    const html = renderToStaticMarkup(<Providers><BuyPanel product={{ ...product, stock: "esaurito", availableQuantity: 0 }} /></Providers>);
    expect(html).toContain('data-testid="notify-me"');
    expect(html).not.toContain('data-testid="add-to-cart"');
    expect(html).not.toContain('data-testid="qty-input"');
  });
  it("renders the current allocation and caps the PDP control at the lower availability", () => {
    const html = renderToStaticMarkup(
      <Providers>
        <BuyPanel product={{ ...product, availableQuantity: 3 }} />
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

    expect(html).toContain("Pre-ordini aperti");
    expect(html).toContain("Esplora il catalogo");
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

  it("distinguishes preorder dispatch from carrier transit in rendered storefront copy", () => {
    const html = renderToStaticMarkup(<Providers><BuyPanel product={product} /></Providers>);

    expect(html).toContain("entro 14 giorni dalla conferma");
    expect(html).toContain("transito del corriere");
    expect(html).not.toContain("24/48h");
  });
});
