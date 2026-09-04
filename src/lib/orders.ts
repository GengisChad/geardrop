import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/** Lifecycle labels shared by the account history and the back-office. */
export const ORDER_STATUS_LABELS = {
  pending: "In attesa",
  confirmed: "Confermato",
  fulfilled: "Evaso",
  cancelled: "Annullato",
  refunded: "Rimborsato",
} as const;

export const PAYMENT_STATUS_LABELS = {
  unpaid: "Da pagare",
  paid: "Pagato",
  refunded: "Rimborsato",
} as const;

export type OrderStatus = keyof typeof ORDER_STATUS_LABELS;
export type PaymentStatus = keyof typeof PAYMENT_STATUS_LABELS;

export const ORDER_STATUSES = Object.keys(ORDER_STATUS_LABELS) as readonly OrderStatus[];
export const PAYMENT_STATUSES = Object.keys(PAYMENT_STATUS_LABELS) as readonly PaymentStatus[];

export type OrderLine = {
  readonly sku: string;
  readonly name: string;
  readonly quantity: number;
  readonly unitPriceCents: number;
  readonly lineTotalCents: number;
  readonly imagePath: string | null;
};

export type OrderSummary = {
  readonly id: number;
  readonly orderNumber: string;
  readonly createdAt: string;
  readonly status: OrderStatus;
  readonly paymentStatus: PaymentStatus;
  readonly totalCents: number;
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly shippingCents: number;
  readonly shippingMethodLabel: string;
  readonly customerEmail: string;
  readonly items: readonly OrderLine[];
};

const ORDER_SELECT = `
  id, order_number, created_at, status, payment_status,
  subtotal_cents, discount_cents, shipping_cents, total_cents,
  shipping_method_label, customer_email,
  order_items (sku, product_name, quantity, unit_price_cents, line_total_cents, image_path)
` as const;

type OrderRow = {
  id: number;
  order_number: string;
  created_at: string;
  status: string;
  payment_status: string;
  subtotal_cents: number;
  discount_cents: number;
  shipping_cents: number;
  total_cents: number;
  shipping_method_label: string;
  customer_email: string;
  order_items: {
    sku: string;
    product_name: string;
    quantity: number;
    unit_price_cents: number;
    line_total_cents: number;
    image_path: string | null;
  }[];
};

function toOrder(row: OrderRow): OrderSummary {
  return {
    id: row.id,
    orderNumber: row.order_number,
    createdAt: row.created_at,
    status: row.status as OrderStatus,
    paymentStatus: row.payment_status as PaymentStatus,
    totalCents: row.total_cents,
    subtotalCents: row.subtotal_cents,
    discountCents: row.discount_cents,
    shippingCents: row.shipping_cents,
    shippingMethodLabel: row.shipping_method_label,
    customerEmail: row.customer_email,
    items: row.order_items.map((item) => ({
      sku: item.sku,
      name: item.product_name,
      quantity: item.quantity,
      unitPriceCents: item.unit_price_cents,
      lineTotalCents: item.line_total_cents,
      imagePath: item.image_path,
    })),
  };
}

/**
 * The signed-in customer's own orders.
 *
 * The `customer_id` filter is a query optimisation, not the security boundary: the RLS
 * policy on `orders` already restricts a customer to their own rows. Guest orders have no
 * customer_id and therefore never appear in anyone's history — by design (§10).
 */
export async function listMyOrders(userId: string): Promise<readonly OrderSummary[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_SELECT)
    .eq("customer_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(`Lettura ordini fallita: ${error.message}`);
  return ((data ?? []) as unknown as OrderRow[]).map(toOrder);
}

/** Back-office order list. RLS returns rows only to an active admin/owner. */
export async function listAllOrders(filter?: { status?: OrderStatus }): Promise<readonly OrderSummary[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  let request = supabase.from("orders").select(ORDER_SELECT).order("created_at", { ascending: false }).limit(200);
  if (filter?.status) request = request.eq("status", filter.status);

  const { data, error } = await request;
  if (error) throw new Error(`Lettura ordini fallita: ${error.message}`);
  return ((data ?? []) as unknown as OrderRow[]).map(toOrder);
}

export async function getOrderById(id: number): Promise<OrderSummary | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.from("orders").select(ORDER_SELECT).eq("id", id).maybeSingle();

  if (error) throw new Error(`Lettura ordine fallita: ${error.message}`);
  return data ? toOrder(data as unknown as OrderRow) : null;
}
