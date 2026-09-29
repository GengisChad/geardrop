import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BUNDLES, PRODUCTS } from "@/data/catalog";
import { cutoutSrc, productImages } from "@/data/assets";

const bySlug = new Map(PRODUCTS.map((product) => [product.slug, product]));

/** What the packs of a bundle cost when bought one by one. */
function partsTotal(bundle: (typeof BUNDLES)[number]): number {
  return (bundle.bundleOf ?? []).reduce((total, part) => {
    const product = bySlug.get(part.slug);
    expect(product, `${bundle.slug} ships ${part.slug}, which is not a product`).toBeDefined();
    return total + product!.price.amount * part.quantity;
  }, 0);
}

describe("every bundle", () => {
  it("is cheaper than its own packs, or it has no reason to exist", () => {
    for (const bundle of BUNDLES) {
      expect(bundle.bundleOf?.length, `${bundle.slug} ships nothing`).toBeGreaterThan(1);
      expect(bundle.price.amount, bundle.slug).toBeLessThan(partsTotal(bundle));
    }
  });

  it("strikes through exactly what the packs cost, never a number of its own", () => {
    for (const bundle of BUNDLES) {
      expect(bundle.compareAtPrice?.amount, bundle.slug).toBe(partsTotal(bundle));
    }
  });

  it("is tagged as the promotion it is", () => {
    for (const bundle of BUNDLES) expect(bundle.tags, bundle.slug).toContain("offerta");
  });

  it("stays out of the product database, and never promises more sets than its packs can make", () => {
    for (const bundle of BUNDLES) {
      expect(PRODUCTS.some((product) => product.slug === bundle.slug), bundle.slug).toBe(false);
      // A bundle has no shelf: live stock comes from its packs. The number it carries here is only
      // the fallback served when the database cannot be read, so it must not overstate them.
      if (bundle.availableQuantity === undefined) continue;
      const sets = Math.min(
        ...(bundle.bundleOf ?? []).map((part) =>
          Math.floor((bySlug.get(part.slug)?.availableQuantity ?? Number.POSITIVE_INFINITY) / part.quantity),
        ),
      );
      expect(bundle.availableQuantity, `${bundle.slug} falls back to more sets than its packs hold`).toBeLessThanOrEqual(sets);
    }
  });

  it("ships a packshot and its cut-out on disk", () => {
    for (const bundle of BUNDLES) {
      const images = productImages[bundle.slug as keyof typeof productImages];
      expect(images?.length, bundle.slug).toBeGreaterThan(0);
      for (const image of images!) {
        expect(existsSync(join(process.cwd(), "public", image.src)), image.src).toBe(true);
        expect(existsSync(join(process.cwd(), "public", cutoutSrc(image.src)!)), `cut-out of ${image.src}`).toBe(true);
      }
    }
  });

  it("keeps the saving it advertises in step with the prices", () => {
    for (const bundle of BUNDLES) {
      const saved = partsTotal(bundle) - bundle.price.amount;
      const claim = bundle.features.find((feature) => feature.title.startsWith("Risparmi"));
      if (!claim) continue;
      const stated = Math.round(Number(claim.title.replace(/[^\d,]/g, "").replace(",", ".")) * 100);
      expect(stated, `${bundle.slug} advertises ${claim.title}`).toBe(saved);
    }
  });
});
