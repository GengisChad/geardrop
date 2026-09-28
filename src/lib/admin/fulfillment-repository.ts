import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { shippingAddress, type PickableLine, type ShippingAddress } from "@/lib/admin/fulfillment";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;
type OrderRow = Database["public"]["Tables"]["orders"]["Row"];

export type FulfilmentOrder = {
  readonly id: number;
  readonly orderNumber: string;
  readonly status: OrderRow["status"];
  readonly createdAt: string;
  readonly email: string;
  readonly shippingMethodCode: string;
  readonly notes: string | null;
  readonly address: ShippingAddress;
  readonly lines: readonly (PickableLine & { readonly imageSrc: string; readonly productId: number | null })[];
};

export type SenderAddress = {
  readonly name: string;
  readonly street: string;
  readonly postalCode: string;
  readonly city: string;
  readonly country: string;
  readonly phone: string;
};

const ORDER_COLUMNS = "id,order_number,status,created_at,email,shipping_method_code,notes,shipping_address_snapshot";

async function withLines(client: Client, organizationId: number, orders: readonly Pick<OrderRow,
  "id" | "order_number" | "status" | "created_at" | "email" | "shipping_method_code" | "notes" | "shipping_address_snapshot">[]):
  Promise<readonly FulfilmentOrder[]> {
  if (orders.length === 0) return [];
  const items = await client.from("order_items")
    .select("order_id,product_id,product_name_snapshot,sku_snapshot,quantity,preorder_quantity,image_src_snapshot")
    .eq("organization_id", organizationId).in("order_id", orders.map((order) => order.id)).order("id");
  if (items.error) throw new Error("Impossibile caricare le righe da preparare");
  const linesByOrder = new Map<number, FulfilmentOrder["lines"][number][]>();
  for (const item of items.data ?? []) {
    const lines = linesByOrder.get(item.order_id) ?? [];
    lines.push({
      sku: item.sku_snapshot,
      name: item.product_name_snapshot,
      quantity: item.quantity,
      preorderQuantity: item.preorder_quantity,
      imageSrc: item.image_src_snapshot,
      productId: item.product_id,
    });
    linesByOrder.set(item.order_id, lines);
  }
  return orders.map((order) => ({
    id: order.id,
    orderNumber: order.order_number,
    status: order.status,
    createdAt: order.created_at,
    email: order.email,
    shippingMethodCode: order.shipping_method_code,
    notes: order.notes,
    address: shippingAddress(order.shipping_address_snapshot),
    lines: linesByOrder.get(order.id) ?? [],
  }));
}

/** Paid orders not yet shipped, oldest first: what the warehouse has to pack. */
export async function listOrdersToFulfil(client: Client, organizationId: number): Promise<readonly FulfilmentOrder[]> {
  const { data, error } = await client.from("orders").select(ORDER_COLUMNS).eq("organization_id", organizationId)
    .eq("payment_status", "paid").in("status", ["confirmed", "processing"])
    .order("created_at", { ascending: true }).order("id", { ascending: true }).limit(200);
  if (error) throw new Error("Impossibile caricare gli ordini da preparare");
  return withLines(client, organizationId, data ?? []);
}

export async function loadOrdersForPrint(client: Client, organizationId: number, ids: readonly number[]): Promise<readonly FulfilmentOrder[]> {
  if (ids.length === 0) return [];
  const { data, error } = await client.from("orders").select(ORDER_COLUMNS).eq("organization_id", organizationId)
    .in("id", [...ids]).order("created_at", { ascending: true }).order("id", { ascending: true });
  if (error) throw new Error("Impossibile caricare gli ordini da stampare");
  return withLines(client, organizationId, data ?? []);
}

/** The sender block of the label: the company's own contact settings. */
export async function loadSenderAddress(client: Client, organizationId: number): Promise<SenderAddress> {
  const [settings, organization] = await Promise.all([
    client.from("site_settings")
      .select("store_name,legal_name,street_address,postal_code,city,country_code,support_phone")
      .eq("organization_id", organizationId).single(),
    client.from("organizations").select("name").eq("id", organizationId).single(),
  ]);
  if (settings.error || organization.error) throw new Error("Impossibile caricare il mittente");
  const data = settings.data;
  return {
    name: data.store_name || data.legal_name || organization.data.name,
    street: data.street_address ?? "",
    postalCode: data.postal_code ?? "",
    city: data.city ?? "",
    country: data.country_code,
    phone: data.support_phone ?? "",
  };
}
