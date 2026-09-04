/**
 * Supabase-backed catalogue provider.
 *
 * Satisfies the same `CommerceProvider` contract as the mock, so no page or component
 * changes when the backend switches. It is built from a request-scoped client and never
 * stores one: see getCommerceProvider() in provider.ts.
 *
 * Every read here goes through RLS with the publishable key. The `published + active`
 * filters below are therefore belt-and-braces: they keep the storefront honest even when
 * a signed-in staff member (whose policies also expose drafts) is browsing the shop.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProductImage, ProductSlug } from "@/data/assets";
import type { Database } from "@/lib/supabase/database.types";
import type {
  BladeType,
  Bundle,
  CartLine,
  CartTotals,
  Category,
  CategorySlug,
  CommerceProvider,
  Facets,
  Money,
  Product,
  ProductPage,
  ProductQuery,
  PromoTag,
  StockStatus,
} from "./types";

type Client = SupabaseClient<Database>;

const DEFAULT_PER_PAGE = 12;

const STOCK_VALUES = ["disponibile", "in-arrivo", "pre-ordine", "esaurito"] as const;
const BLADE_VALUES = ["attacco", "difesa", "stamina", "bilanciato"] as const;

/**
 * One row shape for the whole product graph. PostgREST returns the child tables as nested
 * arrays, which keeps a product page at a single round trip.
 */
const PRODUCT_SELECT = `
  slug, name, tagline, description,
  price_cents, compare_at_price_cents, blade_type, stock_status, rating, review_count,
  categories!inner (slug, active),
  product_images (path, width, height, alt, sort_order, published),
  product_specs (label, value, sort_order),
  product_features (title, description, sort_order),
  product_box_contents (content, sort_order),
  product_tags (tag),
  product_relations!product_relations_product_id_fkey (
    sort_order,
    related:products!product_relations_related_product_id_fkey (slug)
  )
` as const;

type ProductRow = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  price_cents: number;
  compare_at_price_cents: number | null;
  blade_type: string | null;
  stock_status: string;
  rating: number;
  review_count: number;
  categories: { slug: string; active: boolean } | null;
  product_images: { path: string; width: number; height: number; alt: string; sort_order: number; published: boolean }[];
  product_specs: { label: string; value: string; sort_order: number }[];
  product_features: { title: string; description: string; sort_order: number }[];
  product_box_contents: { content: string; sort_order: number }[];
  product_tags: { tag: string }[];
  product_relations: { sort_order: number; related: { slug: string } | null }[];
};

const money = (amount: number): Money => ({ amount, currency: "EUR" });

const bySortOrder = <T extends { sort_order: number }>(a: T, b: T) => a.sort_order - b.sort_order;

function toImages(rows: ProductRow["product_images"]): readonly ProductImage[] {
  return rows
    .filter((image) => image.published)
    .sort(bySortOrder)
    .map((image) => ({ src: image.path, width: image.width, height: image.height, alt: image.alt }));
}

/**
 * Maps one relational row onto the domain `Product`. Optional keys are added only when
 * present rather than set to undefined, because the project runs with
 * `exactOptionalPropertyTypes`.
 */
function toProduct(row: ProductRow): Product {
  const base = {
    slug: row.slug as ProductSlug,
    name: row.name,
    tagline: row.tagline,
    description: row.description,
    price: money(row.price_cents),
    category: (row.categories?.slug ?? "") as CategorySlug,
    stock: row.stock_status as StockStatus,
    tags: row.product_tags.map((t) => t.tag as PromoTag),
    rating: Number(row.rating),
    reviewCount: row.review_count,
    images: toImages(row.product_images),
    specs: row.product_specs.sort(bySortOrder).map(({ label, value }) => ({ label, value })),
    features: row.product_features.sort(bySortOrder).map(({ title, description }) => ({ title, description })),
    boxContents: row.product_box_contents.sort(bySortOrder).map((b) => b.content),
    relatedSlugs: row.product_relations
      .sort(bySortOrder)
      .flatMap((relation) => (relation.related ? [relation.related.slug as ProductSlug] : [])),
  };

  return {
    ...base,
    ...(row.compare_at_price_cents !== null ? { compareAtPrice: money(row.compare_at_price_cents) } : {}),
    ...(row.blade_type !== null ? { bladeType: row.blade_type as BladeType } : {}),
  };
}

/** Drops keys entirely rather than setting them to undefined (exactOptionalPropertyTypes). */
function omit<T extends object, K extends keyof T>(source: T, keys: readonly K[]): Omit<T, K> {
  const copy = { ...source } as Record<string, unknown>;
  for (const key of keys) delete copy[key as string];
  return copy as Omit<T, K>;
}

