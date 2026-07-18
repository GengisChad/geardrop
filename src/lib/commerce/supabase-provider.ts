import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";
import type {
  BladeType,
  Bundle,
  CartTotals,
  Category,
  CategorySlug,
  CommerceProvider,
  Facets,
  Product,
  ProductPage,
  ProductQuery,
  PromoTag,
  SortKey,
  StockStatus,
} from "./types";

const DEFAULT_PER_PAGE = 12;

type Ordered = { readonly sort_order: number };
type RawProduct = {
  readonly slug: string;
  readonly name: string;
  readonly tagline: string;
  readonly description: string;
  readonly price_cents: number;
  readonly compare_at_price_cents: number | null;
  readonly blade_type: BladeType | null;
  readonly stock_status: StockStatus;
  readonly rating: number | string;
  readonly review_count: number;
  readonly category: { readonly slug: string } | readonly { readonly slug: string }[];
  readonly images: readonly (Ordered & {
    readonly src: string;
    readonly width: number;
    readonly height: number;
    readonly alt: string;
  })[];
  readonly specs: readonly (Ordered & { readonly label: string; readonly value: string })[];
  readonly features: readonly (Ordered & { readonly title: string; readonly description: string })[];
  readonly box_contents: readonly (Ordered & { readonly content: string })[];
  readonly tags: readonly { readonly tag: PromoTag }[];
  readonly relations: readonly (Ordered & {
    readonly related: { readonly slug: string } | readonly { readonly slug: string }[];
  })[];
};

const PRODUCT_SELECT = `
  slug,
  name,
  tagline,
  description,
  price_cents,
  compare_at_price_cents,
  blade_type,
  stock_status,
  rating,
  review_count,
  category:categories!inner(slug),
  images:product_images!inner(src,width,height,alt,sort_order,published,media_asset:media_assets!inner(status)),
  specs:product_specs(label,value,sort_order),
  features:product_features(title,description,sort_order),
  box_contents:product_box_contents(content,sort_order),
  tags:product_tags(tag),
  relations:product_relations!product_relations_product_id_fkey(
    sort_order,
    related:products!product_relations_related_product_id_fkey(slug)
  )
`;

function first<T>(value: T | readonly T[]): T {
  return Array.isArray(value) ? (value[0] as T) : (value as T);
}

function ordered<T extends Ordered>(values: readonly T[]): readonly T[] {
  return [...values].sort((left, right) => left.sort_order - right.sort_order);
}

export function mapSupabaseProduct(row: RawProduct): Product {
  const category = first(row.category);
  const compareAtPrice = row.compare_at_price_cents === null
    ? {}
    : { compareAtPrice: { amount: row.compare_at_price_cents, currency: "EUR" as const } };
  const bladeType = row.blade_type === null ? {} : { bladeType: row.blade_type };

  return {
    slug: row.slug as Product["slug"],
    name: row.name,
    tagline: row.tagline,
    description: row.description,
    price: { amount: row.price_cents, currency: "EUR" },
    ...compareAtPrice,
    category: category.slug as CategorySlug,
    ...bladeType,
    stock: row.stock_status,
    tags: row.tags.map(({ tag }) => tag),
    rating: Number(row.rating),
    reviewCount: row.review_count,
    images: ordered(row.images).map(({ src, width, height, alt }) => ({ src, width, height, alt })),
    specs: ordered(row.specs).map(({ label, value }) => ({ label, value })),
    features: ordered(row.features).map(({ title, description }) => ({ title, description })),
    boxContents: ordered(row.box_contents).map(({ content }) => content),
    relatedSlugs: ordered(row.relations).map(({ related }) => first(related).slug as Product["slug"]),
  };
}

