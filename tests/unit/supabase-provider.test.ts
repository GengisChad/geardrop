import { describe, expect, it } from "vitest";
import { mapSupabaseProduct } from "@/lib/commerce/supabase-provider";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Supabase commerce provider mapping", () => {
  it("maps integer cents and ordered relational content into the UI contract", () => {
    const product = mapSupabaseProduct({
      slug: "wizard-arrow-4-80b",
      name: "Wizard Arrow 4-80B",
      tagline: "Tagline",
      description: "Description",
      price_cents: 2499,
      compare_at_price_cents: null,
      blade_type: "attacco",
      stock_status: "pre-ordine",
      stock_quantity: 0,
      preorder_allocation: 7,
      availability_override: "preorder",
      rating: 4.5,
      review_count: 12,
      category: { slug: "beyblade-x" },
      images: [{ src: "/product.png", width: 200, height: 180, alt: "Product", sort_order: 0 }],
      specs: [{ label: "Tipo", value: "Attacco", sort_order: 0 }],
      features: [{ title: "Veloce", description: "Molto veloce", sort_order: 0 }],
      box_contents: [{ content: "1 trottola", sort_order: 0 }],
      tags: [{ tag: "novita" }],
      relations: [{ sort_order: 0, related: { slug: "dran-buster-1-60a" } }],
    });

    expect(product.price).toEqual({ amount: 2499, currency: "EUR" });
    expect(product.stock).toBe("pre-ordine");
    expect(product.availableQuantity).toBe(7);
    expect(product.images).toEqual([{ src: "/product.png", width: 200, height: 180, alt: "Product" }]);
    expect(product.relatedSlugs).toEqual(["dran-buster-1-60a"]);
  });

  it("projects ordinary stock when the product is not a preorder", () => {
    const product = mapSupabaseProduct({
      slug: "wizard-arrow-4-80b",
      name: "Wizard Arrow 4-80B",
      tagline: "Tagline",
      description: "Description",
      price_cents: 2499,
      compare_at_price_cents: null,
      blade_type: "attacco",
      stock_status: "disponibile",
      stock_quantity: 4,
      preorder_allocation: 0,
      availability_override: null,
      rating: 0,
      review_count: 0,
      category: { slug: "beyblade-x" },
      images: [{ src: "/product.png", width: 200, height: 180, alt: "Product", sort_order: 0 }],
      specs: [],
      features: [],
      box_contents: [],
      tags: [],
      relations: [],
    });

    expect(product.availableQuantity).toBe(4);
  });
});

describe("Supabase storefront boundaries",()=>{
  it("explicitly filters public products and delegates ready/static image safety to RLS",()=>{const source=readFileSync(join(process.cwd(),"src/lib/commerce/supabase-provider.ts"),"utf8");expect(source).toContain('.eq("publication_status", "published")');expect(source).toContain('.eq("active", true)');expect(source).toContain('.eq("images.published", true)');expect(source).toContain("Product-image RLS admits linked media only when ready");
    // The ready/static guarantee belongs to product_images_public_read, whose
    // is_ready_media_asset() helper is security definer. The storefront must NOT embed
    // media_assets to restate it: anon has no SELECT on that staff table, so PostgREST
    // answers 42501 and every product page fails to render.
    expect(source).not.toContain("media_assets(");expect(source).not.toContain("media_asset:media_assets");});
  it("uses authoritative pricing totals",()=>{const source=readFileSync(join(process.cwd(),"src/lib/commerce/supabase-provider.ts"),"utf8");expect(source).toContain('rpc("calculate_cart_pricing"');expect(source).not.toContain("subtotal + shipping");});
  it("keeps mock default and reads Supabase storefront data as anon",()=>{const source=readFileSync(join(process.cwd(),"src/lib/commerce/provider.ts"),"utf8");expect(source).toContain('process.env["COMMERCE_PROVIDER"] ?? "mock"');expect(source).toContain("createSupabasePublicClient");expect(source).toContain("cacheStorefrontRead");expect(source).not.toContain("createSupabaseServerClient");expect(source).not.toContain("NEXT_PUBLIC_COMMERCE_PROVIDER");});
});
