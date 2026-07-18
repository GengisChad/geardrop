import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];

export type AdminReadyCatalogMedia = {
  readonly id: number;
  readonly altText: string;
  readonly originalFilename: string;
  readonly previewUrl: string;
};

export type AdminCategoryListItem = CategoryRow & {
  readonly productCount: number;
  readonly previewUrl: string | null;
};

export type AdminCategoryEditorData = {
  readonly category: CategoryRow;
  readonly products: readonly Pick<Database["public"]["Tables"]["products"]["Row"], "id" | "name" | "sku" | "publication_status">[];
  readonly readyMedia: readonly AdminReadyCatalogMedia[];
};

async function readyMedia(client: SupabaseClient<Database>): Promise<readonly AdminReadyCatalogMedia[]> {
  const { data, error } = await client.from("media_assets")
    .select("id,object_path,original_filename,alt_text")
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error("Impossibile caricare i media pronti");
  return (await Promise.all((data ?? []).map(async (media) => {
    const signed = await client.storage.from("product-images").createSignedUrl(media.object_path, 300);
    if (signed.error) return null;
    return { id: media.id, altText: media.alt_text, originalFilename: media.original_filename, previewUrl: signed.data.signedUrl };
  }))).filter((media): media is AdminReadyCatalogMedia => media !== null);
}

export async function listAdminCategories(client: SupabaseClient<Database>) {
  const [categories, media] = await Promise.all([
    client.from("categories").select("*, products(count)", { count: "exact" }).order("sort_order").order("id"),
    readyMedia(client),
  ]);
  if (categories.error) throw new Error("Impossibile caricare le categorie");
  const previewById = new Map(media.map((item) => [item.id, item.previewUrl]));
  type Row = CategoryRow & { products: readonly { count: number }[] };
  const items = ((categories.data ?? []) as unknown as readonly Row[]).map(({ products, ...category }) => ({
    ...category,
    productCount: products[0]?.count ?? 0,
    previewUrl: category.media_asset_id ? previewById.get(category.media_asset_id) ?? null : null,
  }));
  return { items, total: categories.count ?? 0 } as const;
}

export async function loadAdminCategoryEditor(
  client: SupabaseClient<Database>,
  id: number,
): Promise<AdminCategoryEditorData | null> {
  const [category, products, media] = await Promise.all([
    client.from("categories").select("*").eq("id", id).maybeSingle(),
    client.from("products").select("id,name,sku,publication_status").eq("category_id", id).order("name"),
    readyMedia(client),
  ]);
  if (category.error || products.error) throw new Error("Impossibile caricare la categoria");
  if (!category.data) return null;
  return { category: category.data, products: products.data ?? [], readyMedia: media };
}

export async function loadAdminCategoryCreateContext(client: SupabaseClient<Database>) {
  return readyMedia(client);
}

