import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { BUNDLES } from "@/data/catalog";

export type RestockDemand = {
  readonly productSlug: string;
  readonly pendingNotices: number;
  readonly preorderDemand: number;
};

export type RestockRequestRow = Database["public"]["Tables"]["restock_requests"]["Row"];

/**
 * Loads restock demand (pending notices + pre-order units to fulfil) for the given product
 * slugs. Bundles are expanded to their component slugs so their pre-order demand is captured.
 *
 * The caller supplies the direct product slugs from the products table; bundles are not rows
 * there, so their demand flows through their component product IDs in order_items. This
 * function adds bundle slugs to the query automatically and re-maps the results.
 *
 * NOTE: restock_requests for a bundle slug (e.g. "duo-horus-enlil") are tracked by the
 * storefront form against the bundle slug itself. The demand RPC returns those counts
 * directly, while the preorder_demand for bundle components is summed over the component
 * slugs and attributed back to the bundle slug here.
 */
export async function getRestockDemand(
  client: SupabaseClient<Database>,
  slugs: readonly string[],
): Promise<readonly RestockDemand[]> {
  if (slugs.length === 0) return [];

  // Expand bundles: collect every component slug that belongs to the requested product slugs.
  // The RPC counts preorder_demand through product_id, so we need the component slugs too.
  const bundleComponentSlugs = new Set<string>();
  // Map bundle slug -> component slugs for re-attribution.
  const bundleComponents = new Map<string, string[]>();
  for (const bundle of BUNDLES) {
    if (slugs.includes(bundle.slug) && bundle.bundleOf) {
      const parts = bundle.bundleOf.map((p) => p.slug);
      bundleComponents.set(bundle.slug, parts);
      for (const s of parts) bundleComponentSlugs.add(s);
    }
  }

  const allSlugs = [...new Set([...slugs, ...bundleComponentSlugs])];

  const { data, error } = await client.rpc("get_inventory_restock_demand", {
    p_slugs: allSlugs,
  });
  if (error) throw new Error("Impossibile caricare i dati di domanda inventario");

  const bySlug = new Map<string, { pendingNotices: number; preorderDemand: number }>(
    (data ?? []).map((row) => [
      row.product_slug,
      {
        pendingNotices: Number(row.pending_notices),
        preorderDemand: Number(row.preorder_demand),
      },
    ]),
  );

  return slugs.map((slug) => {
    const direct = bySlug.get(slug);
    const parts = bundleComponents.get(slug);

    // Pre-order demand for a bundle is the sum of its components' demand.
    const bundlePreorderDemand = parts
      ? parts.reduce((sum, partSlug) => sum + (bySlug.get(partSlug)?.preorderDemand ?? 0), 0)
      : 0;

    return {
      productSlug: slug,
      pendingNotices: direct?.pendingNotices ?? 0,
      preorderDemand: (direct?.preorderDemand ?? 0) + bundlePreorderDemand,
    };
  });
}

/**
 * Reads the restock requests for a given product slug, ordered oldest-first so the
 * notify action sends in arrival order.
 */
export async function listPendingRestockRequests(
  client: SupabaseClient<Database>,
  productSlug: string,
): Promise<readonly RestockRequestRow[]> {
  const { data, error } = await client
    .from("restock_requests")
    .select("*")
    .eq("product_slug", productSlug)
    .is("notified_at", null)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new Error("Impossibile caricare le richieste di avviso");
  return data ?? [];
}
