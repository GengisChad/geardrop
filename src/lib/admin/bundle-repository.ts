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
    client.from("bundles").select("*, bundle_items(count), hero:products(name)", { count: "exact" }).order("sort_order").order("id"),
    loadAdminCategoryCreateContext(client),
  ]);
  if (bundles.error) throw new Error("Impossibile caricare i bundle");
  const previewById = new Map(media.map((item) => [item.id, item.previewUrl]));
  type Row = BundleRow & { bundle_items: readonly { count: number }[]; hero: { name: string } | readonly { name: string }[] | null };
  const items = ((bundles.data ?? []) as unknown as readonly Row[]).map(({ bundle_items, hero, ...bundle }) => ({
    ...bundle,
    itemCount: bundle_items[0]?.count ?? 0,
    heroName: (Array.isArray(hero) ? hero[0]?.name : (hero as { readonly name: string } | null)?.name) ?? "Prodotto rimosso",
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