export function createSupabaseProvider(client: Client): CommerceProvider {
  /**
   * One filtered, sorted product read. The builder is fluent, so each conditional step
   * re-assigns `request`; its type is unchanged by the chain.
   *
   * `novita` has no stored "is new" column to order by — the promo tag lives in a child
   * table — so recency stands in for it, with popularity as the tie-break.
   */
  async function fetchProducts(query: ProductQuery, from?: number, to?: number) {
    let request = client
      .from("products")
      .select(PRODUCT_SELECT, { count: "exact" })
      .eq("publication_status", "published")
      .eq("active", true)
      .eq("categories.active", true);

    if (query.category) request = request.eq("categories.slug", query.category);
    if (query.stock?.length) request = request.in("stock_status", query.stock);
    if (query.bladeType?.length) request = request.in("blade_type", query.bladeType);
    if (query.minPrice !== undefined) request = request.gte("price_cents", query.minPrice);
    if (query.maxPrice !== undefined) request = request.lte("price_cents", query.maxPrice);

    const needle = query.search?.trim().replace(/[(),*]/g, " ").trim();
    if (needle) {
      // PostgREST inlines `or` terms, so its separators are stripped from the term first.
      request = request.or(`name.ilike.%${needle}%,tagline.ilike.%${needle}%,description.ilike.%${needle}%`);
    }

    switch (query.sort ?? "popolari") {
      case "novita":
        request = request.order("created_at", { ascending: false }).order("review_count", { ascending: false });
        break;
      case "prezzo-asc":
        request = request.order("price_cents", { ascending: true });
        break;
      case "prezzo-desc":
        request = request.order("price_cents", { ascending: false });
        break;
      case "nome":
        request = request.order("name", { ascending: true });
        break;
      default:
        request = request.order("review_count", { ascending: false });
    }

    if (from !== undefined && to !== undefined) request = request.range(from, to);

    const { data, error, count } = await request;
    if (error) throw new Error(`Lettura catalogo fallita: ${error.message}`);

    return { rows: (data ?? []) as unknown as ProductRow[], count: count ?? 0 };
  }

  return {
    name: "supabase",

    async getProduct(slug) {
      const { data, error } = await client
        .from("products")
        .select(PRODUCT_SELECT)
        .eq("slug", slug)
        .eq("publication_status", "published")
        .eq("active", true)
        .maybeSingle();

      if (error) throw new Error(`Lettura prodotto fallita: ${error.message}`);
      return data ? toProduct(data as unknown as ProductRow) : null;
    },

    async getProductsBySlugs(slugs) {
      if (!slugs.length) return [];

      const { data, error } = await client
        .from("products")
        .select(PRODUCT_SELECT)
        .in("slug", slugs as string[])
        .eq("publication_status", "published")
        .eq("active", true);

      if (error) throw new Error(`Lettura prodotti fallita: ${error.message}`);

      // The caller's order is meaningful (carousels, related items); restore it.
      const bySlug = new Map((data ?? []).map((row) => [(row as unknown as ProductRow).slug, row]));
      return slugs.flatMap((slug) => {
        const row = bySlug.get(slug);
        return row ? [toProduct(row as unknown as ProductRow)] : [];
      });
    },

    async listProducts(query = {}) {
      const perPage = query.perPage ?? DEFAULT_PER_PAGE;
      const page = Math.max(1, query.page ?? 1);
      const from = (page - 1) * perPage;

      const { rows, count } = await fetchProducts(query, from, from + perPage - 1);
      const pageCount = Math.max(1, Math.ceil(count / perPage));

      return {
        items: rows.map(toProduct),
        total: count,
        page: Math.min(page, pageCount),
        perPage,
        pageCount,
      } satisfies ProductPage;
    },

    async getFacets(query = {}) {
      // Each facet is counted with its own filter removed, so ticking a value never zeroes
      // its siblings. The catalogue is small enough that counting in one fetch beats four
      // round trips; PostgREST cannot GROUP BY anyway.
      const { rows } = await fetchProducts(omit(query, ["category", "stock", "bladeType"]));

      const matchesRest = (row: ProductRow, ignore: "category" | "stock" | "bladeType") => {
        if (ignore !== "category" && query.category && row.categories?.slug !== query.category) return false;
        if (ignore !== "stock" && query.stock?.length && !query.stock.includes(row.stock_status as StockStatus))
          return false;
        if (
          ignore !== "bladeType" &&
          query.bladeType?.length &&
          (!row.blade_type || !query.bladeType.includes(row.blade_type as BladeType))
        )
          return false;
        return true;
      };

      const { data: categoryRows } = await client
        .from("categories")
        .select("slug")
        .eq("active", true)
        .order("sort_order");

      const prices = rows.map((r) => r.price_cents);
      const total = rows.filter(
        (row) => matchesRest(row, "category") && matchesRest(row, "stock") && matchesRest(row, "bladeType"),
      ).length;

      return {
        categories: (categoryRows ?? []).map((c) => ({
          value: c.slug as CategorySlug,
          count: rows.filter((row) => matchesRest(row, "category") && row.categories?.slug === c.slug).length,
        })),
        stock: STOCK_VALUES.map((value) => ({
          value,
          count: rows.filter((row) => matchesRest(row, "stock") && row.stock_status === value).length,
        })),
        bladeType: BLADE_VALUES.map((value) => ({
          value,
          count: rows.filter((row) => matchesRest(row, "bladeType") && row.blade_type === value).length,
        })),
        priceRange: {
          min: prices.length ? Math.min(...prices) : 0,
          max: prices.length ? Math.max(...prices) : 0,
        },
        total,
      } satisfies Facets;
    },

    async listCategories(): Promise<readonly Category[]> {
      const { data, error } = await client
        .from("categories")
        .select("slug, name, tagline, description")
        .eq("active", true)
        .order("sort_order");

      if (error) throw new Error(`Lettura categorie fallita: ${error.message}`);

      return (data ?? []).map((row) => ({
        slug: row.slug as CategorySlug,
        name: row.name,
        tagline: row.tagline,
        description: row.description,
      }));
    },

    async getCategory(slug) {
      const { data, error } = await client
        .from("categories")
        .select("slug, name, tagline, description")
        .eq("slug", slug)
        .eq("active", true)
        .maybeSingle();

      if (error) throw new Error(`Lettura categoria fallita: ${error.message}`);
      if (!data) return null;

      return {
        slug: data.slug as CategorySlug,
        name: data.name,
        tagline: data.tagline,
        description: data.description,
      };
    },

    async getBundle(): Promise<Bundle | null> {
      const { data, error } = await client
        .from("bundles")
        .select(
          `slug, eyebrow, title_line_1, title_line_2, description, price_cents, compare_at_price_cents,
           hero:products!bundles_hero_product_id_fkey (slug),
           bundle_items (sort_order, products (slug))`,
        )
        .eq("publication_status", "published")
        .eq("active", true)
        .order("id")
        .limit(1)
        .maybeSingle();

      if (error) throw new Error(`Lettura bundle fallita: ${error.message}`);
      if (!data) return null;

      const row = data as unknown as {
        slug: string;
        eyebrow: string;
        title_line_1: string;
        title_line_2: string;
        description: string;
        price_cents: number;
        compare_at_price_cents: number | null;
        hero: { slug: string } | null;
        bundle_items: { sort_order: number; products: { slug: string } | null }[];
      };

      // A bundle without a hero or a compare-at price cannot be rendered by the UI
      // contract, so it is treated as absent rather than half-shown.
      if (!row.hero || row.compare_at_price_cents === null) return null;

      return {
        slug: row.slug,
        eyebrow: row.eyebrow,
        title: [row.title_line_1, row.title_line_2],
        description: row.description,
        price: money(row.price_cents),
        compareAtPrice: money(row.compare_at_price_cents),
        heroSlug: row.hero.slug as ProductSlug,
        includes: row.bundle_items
          .sort(bySortOrder)
          .flatMap((item) => (item.products ? [item.products.slug as ProductSlug] : [])),
      };
    },

    async computeTotals(lines: readonly CartLine[]): Promise<CartTotals> {
      const slugs = lines.map((line) => line.slug);

      const [{ data: priceRows, error: priceError }, { data: shippingRows, error: shippingError }] = await Promise.all([
        slugs.length
          ? client
              .from("products")
              .select("slug, price_cents")
              .in("slug", slugs)
              .eq("publication_status", "published")
              .eq("active", true)
          : Promise.resolve({ data: [], error: null }),
        client
          .from("shipping_methods")
          .select("price_cents, free_shipping_threshold_cents")
          .eq("active", true)
          .order("sort_order")
          .limit(1),
      ]);

      if (priceError) throw new Error(`Calcolo carrello fallito: ${priceError.message}`);
      if (shippingError) throw new Error(`Calcolo spedizione fallito: ${shippingError.message}`);

      const priceBySlug = new Map((priceRows ?? []).map((row) => [row.slug, row.price_cents]));
      const subtotal = lines.reduce((sum, line) => sum + (priceBySlug.get(line.slug) ?? 0) * line.quantity, 0);

      const method = shippingRows?.[0];
      const threshold = method?.free_shipping_threshold_cents ?? null;
      const flatRate = method?.price_cents ?? 0;

      const isEmpty = subtotal === 0;
      const qualifies = threshold !== null && subtotal >= threshold;
      const shipping = isEmpty || qualifies ? 0 : flatRate;

      return {
        subtotal: money(subtotal),
        shipping: money(shipping),
        total: money(subtotal + shipping),
        freeShippingRemaining: isEmpty || qualifies || threshold === null ? 0 : threshold - subtotal,
      };
    },
  };
}
