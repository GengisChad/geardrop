/**
 * Local catalogue provider.
 *
 * Answers from src/data/catalog.ts. It is the reference implementation of
 * CommerceProvider: a Shopify or Supabase adapter only has to satisfy the same
 * contract for the whole UI to keep working.
 */

import { BUNDLE, BUNDLES, CATEGORIES, FREE_SHIPPING_THRESHOLD, PRODUCTS, SHIPPING_FLAT_RATE } from "@/data/catalog";
import { STANDARD_DELIVERY } from "@/lib/labels";
import { piecesOf, withBundles } from "./bundles";
import { oneCardPerFamily } from "./variants";
import type {
  BladeType,
  Bundle,
  CartQuote,
  CartQuoteLine,
  CartQuoteRequest,
  Category,
  CategorySlug,
  CommerceProvider,
  Facets,
  Product,
  ProductPage,
  ProductQuery,
  ShippingOption,
  SortKey,
  StockStatus,
} from "./types";

// The catalogue is small: one page holds it all, so nobody lands on a page with two cards.
const DEFAULT_PER_PAGE = 24;

/**
 * The one delivery option the local catalogue knows about. Real shipping options come
 * from the backend; hardcoding them is allowed here and nowhere else.
 */
const MOCK_SHIPPING: ShippingOption = {
  code: "standard",
  label: "Spedizione standard",
  hint: STANDARD_DELIVERY,
  price: { amount: SHIPPING_FLAT_RATE, currency: "EUR" },
};

/** Popularity is not a stored field; the mockups rank by review volume. */
const byPopularity = (a: Product, b: Product) => b.reviewCount - a.reviewCount;

const SORTERS: Record<SortKey, (a: Product, b: Product) => number> = {
  popolari: byPopularity,
  novita: (a, b) => Number(b.tags.includes("novita")) - Number(a.tags.includes("novita")) || byPopularity(a, b),
  "prezzo-asc": (a, b) => a.price.amount - b.price.amount || byPopularity(a, b),
  "prezzo-desc": (a, b) => b.price.amount - a.price.amount || byPopularity(a, b),
  nome: (a, b) => a.name.localeCompare(b.name, "it"),
};

const normalise = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

function matches(product: Product, query: ProductQuery): boolean {
  if (query.category && product.category !== query.category) return false;
  if (query.stock?.length && !query.stock.includes(product.stock)) return false;
  if (query.bladeType?.length && (!product.bladeType || !query.bladeType.includes(product.bladeType))) return false;
  if (query.minPrice !== undefined && product.price.amount < query.minPrice) return false;
  if (query.maxPrice !== undefined && product.price.amount > query.maxPrice) return false;
  if (query.search) {
    const needle = normalise(query.search).trim();
    if (needle) {
      const haystack = normalise(`${product.name} ${product.tagline} ${product.description} ${product.bladeType ?? ""}`);
      if (!needle.split(/\s+/).every((token) => haystack.includes(token))) return false;
    }
  }
  return true;
}

/** Drops keys entirely rather than setting them to undefined (exactOptionalPropertyTypes). */
function omit<T extends object, K extends keyof T>(source: T, keys: readonly K[]): Omit<T, K> {
  const copy = { ...source } as Record<string, unknown>;
  for (const key of keys) delete copy[key as string];
  return copy as Omit<T, K>;
}

