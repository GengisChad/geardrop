import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cutoutSrc, impactArt, productImages, productTops } from "@/data/assets";

/**
 * The Holo Drop cards float transparent cut-outs of the packshots, the Arena spins tops
 * cropped from them and bursts with the impact artwork. Every path the storefront names has
 * to exist on disk with the size it declares, or a card silently renders a broken image.
 */

const ROOT = process.cwd();
const publicFile = (src: string) => join(ROOT, "public", src);

/** Reads the intrinsic size out of a PNG's IHDR chunk. */
function pngSize(path: string): { width: number; height: number } {
  const buffer = readFileSync(path);
  expect(buffer.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

describe("storefront artwork", () => {
  it("declares the impact burst at the size of the committed PNG", () => {
    expect(pngSize(publicFile(impactArt.src))).toEqual({ width: impactArt.width, height: impactArt.height });
  });

  it("ships a transparent cut-out for every packshot", () => {
    for (const images of Object.values(productImages)) {
      for (const image of images) {
        const cutout = cutoutSrc(image.src);
        expect(cutout, `${image.src} has no cut-out`).not.toBeNull();
        expect(existsSync(publicFile(cutout!)), `${cutout} is missing on disk`).toBe(true);
      }
    }
  });

  it("has no cut-out for an image outside the catalogue", () => {
    expect(cutoutSrc("/products/unknown.webp")).toBeNull();
  });

  it("ships every Arena top it names, each for a catalogue product", () => {
    const entries = Object.entries(productTops);
    expect(entries.length).toBeGreaterThan(0);
    for (const [slug, src] of entries) {
      expect(Object.keys(productImages)).toContain(slug);
      expect(existsSync(publicFile(src!)), `${src} is missing on disk`).toBe(true);
    }
  });

  it("keeps every catalogue slug in a cut-out generator", () => {
    const script = readFileSync(join(ROOT, "scripts/cutout_products.py"), "utf8");
    for (const slug of Object.keys(productImages)) {
      // The deck cases share one picture, built by scripts/cut_deck_cases.py and render-deck-image.mjs.
      if (slug.startsWith("porta-deck-")) continue;
      expect(script).toContain(`"${slug}"`);
    }
    expect(readFileSync(join(ROOT, "scripts/render-deck-image.mjs"), "utf8")).toContain("public/products/cutout/porta-deck.webp");
    expect(cutoutSrc("/products/porta-deck.webp")).toBe("/products/cutout/porta-deck.webp");
    for (const slug of Object.keys(productTops)) expect(script).toContain(`"${slug}": (`);
  });
});
