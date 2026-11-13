/**
 * The owner, 2026-11-13: two red Phoenix without the launcher, only the top with its ratchet and bit
 * (like Hover Wyvern and Impact Drake), at 12,99, two on the shelf for now, as a promotion.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PRODUCTS, SOLD_WITHOUT_BARCODE, brandOf } from "@/data/catalog";
import { SPOTLIGHT_SLUGS } from "@/lib/home/product-selection";

const SLUG = "soar-phoenix-9-60gf-solo-trottola";
const phoenix = PRODUCTS.find((product) => product.slug === SLUG)!;

describe("Soar Phoenix 9-60GF solo trottola", () => {
  it("sells at 12,99 with two on the shelf, Hasbro, as an offer with no struck-through price", () => {
    expect(phoenix.price.amount).toBe(1299);
    expect(phoenix.availableQuantity).toBe(2);
    expect(phoenix.stock).toBe("disponibile");
    expect(phoenix.tags).toEqual(["offerta"]);
    // The boxed starter is a different product, with a launcher: not a "was" price for this one.
    expect(phoenix.compareAtPrice).toBeUndefined();
    expect(brandOf(phoenix)).toBe("hasbro");
    expect(phoenix.consignment).toBeUndefined();
  });

  it("says, everywhere a buyer reads, that the launcher is not in the bag", () => {
    expect(phoenix.description).toContain("il lanciatore non è incluso");
    expect(phoenix.specs.find((spec) => spec.label === "Componenti")?.value).toBe("1 trottola: blade, Ratchet 9-60 e Bit GF");
    expect(phoenix.features.at(-1)).toEqual({ title: "Da sapere prima di comprare", description: "Arriva in busta, senza scatola e senza lanciatore" });
    expect(phoenix.boxContents.join(" ")).not.toMatch(/lanciatore|launcher/i);
  });

  it("shows only the top, out of Hasbro's own render", () => {
    expect(phoenix.images).toHaveLength(1);
    const [image] = phoenix.images;
    expect(image!.src).toBe(`/products/${SLUG}.webp`);
    expect(existsSync(`public${image!.src}`)).toBe(true);
    expect(existsSync(`public/products/cutout/${SLUG}.webp`)).toBe(true);
    expect(existsSync(`assets-source/products/${SLUG}.jpg`)).toBe(true);
    expect(readFileSync("docs/product-photo-sources.md", "utf8")).toContain("71sKwutK96L");
  });

  it("leads the catalogue and the first screen while it lasts", () => {
    expect(PRODUCTS[0]?.slug).toBe(SLUG);
    expect(SPOTLIGHT_SLUGS[0]).toBe(SLUG);
  });

  it("tells Google it has no barcode of its own", () => {
    expect(SOLD_WITHOUT_BARCODE.has(SLUG)).toBe(true);
  });

  it("is mirrored by its migration: price, stock, words, photo, offer tag, and never reset on a replay", () => {
    const migration = readFileSync("supabase/migrations/20261113120000_soar_phoenix_loose_and_string_launcher_l.sql", "utf8");
    expect(migration).toContain(`'${SLUG}'`);
    expect(migration).toContain("1299, 2, 39");
    expect(migration).toContain(phoenix.description.replaceAll("'", "''"));
    expect(migration).toContain(`'${phoenix.images[0]!.src}'`);
    expect(migration).toContain("'offerta'::public.promo_tag");
    expect(migration).toContain("where not exists (select 1 from public.products as existing where existing.slug = seed.slug)");
    expect(migration.toLowerCase()).not.toMatch(/\bcost|costo|paid|pagat/);
  });
});
