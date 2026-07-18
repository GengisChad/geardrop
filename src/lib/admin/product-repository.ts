import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminProductQuery } from "@/lib/admin/products";
import type { Database } from "@/lib/supabase/database.types";

type ProductRow = Database["public"]["Tables"]["products"]["Row"];
export type AdminCategory = Pick<Database["public"]["Tables"]["categories"]["Row"], "id" | "name" | "slug" | "active">;

export type AdminProductListItem = ProductRow & {
  readonly categoryName: string;
  readonly primaryImage: string | null;
};

export type AdminProductListPage = {
  readonly items: readonly AdminProductListItem[];
  readonly categories: readonly AdminCategory[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly pageCount: number;
};

export type AdminProductEditorData = {
  readonly product: ProductRow;
  readonly categories: readonly AdminCategory[];
  readonly images: readonly Database["public"]["Tables"]["product_images"]["Row"][];
  readonly specs: readonly Database["public"]["Tables"]["product_specs"]["Row"][];
  readonly features: readonly Database["public"]["Tables"]["product_features"]["Row"][];
  readonly boxContents: readonly Database["public"]["Tables"]["product_box_contents"]["Row"][];
  readonly tags: readonly Database["public"]["Tables"]["product_tags"]["Row"][];
  readonly relations: readonly Database["public"]["Tables"]["product_relations"]["Row"][];
  readonly relationCandidates: readonly Pick<ProductRow, "id" | "name" | "sku">[];
};

export type ProductDeletionImpact = {
  readonly orders: number;
  readonly bundles: number;
  readonly relations: number;
  readonly images: number;
  readonly specs: number;
  readonly features: number;
  readonly boxContents: number;
  readonly tags: number;
  readonly inventoryMovements: number;
};

const listSelect = "*, category:categories(name), images:product_images(src,is_primary,sort_order,media_asset:media_assets(status))";

const sortColumns: Record<AdminProductQuery["sort"], { readonly column: string; readonly ascending: boolean }> = {
  "updated-desc": { column: "updated_at", ascending: false },
  "updated-asc": { column: "updated_at", ascending: true },
  "name-asc": { column: "name", ascending: true },
  "price-asc": { column: "price_cents", ascending: true },
  "price-desc": { column: "price_cents", ascending: false },
  "stock-asc": { column: "stock_quantity", ascending: true },
};

function escapePostgrestPattern(value: string): string {
  return value.replace(/[,%_()]/g, (character) => `\\${character}`);
}

export async function listAdminProducts(
  client: SupabaseClient<Database>,
  query: AdminProductQuery,
): Promise<AdminProductListPage> {
  const pageSize = Math.min(50, Math.max(10, query.pageSize));
  const from = (query.page - 1) * pageSize;
  const to = from + pageSize - 1;
  const sort = sortColumns[query.sort];
  let productsQuery = client
    .from("products")
    .select(listSelect, { count: "exact" })
    .eq("images.is_primary", true)
    .eq("images.media_asset.status", "ready");

  if (query.q) {
    const pattern = `%${escapePostgrestPattern(query.q)}%`;
    productsQuery = productsQuery.or(
      `name.ilike.${pattern},short_name.ilike.${pattern},sku.ilike.${pattern},slug.ilike.${pattern}`,
    );
  }
  if (query.publication !== "all") {
    productsQuery = productsQuery.eq("publication_status", query.publication);
  }
  if (query.availability !== "all") {
    productsQuery = productsQuery.eq("stock_status", query.availability);
  }
  if (query.category !== null) {
    productsQuery = productsQuery.eq("category_id", query.category);
  }
  if (query.lowStock) {
    productsQuery = productsQuery.eq("is_low_stock", true);
  }

  const [productsResult, categoriesResult] = await Promise.all([
    productsQuery.order(sort.column, { ascending: sort.ascending }).order("id", { ascending: sort.ascending }).range(from, to),
    client.from("categories").select("id,name,slug,active").order("sort_order"),
  ]);

  if (productsResult.error || categoriesResult.error) {
    throw new Error("Impossibile caricare il catalogo amministrativo");
  }

  type ListRow = ProductRow & {
    readonly category: { readonly name: string } | readonly { readonly name: string }[] | null;
    readonly images: readonly {
      readonly src: string;
      readonly is_primary: boolean;
      readonly sort_order: number;
      readonly media_asset: { readonly status: string } | readonly { readonly status: string }[] | null;
    }[];
  };
  const rows = (productsResult.data ?? []) as unknown as readonly ListRow[];
  const items = rows.map((row) => {
    const category = Array.isArray(row.category) ? row.category[0] : row.category;
    const primaryImage = row.images.find((image) => {
      const mediaAsset = Array.isArray(image.media_asset) ? image.media_asset[0] : image.media_asset;
      return image.is_primary && mediaAsset?.status === "ready";
    });
    const product = { ...row } as ProductRow & {
      category?: ListRow["category"];
      images?: ListRow["images"];
    };
    delete product.category;
    delete product.images;
    return {
      ...product,
      categoryName: category?.name ?? "Categoria rimossa",
      primaryImage: primaryImage?.src ?? null,
    } as AdminProductListItem;
  });

  const total = productsResult.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(query.page, pageCount);

  return {
    items,
    categories: categoriesResult.data ?? [],
    total,
    page,
    pageSize,
    pageCount,
  };
}

export async function loadAdminProductEditor(
  client: SupabaseClient<Database>,
  id: number,
): Promise<AdminProductEditorData | null> {
  const [product, categories, images, specs, features, boxContents, tags, relations, candidates] = await Promise.all([
    client.from("products").select("*").eq("id", id).maybeSingle(),
    client.from("categories").select("id,name,slug,active").order("sort_order"),
    client.from("product_images").select("*").eq("product_id", id).order("sort_order"),
    client.from("product_specs").select("*").eq("product_id", id).order("sort_order"),
    client.from("product_features").select("*").eq("product_id", id).order("sort_order"),
    client.from("product_box_contents").select("*").eq("product_id", id).order("sort_order"),
    client.from("product_tags").select("*").eq("product_id", id),
    client.from("product_relations").select("*").eq("product_id", id).order("sort_order"),
    client.from("products").select("id,name,sku").neq("id", id).order("name").limit(200),
  ]);

  const results = [product, categories, images, specs, features, boxContents, tags, relations, candidates];
  if (results.some((result) => result.error)) throw new Error("Impossibile caricare il prodotto");
  if (!product.data) return null;
  return {
    product: product.data,
    categories: categories.data ?? [],
    images: images.data ?? [],
    specs: specs.data ?? [],
    features: features.data ?? [],
    boxContents: boxContents.data ?? [],
    tags: tags.data ?? [],
    relations: relations.data ?? [],
    relationCandidates: candidates.data ?? [],
  };
}

export async function loadAdminProductCreateContext(client: SupabaseClient<Database>) {
  const { data, error } = await client.from("categories").select("id,name,slug,active").order("sort_order");
  if (error) throw new Error("Impossibile caricare le categorie");
  return data ?? [];
}

export async function loadProductDeletionImpact(
  client: SupabaseClient<Database>,
  id: number,
): Promise<ProductDeletionImpact> {
  const { data, error } = await client.rpc("product_deletion_impact", { p_product_id: id });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Impossibile verificare le dipendenze del prodotto");
  }

  const value = data as Record<string, unknown>;
  const count = (key: string): number => {
    const candidate = value[key];
    return typeof candidate === "number" && Number.isSafeInteger(candidate) && candidate >= 0 ? candidate : 0;
  };
  return {
    orders: count("orders"),
    bundles: count("bundles"),
    relations: count("relations"),
    images: count("images"),
    specs: count("specs"),
    features: count("features"),
    boxContents: count("box_contents"),
    tags: count("tags"),
    inventoryMovements: count("inventory_movements"),
  };
}

export async function listAdminProductsForCsv(client: SupabaseClient<Database>) {
  const { data, error } = await client.from("products").select("id,name,sku,slug,publication_status,active,stock_status,stock_quantity,price_cents,updated_at").order("updated_at", { ascending: false });
  if (error) throw new Error("Impossibile esportare il catalogo");
  return data ?? [];
}
