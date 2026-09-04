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
  /** Current backend allocation/stock projection; final validation remains server-side. */
  readonly availableQuantity?: number;
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
  /** Promotions and coupon, combined. Zero when nothing applies. */
  readonly discount: Money;
  readonly shipping: Money;
  readonly total: Money;
  /** Cents still needed to reach free shipping; 0 once the threshold is met. */
  readonly freeShippingRemaining: number;
};

/** A delivery option the backend currently sells. Never a hardcoded UI constant. */
export type ShippingOption = {
  readonly code: string;
  readonly label: string;
  readonly hint: string | null;
  readonly price: Money;
};

export type CartQuoteLine = {
  readonly slug: ProductSlug;
  readonly name: string;
  readonly quantity: number;
  readonly unitPrice: Money;
  readonly lineTotal: Money;
  readonly image: ProductImage | null;
  readonly stock: StockStatus;
  /** Availability from the authoritative row used to validate this quote line. */
  readonly availableQuantity?: number;
  /** Italian sentence when this line cannot be ordered as requested, else null. */
  readonly issue: string | null;
};

/**
 * Whether the backend is currently taking orders. `unconfigured` means no order
 * backend exists at all (the mock provider), which is different from a shop that has
 * deliberately closed intake.
 */
export type OrderIntake = "open" | "closed" | "unconfigured";

/**
 * Everything the cart and checkout screens are allowed to display as final.
 *
 * The browser holds only slugs and quantities; every amount here is computed by the
 * provider, which for Supabase means the `calculate_cart_pricing` RPC. No caller can
 * influence a price by sending one.
 */
export type CartQuote = {
  readonly lines: readonly CartQuoteLine[];
  /** Cart slugs that no longer resolve to a product at all. */
  readonly missingSlugs: readonly string[];
  readonly shippingOptions: readonly ShippingOption[];
  /** The option the totals were computed with; null when none is available. */
  readonly shippingCode: string | null;
  readonly totals: CartTotals;
  /** Free-shipping threshold in cents, or null when the backend offers none. */
  readonly freeShippingThreshold: number | null;
  readonly couponCode: string | null;
  readonly couponError: string | null;
  readonly orderIntake: OrderIntake;
  /** True only when every line is orderable and a shipping option exists. */
  readonly orderable: boolean;
  /** Why the cart cannot be ordered, when it cannot. */
  readonly notice: string | null;
};

export type CartQuoteRequest = {
  readonly lines: readonly CartLine[];
  readonly shippingCode?: string;
  readonly couponCode?: string;
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
  /** A specific bundle by slug — how the CMS pulls the bundle a homepage section targets. */
  getBundleBySlug(slug: string): Promise<Bundle | null>;
  /** Products by explicit slug list, preserving the order given. */
  getProductsBySlugs(slugs: readonly string[]): Promise<readonly Product[]>;
  /**
   * Prices a cart. This is the only source of money the storefront may display as
   * final, and the only place shipping options come from.
   */
  quoteCart(request: CartQuoteRequest): Promise<CartQuote>;
};
