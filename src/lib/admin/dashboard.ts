import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type DashboardProduct = Pick<
  Database["public"]["Tables"]["products"]["Row"],
  | "availability_override"
  | "low_stock_threshold"
  | "manage_stock"
  | "publication_status"
  | "stock_quantity"
  | "stock_status"
>;

export type DashboardMetrics = {
  readonly total: number;
  readonly published: number;
  readonly draft: number;
  readonly archived: number;
  readonly soldOut: number;
  readonly lowStock: number;
  readonly preorder: number;
};

export type DashboardMovement = {
  readonly id: number;
  readonly delta: number;
  readonly stockAfter: number;
  readonly reason: string;
  readonly note: string | null;
  readonly createdAt: string;
  readonly productName: string;
  readonly sku: string;
};

export type DashboardData = {
  readonly metrics: DashboardMetrics;
  readonly movements: readonly DashboardMovement[];
};

export function summarizeDashboardProducts(products: readonly DashboardProduct[]): DashboardMetrics {
  return products.reduce<DashboardMetrics>(
    (metrics, product) => ({
      total: metrics.total + 1,
      published: metrics.published + Number(product.publication_status === "published"),
      draft: metrics.draft + Number(product.publication_status === "draft"),
      archived: metrics.archived + Number(product.publication_status === "archived"),
      soldOut:
        metrics.soldOut +
        Number(
          product.manage_stock &&
            product.stock_status === "esaurito" &&
            product.publication_status !== "archived",
        ),
      lowStock:
        metrics.lowStock +
        Number(
          product.manage_stock &&
            product.stock_quantity > 0 &&
            product.stock_quantity <= product.low_stock_threshold &&
            product.publication_status !== "archived",
        ),
      preorder: metrics.preorder + Number(product.availability_override === "preorder"),
    }),
    { total: 0, published: 0, draft: 0, archived: 0, soldOut: 0, lowStock: 0, preorder: 0 },
  );
}

export async function loadAdminDashboard(client: SupabaseClient<Database>): Promise<DashboardData> {
  const [productsResult, movementsResult] = await Promise.all([
    client
      .from("products")
      .select(
        "publication_status, stock_quantity, stock_status, manage_stock, low_stock_threshold, availability_override",
      ),
    client
      .from("inventory_movements")
      .select("id, delta, stock_after, reason, note, created_at, product:products(name, sku)")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  if (productsResult.error || movementsResult.error) {
    throw new Error("Impossibile caricare i dati operativi della dashboard");
  }

  const movements: DashboardMovement[] = (movementsResult.data ?? []).map((movement) => ({
    id: movement.id,
    delta: movement.delta,
    stockAfter: movement.stock_after,
    reason: movement.reason,
    note: movement.note,
    createdAt: movement.created_at,
    productName: movement.product?.name ?? "Prodotto non disponibile",
    sku: movement.product?.sku ?? "—",
  }));

  return {
    metrics: summarizeDashboardProducts(productsResult.data ?? []),
    movements,
  };
}
