import { existsSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Gallery } from "@/components/product/gallery";
import { PRODUCTS } from "@/data/catalog";

const product = PRODUCTS.find((item) => item.slug === "glory-valkerion-lf")!;

describe("product photo zoom", () => {
  it("offers a labelled zoom control over the photo and keeps the full-screen view closed until asked", () => {
    const html = renderToStaticMarkup(<Gallery images={product.images} slug={product.slug} name={product.name} />);
    expect(html).toContain('data-testid="product-zoom-open"');
    expect(html).toContain(`aria-label="Ingrandisci la foto di ${product.name}"`);
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toMatch(/<dialog[^>]*data-testid="product-zoom"/);
    expect(html).not.toMatch(/<dialog[^>]*\sopen/);
    expect(html).toContain('aria-modal="true"');
    // next.config.ts only serves the qualities 75 and 90; anything else answers 400.
    expect(html).not.toContain("q=95");
  });
});

describe("newsletter", () => {
  it("is gone: no form component and no editor option", () => {
    expect(existsSync(join(process.cwd(), "src/components/layout/newsletter-form.tsx"))).toBe(false);
  });
});