function normalise(value: string): string {
  return value.toLocaleLowerCase("it").normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function matches(product: Product, query: ProductQuery): boolean {
  if (query.category && product.category !== query.category) return false;
  if (query.stock?.length && !query.stock.includes(product.stock)) return false;
  if (query.bladeType?.length && (!product.bladeType || !query.bladeType.includes(product.bladeType))) return false;
  if (query.minPrice !== undefined && product.price.amount < query.minPrice) return false;
  if (query.maxPrice !== undefined && product.price.amount > query.maxPrice) return false;

  const search = normalise(query.search ?? "").trim();
  if (search) {
    const haystack = normalise(`${product.name} ${product.tagline} ${product.description} ${product.bladeType ?? ""}`);
    if (!search.split(/\s+/).every((token) => haystack.includes(token))) return false;
  }

  return true;
}

const SORTERS: Record<SortKey, (left: Product, right: Product) => number> = {
  popolari: (left, right) => right.reviewCount - left.reviewCount,
  novita: (left, right) =>
    Number(right.tags.includes("novita")) - Number(left.tags.includes("novita"))
    || right.reviewCount - left.reviewCount,
  "prezzo-asc": (left, right) => left.price.amount - right.price.amount,
  "prezzo-desc": (left, right) => right.price.amount - left.price.amount,
  nome: (left, right) => left.name.localeCompare(right.name, "it"),
};

function count<T extends string>(values: readonly T[]): Map<T, number> {
  const result = new Map<T, number>();
  for (const value of values) result.set(value, (result.get(value) ?? 0) + 1);
  return result;
}

export function createSupabaseCommerceProvider(client: SupabaseClient<Database>): CommerceProvider {
  async function allProducts(): Promise<readonly Product[]> {
    const { data, error } = await client.from("products").select(PRODUCT_SELECT).eq("publication_status", "published").eq("active", true).eq("images.published", true).eq("images.media_asset.status", "ready");
    if (error) throw error;
    return (data as unknown as readonly RawProduct[]).map(mapSupabaseProduct);
  }

  return {
    name: "supabase",

    async getProduct(slug) {
      const { data, error } = await client.from("products").select(PRODUCT_SELECT).eq("publication_status", "published").eq("active", true).eq("images.published", true).eq("images.media_asset.status", "ready").eq("slug", slug).maybeSingle();
      if (error) throw error;
      return data ? mapSupabaseProduct(data as unknown as RawProduct) : null;
    },

    async getProductsBySlugs(slugs) {
      if (slugs.length === 0) return [];
      const { data, error } = await client.from("products").select(PRODUCT_SELECT).eq("publication_status", "published").eq("active", true).eq("images.published", true).eq("images.media_asset.status", "ready").in("slug", [...slugs]);
      if (error) throw error;
      const bySlug = new Map(
        (data as unknown as readonly RawProduct[]).map((row) => [row.slug, mapSupabaseProduct(row)]),
      );
      return slugs.map((slug) => bySlug.get(slug)).filter((product): product is Product => product !== undefined);
    },

    async listProducts(query = {}): Promise<ProductPage> {
      const perPage = query.perPage ?? DEFAULT_PER_PAGE;
      const filtered = (await allProducts()).filter((product) => matches(product, query));
      const sorted = [...filtered].sort(SORTERS[query.sort ?? "popolari"]);
      const pageCount = Math.max(1, Math.ceil(sorted.length / perPage));
      const page = Math.min(Math.max(1, query.page ?? 1), pageCount);
      const start = (page - 1) * perPage;
      return { items: sorted.slice(start, start + perPage), total: sorted.length, page, perPage, pageCount };
    },

    async getFacets(query = {}): Promise<Facets> {
      const products = await allProducts();
      const filtered = products.filter((product) => matches(product, query));
      const categoryCounts = count(filtered.map((product) => product.category));
      const stockCounts = count(filtered.map((product) => product.stock));
      const bladeTypeCounts = count(
        filtered.map((product) => product.bladeType).filter((value): value is BladeType => value !== undefined),
      );
      const prices = products.map((product) => product.price.amount);

      return {
        categories: (["beyblade-x", "lanciatori", "stadi", "accessori"] as const).map((value) => ({
          value,
          count: categoryCounts.get(value) ?? 0,
        })),
        stock: (["disponibile", "in-arrivo", "pre-ordine", "esaurito"] as const).map((value) => ({
          value,
          count: stockCounts.get(value) ?? 0,
        })),
        bladeType: (["attacco", "difesa", "stamina", "bilanciato"] as const).map((value) => ({
          value,
          count: bladeTypeCounts.get(value) ?? 0,
        })),
        priceRange: {
          min: prices.length ? Math.min(...prices) : 0,
          max: prices.length ? Math.max(...prices) : 0,
        },
        total: filtered.length,
      };
    },

    async listCategories(): Promise<readonly Category[]> {
      const { data, error } = await client
        .from("categories")
        .select("slug,name,tagline,description")
        .eq("publication_status", "published")
        .eq("active", true)
        .order("sort_order");
      if (error) throw error;
      return (data as readonly Category[] | null) ?? [];
    },

    async getCategory(slug) {
      const { data, error } = await client
        .from("categories")
        .select("slug,name,tagline,description")
        .eq("publication_status", "published")
        .eq("active", true)
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      return data as Category | null;
    },

    async getBundle(): Promise<Bundle | null> {
      const { data, error } = await client
        .from("bundles")
        .select(`
          slug,eyebrow,title_line_one,title_line_two,description,price_cents,compare_at_price_cents,
          hero:products!bundles_hero_product_id_fkey(slug),
          items:bundle_items(sort_order,product:products(slug))
        `)
        .eq("active", true)
        .order("id")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      const row = data as unknown as {
        slug: string;
        eyebrow: string;
        title_line_one: string;
        title_line_two: string;
        description: string;
        price_cents: number;
        compare_at_price_cents: number;
        hero: { slug: string } | readonly { slug: string }[];
        items: readonly (Ordered & { product: { slug: string } | readonly { slug: string }[] })[];
      };
      return {
        slug: row.slug,
        eyebrow: row.eyebrow,
        title: [row.title_line_one, row.title_line_two],
        description: row.description,
        price: { amount: row.price_cents, currency: "EUR" },
        compareAtPrice: { amount: row.compare_at_price_cents, currency: "EUR" },
        heroSlug: first(row.hero).slug as Product["slug"],
        includes: ordered(row.items).map(({ product }) => first(product).slug as Product["slug"]),
      };
    },

    async computeTotals(lines): Promise<CartTotals> {
      if(lines.length===0)return{subtotal:{amount:0,currency:"EUR"},shipping:{amount:0,currency:"EUR"},total:{amount:0,currency:"EUR"},freeShippingRemaining:0};
      const productRows=await client.from("products").select("id,slug").eq("publication_status","published").eq("active",true).in("slug",lines.map(line=>line.slug));
      if(productRows.error)throw productRows.error;const bySlug=new Map((productRows.data??[]).map(product=>[product.slug,product.id]));
      const pricingLines=lines.map(line=>({product_id:bySlug.get(line.slug),quantity:line.quantity}));if(pricingLines.some(line=>line.product_id===undefined))throw new Error("Prodotto non disponibile");
      const [pricing,shippingMethod]=await Promise.all([client.rpc("calculate_cart_pricing",{p_lines:pricingLines,p_shipping_code:"standard"}),client.from("shipping_methods").select("free_from_cents").eq("code","standard").eq("active",true).single()]);
      if(pricing.error)throw pricing.error;if(shippingMethod.error)throw shippingMethod.error;const payload=pricing.data as Record<string,unknown>;const subtotal=Number(payload.subtotal_cents);const shipping=Number(payload.shipping_cents);const total=Number(payload.total_cents);if(![subtotal,shipping,total].every(Number.isSafeInteger))throw new Error("Totali autorevoli non validi");const freeFrom=shippingMethod.data.free_from_cents??0;
      return {
        subtotal: { amount: subtotal, currency: "EUR" },
        shipping: { amount: shipping, currency: "EUR" },
        total: { amount: total, currency: "EUR" },
        freeShippingRemaining: freeFrom > subtotal ? freeFrom - subtotal : 0,
      };
    },
  };
}
