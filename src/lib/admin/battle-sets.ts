import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Opened Battle Sets in the panel: sealed sets on the shelf, and of each piece the ones already
 * out of their set. What the shop can sell of a piece is those loose ones plus the sealed sets.
 */

export type BattleSetPiece = { readonly slug: string; readonly name: string; readonly loose: number; readonly available: number };
export type BattleSetView = { readonly slug: string; readonly name: string; readonly sealed: number; readonly pieces: readonly BattleSetPiece[] };

export async function loadBattleSets(client: SupabaseClient<Database>): Promise<readonly BattleSetView[]> {
  const links = await client.from("battle_set_parts").select("set_product_id,part_product_id,loose");
  if (links.error || links.data.length === 0) return [];
  const ids = [...new Set(links.data.flatMap((link) => [link.set_product_id, link.part_product_id]))];
  const products = await client.from("products").select("id,slug,name,stock_quantity").in("id", ids);
  if (products.error) return [];
  const byId = new Map(products.data.map((product) => [product.id, product]));

  const sets = new Map<number, BattleSetView & { pieces: BattleSetPiece[] }>();
  for (const link of links.data) {
    const set = byId.get(link.set_product_id);
    const piece = byId.get(link.part_product_id);
    if (!set || !piece) continue;
    const view = sets.get(set.id) ?? { slug: set.slug, name: set.name, sealed: set.stock_quantity, pieces: [] };
    view.pieces.push({ slug: piece.slug, name: piece.name, loose: link.loose, available: piece.stock_quantity });
    sets.set(set.id, view);
  }
  return [...sets.values()].map((view) => ({ ...view, pieces: [...view.pieces].sort((a, b) => a.name.localeCompare(b.name, "it")) }));
}

export const openBattleSetsSchema = z.object({
  setSlug: z.string().min(1).max(160),
  count: z.coerce.number().int().min(1).max(1000),
});

export const countBattleSetSchema = z.object({
  setSlug: z.string().min(1).max(160),
  sealed: z.coerce.number().int().min(0).max(10000),
  loose: z.record(z.string().min(1).max(160), z.coerce.number().int().min(0).max(99999)),
});
