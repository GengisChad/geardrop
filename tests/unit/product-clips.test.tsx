import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Gallery } from "@/components/product/gallery";
import { Providers } from "@/components/providers";
import { productClips } from "@/data/assets";
import { BUNDLES, PRODUCTS } from "@/data/catalog";
import { BESTSELLER_SLUGS } from "@/lib/home/product-selection";

const publicFile = (src: string) => join(process.cwd(), "public", src);

/** Width and height from a baseline or progressive JPEG's frame header. */
function jpegSize(path: string): { width: number; height: number } {
  const bytes = readFileSync(path);
  let offset = 2;
  while (offset < bytes.length) {
    const marker = bytes[offset + 1]!;
    const length = bytes.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc2) return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    offset += 2 + length;
  }
  throw new Error(`no frame header in ${path}`);
}

describe("product clips manifest", () => {
  const entries = Object.entries(productClips);

  it("covers the owner's best sellers and the release that just landed", () => {
    expect(entries.map(([slug]) => slug).sort()).toEqual([...BESTSELLER_SLUGS, "soar-phoenix-9-60gf"].sort());
  });

  it("points only at single products of the catalogue, never at a bundle", () => {
    const bundles = new Set<string>(BUNDLES.map((bundle) => bundle.slug));
    for (const [slug] of entries) {
      const product = PRODUCTS.find((candidate) => candidate.slug === slug);
      expect(product, slug).toBeDefined();
      expect(product?.bundleOf, slug).toBeUndefined();
      expect(bundles.has(slug), slug).toBe(false);
    }
  });

  it("ships an mp4 and a poster of the clip's own size for every entry", () => {
    for (const [slug, clip] of entries) {
      expect(clip!.src, slug).toBe(`/video/products/${slug}.mp4`);
      const mp4 = readFileSync(publicFile(clip!.src));
      expect(mp4.subarray(4, 8).toString("latin1"), slug).toBe("ftyp");
      expect(statSync(publicFile(clip!.src)).size, slug).toBeLessThan(2_500_000);
      expect(jpegSize(publicFile(clip!.poster)), slug).toEqual({ width: clip!.width, height: clip!.height });
    }
  });
});

describe("gallery with a clip", () => {
  const image = { src: "/products/soar-phoenix-9-60gf.webp", alt: "Soar Phoenix", width: 1200, height: 1200 };
  const clip = { src: "/video/products/soar-phoenix-9-60gf.mp4", poster: "/video/products/soar-phoenix-9-60gf.jpg", width: 1080, height: 1080 };
  const render = (withClip: boolean) =>
    renderToStaticMarkup(
      <Providers>
        <Gallery images={[image]} slug="soar-phoenix-9-60gf" name="Soar Phoenix 9-60GF" mark="9-60" {...(withClip ? { clip } : {})} />
      </Providers>,
    );

  it("adds a Clip thumbnail after the photos, and mounts no video before it is chosen", () => {
    const html = render(true);
    expect(html).toContain('aria-label="Clip del prodotto"');
    expect(html).toContain("Clip</span>");
    expect(html).not.toContain("<video");
  });

  it("keeps the first photo as the preloaded image and the clip's poster lazy", () => {
    const html = render(true);
    expect(html).toMatch(/<link rel="preload" as="image" imageSrcSet="[^"]*soar-phoenix-9-60gf\.webp/);
    expect(html).not.toMatch(/<link rel="preload"[^>]*soar-phoenix-9-60gf\.jpg/);
    const poster = html.match(/<img[^>]*soar-phoenix-9-60gf\.jpg[^>]*>/)?.[0] ?? "";
    expect(poster).toContain('loading="lazy"');
  });

  it("shows no thumbnails for a single photo without a clip", () => {
    const html = render(false);
    expect(html).not.toContain("Clip del prodotto");
    expect(html).not.toContain('aria-label="Immagine 1 di 1"');
  });
});
