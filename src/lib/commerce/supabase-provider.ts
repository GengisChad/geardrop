import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";
import type { ProductImage } from "@/data/assets";
import { checkoutErrorCode, checkoutErrorMessage } from "./checkout-errors";
import type {
  BladeType,
  Bundle,
  CartQuote,
  CartQuoteLine,
  CartTotals,
  Category,
  CategorySlug,
  CommerceProvider,
  Facets,
  OrderIntake,
  Product,
  ProductPage,
  ProductQuery,
  PromoTag,
  ShippingOption,
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
  readonly stock_quantity: number;
  readonly preorder_allocation: number;
  readonly availability_override: string | null;
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
  stock_quantity,
  preorder_allocation,
  availability_override,
  rating,
  review_count,
  category:categories!inner(slug),
  images:product_images!inner(src,width,height,alt,sort_order,published),
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
    availableQuantity: projectedAvailability(row),
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
    // Product-image RLS admits linked media only when ready and also preserves the
    // reviewed static assets whose legacy rows intentionally have no Storage link:
    // product_images_public_read is `published AND is_public_product(product_id) AND
    // (media_asset_id IS NULL OR is_ready_media_asset(media_asset_id))`. The helper is
    // security definer, so the guarantee holds without anon reading media_assets —
    // which it cannot: that table grants SELECT to staff and service_role only.
    const { data, error } = await client.from("products").select(PRODUCT_SELECT).eq("publication_status", "published").eq("active", true).eq("images.published", true);
    if (error) throw error;
    return (data as unknown as readonly RawProduct[]).map(mapSupabaseProduct);
  }

  return {
    name: "supabase",

    async getProduct(slug) {
      const { data, error } = await client.from("products").select(PRODUCT_SELECT).eq("publication_status", "published").eq("active", true).eq("images.published", true).eq("slug", slug).maybeSingle();
      if (error) throw error;
      return data ? mapSupabaseProduct(data as unknown as RawProduct) : null;
    },

    async getProductsBySlugs(slugs) {
      if (slugs.length === 0) return [];
      const { data, error } = await client.from("products").select(PRODUCT_SELECT).eq("publication_status", "published").eq("active", true).eq("images.published", true).in("slug", [...slugs]);
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

    async getBundleBySlug(slug): Promise<Bundle | null> {
      const { data, error } = await client
        .from("bundles")
        .select(`
          slug,eyebrow,title_line_one,title_line_two,description,price_cents,compare_at_price_cents,
          hero:products!bundles_hero_product_id_fkey(slug),
          items:bundle_items(sort_order,product:products(slug))
        `)
        .eq("slug", slug)
        .eq("active", true)
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

    async quoteCart(request): Promise<CartQuote> {
      const [methodRows, settingsRow] = await Promise.all([
        client
          .from("shipping_methods")
          .select("code,name,price_cents,free_from_cents,estimate_min_days,estimate_max_days")
          .eq("active", true)
          .order("sort_order")
          .order("code"),
        client.from("site_settings").select("accept_orders").eq("singleton", true).maybeSingle(),
      ]);
      if (methodRows.error) throw methodRows.error;
      if (settingsRow.error) throw settingsRow.error;

      const shippingOptions: ShippingOption[] = (methodRows.data ?? []).map((method) => ({
        code: method.code,
        label: method.name,
        hint: deliveryEstimate(method.estimate_min_days, method.estimate_max_days),
        price: { amount: method.price_cents, currency: "EUR" },
      }));
      const orderIntake: OrderIntake = settingsRow.data?.accept_orders ? "open" : "closed";

      // The requested option only counts if it is one the shop actually sells.
      const selected =
        shippingOptions.find((option) => option.code === request.shippingCode) ??
        shippingOptions[0] ??
        null;

      const { data: productData, error: productError } = await client
        .from("products")
        .select(
          `id,slug,name,price_cents,stock_status,stock_quantity,preorder_allocation,
           availability_override,is_purchasable,
           images:product_images(src,width,height,alt,sort_order,is_primary,published)`,
        )
        .in("slug", request.lines.map((line) => line.slug));
      if (productError) throw productError;

      const rows = (productData ?? []) as unknown as readonly QuotableProduct[];
      const bySlug = new Map(rows.map((row) => [row.slug, row]));

      const missingSlugs: string[] = [];
      const lines: CartQuoteLine[] = [];
      const sellable: PricingLine[] = [];

      for (const line of request.lines) {
        const row = bySlug.get(line.slug);
        if (!row) {
          missingSlugs.push(line.slug);
          continue;
        }
        const issue = lineIssue(row, line.quantity);
        lines.push({
          slug: row.slug as Product["slug"],
          name: row.name,
          quantity: line.quantity,
          unitPrice: { amount: row.price_cents, currency: "EUR" },
          lineTotal: { amount: row.price_cents * line.quantity, currency: "EUR" },
          image: primaryImage(row),
          stock: row.stock_status,
          availableQuantity: projectedAvailability(row),
          issue,
        });
        if (!issue) sellable.push({ product_id: row.id, quantity: line.quantity });
      }

      const freeShippingThreshold = selected
        ? ((methodRows.data ?? []).find((method) => method.code === selected.code)?.free_from_cents ?? null)
        : null;

      // Without a sellable line or a shipping option there is nothing the pricing RPC
      // can be asked. Report why plainly instead of inventing a tariff — a disabled
      // button with no explanation is its own kind of lie.
      if (sellable.length === 0 || !selected) {
        return {
          lines,
          missingSlugs,
          shippingOptions,
          shippingCode: selected?.code ?? null,
          totals: emptyTotals(),
          freeShippingThreshold,
          couponCode: null,
          couponError: null,
          orderIntake,
          orderable: false,
          notice: blockedNotice({ hasShipping: Boolean(selected), orderIntake, blocked: lines.length > 0 }),
        };
      }

      let couponError: string | null = null;
      let pricing = await priceCart(client, sellable, selected.code, request.couponCode);
      if (pricing.error && checkoutErrorCode(pricing.error) === "GD_PRICING_COUPON_INVALID") {
        // A bad code must not hide the price of the cart the customer can still buy.
        couponError = checkoutErrorMessage(pricing.error);
        pricing = await priceCart(client, sellable, selected.code, undefined);
      }
      if (pricing.error) {
        return {
          lines,
          missingSlugs,
          shippingOptions,
          shippingCode: selected.code,
          totals: emptyTotals(),
          freeShippingThreshold,
          couponCode: null,
          couponError,
          orderIntake,
          orderable: false,
          notice: checkoutErrorMessage(pricing.error),
        };
      }

      const payload = pricing.data as Record<string, unknown>;
      const subtotal = Number(payload["subtotal_cents"]);
      const discount = Number(payload["discount_cents"]);
      const shipping = Number(payload["shipping_cents"]);
      const total = Number(payload["total_cents"]);
      if (![subtotal, discount, shipping, total].every(Number.isSafeInteger)) {
        throw new Error("Totali autorevoli non validi");
      }

      const threshold = freeShippingThreshold ?? 0;
      const blocked = lines.some((line) => line.issue !== null) || missingSlugs.length > 0;

      return {
        lines,
        missingSlugs,
        shippingOptions,
        shippingCode: selected.code,
        totals: {
          subtotal: { amount: subtotal, currency: "EUR" },
          discount: { amount: discount, currency: "EUR" },
          shipping: { amount: shipping, currency: "EUR" },
          total: { amount: total, currency: "EUR" },
          freeShippingRemaining: threshold > subtotal ? threshold - subtotal : 0,
        },
        freeShippingThreshold,
        couponCode: typeof payload["coupon_code"] === "string" ? payload["coupon_code"] : null,
        couponError,
        orderIntake,
        orderable: orderIntake === "open" && !blocked,
        notice: blockedNotice({ hasShipping: true, orderIntake, blocked }),
      };
    },
  };
}

/** Shape the pricing RPC expects: an id and a quantity, never a price. */
type PricingLine = { product_id: number; quantity: number };

type QuotableProduct = {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly price_cents: number;
  readonly stock_status: StockStatus;
  readonly stock_quantity: number;
  readonly preorder_allocation: number;
  readonly availability_override: string | null;
  readonly is_purchasable: boolean | null;
  readonly images: readonly {
    readonly src: string;
    readonly width: number;
    readonly height: number;
    readonly alt: string;
    readonly sort_order: number;
    readonly is_primary: boolean;
    readonly published: boolean;
  }[];
};

function priceCart(
  client: SupabaseClient<Database>,
  lines: PricingLine[],
  shippingCode: string,
  couponCode: string | undefined,
) {
  return client.rpc("calculate_cart_pricing", {
    p_lines: lines,
    p_shipping_code: shippingCode,
    ...(couponCode ? { p_coupon_code: couponCode } : {}),
  });
}

/**
 * Availability, not money: derived from the authoritative product row so the customer
 * learns which line is the problem instead of getting one opaque failure for the cart.
 */
function lineIssue(row: QuotableProduct, quantity: number): string | null {
  if (!row.is_purchasable) return "Non disponibile: rimuovilo per procedere.";
  const stock = projectedAvailability(row);
  if (quantity > stock) {
    return stock > 0
      ? `Disponibilità insufficiente: ne restano ${stock}.`
      : "Non disponibile: rimuovilo per procedere.";
  }
  return null;
}

function projectedAvailability(row: {
  readonly stock_quantity: number;
  readonly preorder_allocation: number;
  readonly availability_override: string | null;
}): number {
  return row.availability_override === "preorder" ? row.preorder_allocation : row.stock_quantity;
}

function primaryImage(row: QuotableProduct): ProductImage | null {
  const published = row.images.filter((image) => image.published);
  const chosen =
    published.find((image) => image.is_primary) ??
    [...published].sort((a, b) => a.sort_order - b.sort_order)[0];
  if (!chosen) return null;
  return { src: chosen.src, width: chosen.width, height: chosen.height, alt: chosen.alt };
}

/**
 * Why this cart cannot be ordered, most actionable reason first. Null only when nothing
 * is wrong: the checkout disables its button on `orderable`, so a silent null here would
 * leave the customer staring at a dead control.
 */
function blockedNotice(state: {
  readonly hasShipping: boolean;
  readonly orderIntake: OrderIntake;
  readonly blocked: boolean;
}): string | null {
  if (!state.hasShipping) return "Nessun metodo di spedizione è attivo: il checkout non è disponibile.";
  // A closed shop outranks a fixable line: editing the cart would not help.
  if (state.orderIntake !== "open") return "Gli ordini non sono al momento attivi.";
  if (state.blocked) return "Alcuni articoli non sono ordinabili: aggiorna il carrello per procedere.";
  return null;
}

function deliveryEstimate(min: number, max: number): string {
  const transit = min === max ? `${max} giorni` : `${min}-${max} giorni`;
  return `Spedizione entro 14 giorni dalla conferma; transito del corriere: ${transit} dalla spedizione`;
}

function emptyTotals(): CartTotals {
  return {
    subtotal: { amount: 0, currency: "EUR" },
    discount: { amount: 0, currency: "EUR" },
    shipping: { amount: 0, currency: "EUR" },
    total: { amount: 0, currency: "EUR" },
    freeShippingRemaining: 0,
  };
}
