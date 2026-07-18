import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";

export type PricingOption = { readonly id: number; readonly label: string; readonly meta: string };
export type PricingResources = { readonly products: readonly PricingOption[]; readonly categories: readonly PricingOption[]; readonly bundles: readonly PricingOption[] };
type Promotion = Database["public"]["Tables"]["promotions"]["Row"];
export type PromotionEditorData = { readonly promotion: Promotion; readonly productIds: readonly number[]; readonly categoryIds: readonly number[]; readonly bundleIds: readonly number[]; readonly affectedProducts: readonly PricingOption[] };

export async function loadPricingResources(client: SupabaseClient<Database>): Promise<PricingResources> {
  const [products, categories, bundles] = await Promise.all([
    client.from("products").select("id,name,sku").order("name").limit(500),
    client.from("categories").select("id,name,slug").order("name").limit(200),
    client.from("bundles").select("id,title_line_one,title_line_two,slug").order("title_line_one").limit(200),
  ]);
  if (products.error || categories.error || bundles.error) throw new Error("Impossibile caricare i target pricing");
  return {
    products: (products.data ?? []).map((item) => ({ id: item.id, label: item.name, meta: item.sku })),
    categories: (categories.data ?? []).map((item) => ({ id: item.id, label: item.name, meta: item.slug })),
    bundles: (bundles.data ?? []).map((item) => ({ id: item.id, label: `${item.title_line_one} ${item.title_line_two}`, meta: item.slug })),
  };
}

export async function listPromotions(client: SupabaseClient<Database>) {
  const result = await client.from("promotions").select("*").order("priority", { ascending: false }).order("id");
  if (result.error) throw new Error("Impossibile caricare le promozioni");
  return result.data ?? [];
}

export async function loadPromotionEditor(client: SupabaseClient<Database>, id: number): Promise<PromotionEditorData | null> {
  const [promotion, products, categories, bundles, resources] = await Promise.all([
    client.from("promotions").select("*").eq("id", id).maybeSingle(),
    client.from("promotion_products").select("product_id").eq("promotion_id", id),
    client.from("promotion_categories").select("category_id").eq("promotion_id", id),
    client.from("promotion_bundles").select("bundle_id").eq("promotion_id", id),
    loadPricingResources(client),
  ]);
  if (promotion.error || products.error || categories.error || bundles.error) throw new Error("Impossibile caricare la promozione");
  if (!promotion.data) return null;
  const productIds = products.data?.map((item) => item.product_id) ?? [];
  const categoryIds = categories.data?.map((item) => item.category_id) ?? [];
  const bundleIds = bundles.data?.map((item) => item.bundle_id) ?? [];
  const affectedProducts = resources.products.filter((product) => productIds.includes(product.id));
  return { promotion: promotion.data, productIds, categoryIds, bundleIds, affectedProducts };
}

export async function previewAuthoritativePricing(client: SupabaseClient<Database>, productId: number, shippingCode: string): Promise<Json> {
  const result = await client.rpc("calculate_cart_pricing", { p_lines: [{ product_id: productId, quantity: 1 }], p_shipping_code: shippingCode });
  if (result.error) throw new Error("Anteprima prezzo non disponibile");
  return result.data;
}
