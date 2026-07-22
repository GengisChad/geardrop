import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadAdminCategoryCreateContext, type AdminReadyCatalogMedia } from "@/lib/admin/category-repository";
import type { Database } from "@/lib/supabase/database.types";

type BundleRow = Database["public"]["Tables"]["bundles"]["Row"];
type ProductOption = Pick<Database["public"]["Tables"]["products"]["Row"], "id" | "name" | "sku" | "publication_status">;

export type AdminBundleListItem = BundleRow & {
  readonly itemCount: number;
  readonly heroName: string;
  readonly previewUrl: string | null;
};

export type AdminBundleEditorData = {
  readonly bundle: BundleRow;
  readonly items: readonly Database["public"]["Tables"]["bundle_items"]["Row"][];
  readonly products: readonly ProductOption[];
  readonly readyMedia: readonly AdminReadyCatalogMedia[];
};

export async function listAdminBundles(client: SupabaseClient<Database>) {
  const [bundles, media] = await Promise.all([
    client.from("bundles").select("*", { count: "exact" }).order("sort_order").order("id"),
    loadAdminCategoryCreateContext(client),
  ]);
  if (bundles.error) throw new Error("Impossibile caricare i bundle");
  if (!bundles.data?.length) return { items: [], total: 0 } as const;
  const bundleIds = bundles.data.map((bundle) => bundle.id);
  const heroIds = [...new Set(bundles.data.map((bundle) => bundle.hero_product_id))];
  const [bundleItems, heroes] = await Promise.all([
    client.from("bundle_items").select("bundle_id").in("bundle_id", bundleIds),
    client.from("products").select("id,name").in("id", heroIds),
  ]);
  if (bundleItems.error || heroes.error) throw new Error("Impossibile caricare i dettagli bundle");
  const previewById = new Map(media.map((item) => [item.id, item.previewUrl]));
  const itemCountByBundle = new Map<number, number>();
  for (const item of bundleItems.data ?? []) itemCountByBundle.set(item.bundle_id, (itemCountByBundle.get(item.bundle_id) ?? 0) + 1);
  const heroById = new Map((heroes.data ?? []).map((hero) => [hero.id, hero.name]));
  const items = bundles.data.map((bundle) => ({
    ...bundle,
    itemCount: itemCountByBundle.get(bundle.id) ?? 0,
    heroName: heroById.get(bundle.hero_product_id) ?? "Prodotto rimosso",
    previewUrl: bundle.media_asset_id ? previewById.get(bundle.media_asset_id) ?? null : null,
  }));
  return { items, total: bundles.count ?? 0 } as const;
}

async function productOptions(client: SupabaseClient<Database>) {
  const result = await client.from("products").select("id,name,sku,publication_status").order("name").limit(500);
  if (result.error) throw new Error("Impossibile caricare i prodotti bundle");
  return result.data ?? [];
}

export async function loadAdminBundleEditor(
  client: SupabaseClient<Database>,
  id: number,
): Promise<AdminBundleEditorData | null> {
  const [bundle, items, products, media] = await Promise.all([
    client.from("bundles").select("*").eq("id", id).maybeSingle(),
    client.from("bundle_items").select("*").eq("bundle_id", id).order("sort_order"),
    productOptions(client),
    loadAdminCategoryCreateContext(client),
  ]);
  if (bundle.error || items.error) throw new Error("Impossibile caricare il bundle");
  if (!bundle.data) return null;
  return { bundle: bundle.data, items: items.data ?? [], products, readyMedia: media };
}

export async function loadAdminBundleCreateContext(client: SupabaseClient<Database>) {
  const [products, readyMedia] = await Promise.all([productOptions(client), loadAdminCategoryCreateContext(client)]);
  return { products, readyMedia } as const;
}
