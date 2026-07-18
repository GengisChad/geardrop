import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type MovementRow = Database["public"]["Tables"]["inventory_movements"]["Row"];

export type AdminInventoryQuery = {
  readonly q: string;
  readonly lowStock: boolean;
  readonly productId: number | null;
  readonly page: number;
  readonly pageSize: number;
};

export type AdminInventoryMovement = MovementRow & {
  readonly productName: string;
  readonly productSku: string;
};

export type AdminInventoryPage = {
  readonly items: readonly ProductRow[];
  readonly movements: readonly AdminInventoryMovement[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly pageCount: number;
};

type QueryRecord = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function normalizeAdminInventoryQuery(input: QueryRecord): AdminInventoryQuery {
  const page = Number.parseInt(first(input.page) ?? "1", 10);
  const pageSize = Number.parseInt(first(input.pageSize) ?? "20", 10);
  const productId = Number.parseInt(first(input.product) ?? "", 10);
  return {
    q: (first(input.q) ?? "").trim().slice(0, 100),
    lowStock: first(input.lowStock) === "true",
    productId: Number.isSafeInteger(productId) && productId > 0 ? productId : null,
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    pageSize: Number.isSafeInteger(pageSize) ? Math.min(50, Math.max(10, pageSize)) : 20,
  };
}

function escapePostgrestPattern(value: string): string {
  return value.replace(/[,%_()]/g, (character) => `\\${character}`);
}

export async function listAdminInventory(
  client: SupabaseClient<Database>,
  query: AdminInventoryQuery,
): Promise<AdminInventoryPage> {
  const from = (query.page - 1) * query.pageSize;
  const to = from + query.pageSize - 1;
  let productsQuery = client.from("products").select("*", { count: "exact" });

  if (query.q) {
    const pattern = `%${escapePostgrestPattern(query.q)}%`;
    productsQuery = productsQuery.or(`name.ilike.${pattern},sku.ilike.${pattern},slug.ilike.${pattern}`);
  }
  if (query.lowStock) productsQuery = productsQuery.eq("is_low_stock", true);
  if (query.productId !== null) productsQuery = productsQuery.eq("id", query.productId);

  let movementsQuery = client
    .from("inventory_movements")
    .select("*, product:products(name,sku)")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(50);
  if (query.productId !== null) movementsQuery = movementsQuery.eq("product_id", query.productId);

  const [productsResult, movementsResult] = await Promise.all([
    productsQuery.order("updated_at", { ascending: false }).order("id", { ascending: false }).range(from, to),
    movementsQuery,
  ]);
  if (productsResult.error || movementsResult.error) {
    throw new Error("Impossibile caricare l'inventario amministrativo");
  }

  type MovementWithProduct = MovementRow & {
    readonly product: { readonly name: string; readonly sku: string } | readonly { readonly name: string; readonly sku: string }[] | null;
  };
  const movements = ((movementsResult.data ?? []) as unknown as readonly MovementWithProduct[]).map((movement) => {
    const product = Array.isArray(movement.product) ? movement.product[0] : movement.product;
    return {
      actor_user_id: movement.actor_user_id,
      created_at: movement.created_at,
      delta: movement.delta,
      id: movement.id,
      note: movement.note,
      order_id: movement.order_id,
      product_id: movement.product_id,
      reason: movement.reason,
      stock_after: movement.stock_after,
      productName: product?.name ?? "Prodotto rimosso",
      productSku: product?.sku ?? "—",
    };
  });
  const total = productsResult.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / query.pageSize));

  return {
    items: productsResult.data ?? [],
    movements,
    total,
    page: Math.min(query.page, pageCount),
    pageSize: query.pageSize,
    pageCount,
  };
}
