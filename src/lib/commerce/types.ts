/**
 * Commerce domain types.
 *
 * These describe the shape the UI consumes. They are intentionally provider-agnostic:
 * the local catalogue satisfies them today, and a Shopify / Supabase adapter must map
 * onto the same shapes without the UI changing. See provider.ts.
 */

import type { ProductImage, ProductSlug } from "@/data/assets";

/** Money is held in integer cents to keep arithmetic exact. */
export type Money = {
  /** e.g. 2499 for €24,99 */
  readonly amount: number;
  readonly currency: "EUR";
};

export type StockStatus = "disponibile" | "in-arrivo" | "pre-ordine" | "esaurito";

/** Beyblade X combat archetype. Drives the "Scelti per il competitivo" grid. */
export type BladeType = "attacco" | "difesa" | "stamina" | "bilanciato";

export type PromoTag = "novita" | "offerta" | "limited" | "esclusiva";

export type CategorySlug = "beyblade-x" | "lanciatori" | "stadi" | "accessori";

export type Category = {
  readonly slug: CategorySlug;
  readonly name: string;
  readonly tagline: string;
  readonly description: string;
};

export type ProductSpec = {
  readonly label: string;
  readonly value: string;
};

export type ProductFeature = {
  readonly title: string;
  readonly description: string;
};

export type Product = {
  readonly slug: ProductSlug;
  readonly name: string;
  readonly /** Short line used on cards, from the mockups. */ tagline: string;
  readonly description: string;
  readonly price: Money;
  /** Set when the item is discounted; always higher than `price`. */
  readonly compareAtPrice?: Money;
  readonly category: CategorySlug;
  readonly bladeType?: BladeType;
  readonly stock: StockStatus;
  /** Units on hand. Optional: the backend catalogue may not expose a count. */
  readonly stockQuantity?: number;
  readonly tags: readonly PromoTag[];
  readonly rating: number;
  readonly reviewCount: number;
  readonly images: readonly ProductImage[];
  readonly specs: readonly ProductSpec[];
  readonly features: readonly ProductFeature[];
  readonly boxContents: readonly string[];
  readonly relatedSlugs: readonly ProductSlug[];
};

export type CartLine = {
  readonly slug: ProductSlug;
  readonly quantity: number;
};

export type CartTotals = {
  readonly subtotal: Money;
  readonly shipping: Money;
  readonly total: Money;
  /** Cents still needed to reach free shipping; 0 once the threshold is met. */
  readonly freeShippingRemaining: number;
};

export type SortKey = "popolari" | "novita" | "prezzo-asc" | "prezzo-desc" | "nome";

export type ProductQuery = {
  readonly category?: CategorySlug;
  readonly stock?: readonly StockStatus[];
  readonly bladeType?: readonly BladeType[];
  /** Inclusive bounds, in cents. */
  readonly minPrice?: number;
  readonly maxPrice?: number;
  readonly search?: string;
  readonly sort?: SortKey;
  readonly page?: number;
  readonly perPage?: number;
};

export type ProductPage = {
  readonly items: readonly Product[];
  readonly total: number;
  readonly page: number;
  readonly perPage: number;
  readonly pageCount: number;
};

export type FacetCount<T extends string> = {
  readonly value: T;
  readonly count: number;
};

export type Facets = {
  readonly categories: readonly FacetCount<CategorySlug>[];
  readonly stock: readonly FacetCount<StockStatus>[];
  readonly bladeType: readonly FacetCount<BladeType>[];
  readonly priceRange: { readonly min: number; readonly max: number };
  readonly total: number;
};

export type Bundle = {
  readonly slug: string;
  readonly eyebrow: string;
  readonly title: readonly [string, string];
  readonly description: string;
  readonly price: Money;
  readonly compareAtPrice: Money;
  readonly heroSlug: ProductSlug;
  readonly includes: readonly ProductSlug[];
};

/**
 * The contract every backend must satisfy. Async by design even though the mock
 * provider answers synchronously — so swapping in a network-backed provider is not a
 * breaking change for callers.
 */
export type CommerceProvider = {
  readonly name: string;
  getProduct(slug: string): Promise<Product | null>;
  listProducts(query?: ProductQuery): Promise<ProductPage>;
  getFacets(query?: ProductQuery): Promise<Facets>;
  listCategories(): Promise<readonly Category[]>;
  getCategory(slug: string): Promise<Category | null>;
  getBundle(): Promise<Bundle | null>;
  /** Products by explicit slug list, preserving the order given. */
  getProductsBySlugs(slugs: readonly string[]): Promise<readonly Product[]>;
  computeTotals(lines: readonly CartLine[]): Promise<CartTotals>;
};