/** Facet counts ignore the facet being counted, so a filter never zeroes its own siblings. */
function countBy<T extends string>(products: readonly Product[], pick: (p: Product) => T | undefined) {
  const counts = new Map<T, number>();
  for (const product of products) {
    const key = pick(product);
    if (key !== undefined) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** The reviewed catalogue with its bundles, priced on the catalogue's own stock. */
export const STOREFRONT_CATALOGUE: readonly Product[] = withBundles(PRODUCTS, BUNDLES);

export function createMockProvider(catalogue: readonly Product[] = STOREFRONT_CATALOGUE): CommerceProvider {
  const bySlug = new Map(catalogue.map((product) => [product.slug as string, product]));

  // Lists show an item sold in several colours once (see variants.ts); its product page still
  // finds every colour by slug.
  const filter = (query: ProductQuery) => oneCardPerFamily(catalogue.filter((product) => matches(product, query)));

  return {
    name: "mock",

    async getProduct(slug) {
      return bySlug.get(slug) ?? null;
    },

    async getProductsBySlugs(slugs) {
      return slugs.map((slug) => bySlug.get(slug)).filter((p): p is Product => p !== undefined);
    },

    async listProducts(query = {}) {
      const perPage = query.perPage ?? DEFAULT_PER_PAGE;
      const sorted = [...filter(query)].sort(SORTERS[query.sort ?? "popolari"]);
      const pageCount = Math.max(1, Math.ceil(sorted.length / perPage));
      const page = Math.min(Math.max(1, query.page ?? 1), pageCount);
      const start = (page - 1) * perPage;
      return {
        items: sorted.slice(start, start + perPage),
        total: sorted.length,
        page,
        perPage,
        pageCount,
      } satisfies ProductPage;
    },

    async getFacets(query = {}) {
      // Each facet is counted against the query with that facet removed, so ticking
      // "Disponibile" doesn't drive the other availability counts to zero.
      const forCategories = oneCardPerFamily(catalogue.filter((p) => matches(p, omit(query, ["category"]))));
      const forStock = oneCardPerFamily(catalogue.filter((p) => matches(p, omit(query, ["stock"]))));
      const forType = oneCardPerFamily(catalogue.filter((p) => matches(p, omit(query, ["bladeType"]))));

      const categoryCounts = countBy<CategorySlug>(forCategories, (p) => p.category);
      const stockCounts = countBy<StockStatus>(forStock, (p) => p.stock);
      const typeCounts = countBy<BladeType>(forType, (p) => p.bladeType);
      const prices = catalogue.map((p) => p.price.amount);

      return {
        categories: CATEGORIES.map((c) => ({ value: c.slug, count: categoryCounts.get(c.slug) ?? 0 })),
        stock: (["disponibile", "in-arrivo", "pre-ordine", "esaurito"] as const).map((value) => ({
          value,
          count: stockCounts.get(value) ?? 0,
        })),
        bladeType: (["attacco", "difesa", "stamina", "bilanciato"] as const).map((value) => ({
          value,
          count: typeCounts.get(value) ?? 0,
        })),
        priceRange: {
          min: prices.length ? Math.min(...prices) : 0,
          max: prices.length ? Math.max(...prices) : 0,
        },
        total: filter(query).length,
      } satisfies Facets;
    },

    async listCategories(): Promise<readonly Category[]> {
      return CATEGORIES;
    },

    async getCategory(slug) {
      return CATEGORIES.find((c) => c.slug === slug) ?? null;
    },

    async getBundle(): Promise<Bundle | null> {
      return BUNDLE;
    },

    async getBundleBySlug(slug: string): Promise<Bundle | null> {
      return slug === BUNDLE.slug ? BUNDLE : null;
    },

    async quoteCart(request: CartQuoteRequest): Promise<CartQuote> {
      const missingSlugs: string[] = [];
      const quoteLines: CartQuoteLine[] = [];

      // A bundle and a single pack can both take the same pieces, so stock is checked against
      // everything the cart asks of each catalogue product, not line by line.
      const demand = new Map<string, number>();
      for (const line of request.lines) {
        const product = bySlug.get(line.slug);
        if (!product) continue;
        for (const piece of piecesOf(product, line.quantity)) {
          demand.set(piece.slug, (demand.get(piece.slug) ?? 0) + piece.quantity);
        }
      }
      const sharedShortage = (product: Product, quantity: number): string | null => {
        for (const piece of piecesOf(product, quantity)) {
          const source = bySlug.get(piece.slug);
          const available = source?.availableQuantity;
          if (source && !source.autoPreorder && available !== undefined && (demand.get(piece.slug) ?? 0) > available) {
            return `Disponibilità insufficiente: restano ${available} ${source.name}, contando anche il duo.`;
          }
        }
        return null;
      };

      // The shelf is handed out in cart order, as the webhook will take it once Stripe confirms
      // the payment: whatever a line asks beyond what is left ships as a pre-order.
      const shelf = new Map<string, number>();
      const preorderQuantity = (product: Product, quantity: number): number => {
        if (product.stock === "pre-ordine" && !product.autoPreorder) return quantity;
        let ready = quantity;
        for (const part of product.bundleOf ?? [{ slug: product.slug, quantity: 1 }]) {
          const available = bySlug.get(part.slug)?.availableQuantity;
          if (available === undefined) continue;
          const left = shelf.get(part.slug) ?? Math.max(available, 0);
          const taken = Math.min(left, part.quantity * quantity);
          shelf.set(part.slug, left - taken);
          ready = Math.min(ready, Math.floor(taken / part.quantity));
        }
        return quantity - ready;
      };

      for (const line of request.lines) {
        const product = bySlug.get(line.slug);
        if (!product) {
          missingSlugs.push(line.slug);
          continue;
        }
        const issue =
          product.stock === "esaurito"
            ? "Non disponibile: rimuovilo per procedere."
            : !product.autoPreorder && product.availableQuantity !== undefined && line.quantity > product.availableQuantity
              ? `Disponibilità insufficiente: ne restano ${product.availableQuantity}.`
              : sharedShortage(product, line.quantity);
        const preordered = issue === null ? preorderQuantity(product, line.quantity) : 0;
        quoteLines.push({
          slug: product.slug,
          name: product.name,
          quantity: line.quantity,
          unitPrice: product.price,
          lineTotal: { amount: product.price.amount * line.quantity, currency: "EUR" },
          image: product.images[0] ?? null,
          stock: product.stock,
          ...(product.availableQuantity === undefined
            ? {}
            : { availableQuantity: product.availableQuantity }),
          ...(product.autoPreorder ? { autoPreorder: true } : {}),
          ...(product.releasePreorder ? { releasePreorder: true } : {}),
          ...(preordered > 0 ? { preorderQuantity: preordered } : {}),
          issue,
        });
      }

      const sellable = quoteLines.filter((line) => line.issue === null);
      const subtotal = sellable.reduce((sum, line) => sum + line.lineTotal.amount, 0);
      const isEmpty = subtotal === 0;
      const qualifies = subtotal >= FREE_SHIPPING_THRESHOLD;
      const shipping = isEmpty || qualifies ? 0 : SHIPPING_FLAT_RATE;

      return {
        lines: quoteLines,
        missingSlugs,
        shippingOptions: [MOCK_SHIPPING],
        shippingCode: MOCK_SHIPPING.code,
        totals: {
          subtotal: { amount: subtotal, currency: "EUR" },
          discount: { amount: 0, currency: "EUR" },
          shipping: { amount: shipping, currency: "EUR" },
          total: { amount: subtotal + shipping, currency: "EUR" },
          freeShippingRemaining: isEmpty || qualifies ? 0 : FREE_SHIPPING_THRESHOLD - subtotal,
        },
        freeShippingThreshold: FREE_SHIPPING_THRESHOLD,
        // The local catalogue has no coupon engine; a code is neither honoured nor
        // silently swallowed.
        couponCode: null,
        couponError: request.couponCode
          ? "I codici sconto non sono disponibili in questa modalità."
          : null,
        // There is no order backend behind the local catalogue, and pretending
        // otherwise is exactly the bug this replaces.
        orderIntake: "unconfigured",
        orderable: false,
        notice: "Gli ordini non sono ancora attivi su questo sito.",
      };
    },
  };
}
