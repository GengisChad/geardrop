import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { SLOW_DAYS, type OwnerToolsStore, type PriceProposal, type SlowPiece, type StockRow } from "./owner-tools";

/**
 * The owner's stock and price tools on the shop's tables (migration 20261128100000). Reads use the
 * server's key and name the shop's company; the two moves go through the server-only functions
 * telegram_adjust_inventory and telegram_apply_pricing_proposal, which record the movement and the
 * audit trail as the back office does.
 */

type Client = SupabaseClient<Database>;

function check(error: { readonly message: string } | null, what: string): void {
  if (error) throw new Error(`telegram owner tools, ${what}: ${error.message}`);
}

export function createSupabaseOwnerToolsStore(client: Client, organizationId: () => Promise<number>): OwnerToolsStore {
  const products = async (shop: number): Promise<(StockRow & { readonly createdAt: string })[]> => {
    const result = await client
      .from("products")
      .select("id,slug,name,sku,stock_quantity,preorder_allocation,price_cents,publication_status,created_at")
      .eq("organization_id", shop)
      .order("name")
      .limit(1000);
    check(result.error, "products");
    return (result.data ?? []).map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      sku: row.sku,
      stock: row.stock_quantity,
      preorderAllocation: row.preorder_allocation,
      priceCents: row.price_cents,
      published: row.publication_status === "published",
      createdAt: row.created_at,
    }));
  };

  return {
    async products() {
      return products(await organizationId());
    },
    async adjust(productId, delta, requestKey) {
      const shop = await organizationId();
      const result = await client.rpc("telegram_adjust_inventory", {
        p_organization_id: shop,
        p_product_id: productId,
        p_delta: delta,
        p_request_key: requestKey,
      });
      if (result.error) throw new Error(result.error.message);
      return result.data ?? null;
    },
    async applyProposal(proposalId, requestKey) {
      const shop = await organizationId();
      const result = await client.rpc("telegram_apply_pricing_proposal", { p_organization_id: shop, p_proposal_id: proposalId, p_request_key: requestKey });
      if (result.error) throw new Error(result.error.message);
      return result.data ?? null;
    },
    async slowPieces(now) {
      const shop = await organizationId();
      const since = new Date(now.getTime() - SLOW_DAYS * 86_400_000).toISOString();
      const yearAgo = new Date(now.getTime() - 365 * 86_400_000).toISOString();
      const [shelf, sales, loads, proposals] = await Promise.all([
        products(shop),
        client.from("orders").select("created_at,order_items(product_id)").eq("organization_id", shop).eq("payment_status", "paid").gte("created_at", yearAgo).limit(5000),
        client.from("inventory_movements").select("product_id").eq("organization_id", shop).gt("delta", 0).gte("created_at", since).limit(5000),
        client.from("pricing_proposals").select("id,product_id,proposed_price_cents,out_of_policy").eq("organization_id", shop).eq("status", "pending").limit(1000),
      ]);
      check(sales.error, "sales");
      check(loads.error, "loads");
      check(proposals.error, "proposals");

      const lastSale = new Map<number, string>();
      for (const order of sales.data ?? []) {
        for (const line of order.order_items ?? []) {
          if (line.product_id === null) continue;
          const seen = lastSale.get(line.product_id);
          if (!seen || seen < order.created_at) lastSale.set(line.product_id, order.created_at);
        }
      }
      const loaded = new Set((loads.data ?? []).map((row) => row.product_id));
      const proposalFor = new Map<number, PriceProposal>(
        (proposals.data ?? []).map((row) => [row.product_id, { id: row.id, priceCents: row.proposed_price_cents, outOfPolicy: row.out_of_policy }]),
      );

      return shelf
        .filter((row) => row.published && row.stock > 0)
        // Arrived or loaded within the month: too early to call it slow.
        .filter((row) => row.createdAt < since && !loaded.has(row.id))
        .filter((row) => (lastSale.get(row.id) ?? "") < since)
        .map(({ createdAt: _createdAt, ...row }): SlowPiece => ({ ...row, lastSaleAt: lastSale.get(row.id) ?? null, proposal: proposalFor.get(row.id) ?? null }));
    },
  };
}
