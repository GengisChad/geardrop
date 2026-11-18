import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { StockCountRow } from "@/lib/admin/stock-count";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

/**
 * Every product with its stock and the pieces of paid, unshipped orders still on the shelf.
 * Pre-ordered pieces are not on the shelf yet, so they do not count.
 */
export async function loadStockCountRows(client: Client, organizationId: number): Promise<readonly StockCountRow[]> {
  const [products, orders] = await Promise.all([
    client
      .from("products")
      .select("id,name,sku,stock_quantity,low_stock_threshold,manage_stock,active")
      .eq("organization_id", organizationId)
      .order("active", { ascending: false })
      .order("name", { ascending: true })
      .limit(500),
    client
      .from("orders")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("payment_status", "paid")
      .in("status", ["confirmed", "processing"])
      .limit(500),
  ]);
  if (products.error || orders.error) throw new Error("Impossibile caricare il magazzino da contare");

  const onOrders = new Map<number, number>();
  const orderIds = (orders.data ?? []).map((order) => order.id);
  if (orderIds.length > 0) {
    const items = await client
      .from("order_items")
      .select("product_id,quantity,preorder_quantity")
      .eq("organization_id", organizationId)
      .in("order_id", orderIds);
    if (items.error) throw new Error("Impossibile caricare gli ordini da spedire");
    for (const item of items.data ?? []) {
      if (!item.product_id) continue;
      const onShelf = Math.max(0, item.quantity - item.preorder_quantity);
      onOrders.set(item.product_id, (onOrders.get(item.product_id) ?? 0) + onShelf);
    }
  }

  return (products.data ?? []).map((product) => ({
    productId: product.id,
    name: product.name,
    sku: product.sku,
    stock: product.stock_quantity,
    onOrders: onOrders.get(product.id) ?? 0,
    lowStockThreshold: product.low_stock_threshold,
    manageStock: product.manage_stock,
    active: product.active,
  }));
}
