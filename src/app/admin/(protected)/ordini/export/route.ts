import { requireAdminAccess } from "@/lib/admin/access";
import { listAdminOrdersForCsv, listOrderItemsByOrderIds } from "@/lib/admin/order-repository";
import { csvOrderCell, normalizeAdminOrderQuery, orderPiiVisibility, shipmentChoice } from "@/lib/admin/orders";
import { partnerLines, PRODUCTS } from "@/data/catalog";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Slugs of all consignment products, computed once at module load.
const CONSIGNMENT_SLUGS = new Set(PRODUCTS.filter((p) => p.consignment).map((p) => p.slug as string));

export async function GET(request: Request) {
  const client = await createSupabaseServerClient(); const principal = await requireAdminAccess(client);
  if (!orderPiiVisibility(principal.role).export) return new Response("Esportazione non autorizzata", { status: 403 });
  const params = Object.fromEntries(new URL(request.url).searchParams.entries()); const query = normalizeAdminOrderQuery(params);
  const rows = await listAdminOrdersForCsv(client, principal.organization.id, query);
  // Fetch items for all exported orders to compute partner_owed_cents per order.
  const orderIds = rows.map((r) => r.id);
  const allItems = await listOrderItemsByOrderIds(client, principal.organization.id, orderIds);
  const itemsByOrder = new Map<number, typeof allItems>();
  for (const item of allItems) {
    const list = itemsByOrder.get(item.order_id) ?? [];
    list.push(item);
    itemsByOrder.set(item.order_id, list);
  }
  const columns = ["order_number","email","created_at","status","payment_status","shipping_method_code","coupon_code","subtotal_cents","discount_cents","shipping_cents","total_cents","currency"] as const;
  // The carrier the buyer picked lives in the shipping snapshot: the column says "standard" for every Stripe order.
  const header=[...columns,"carrier","pickup_point","partner_owed_cents"];
  const body=[header.join(","),...rows.map(row=>{
    const choice=shipmentChoice(row.shipping_address_snapshot);
    const items=itemsByOrder.get(row.id)??[];
    const pLines=partnerLines(items.map(i=>({slug:i.sku_snapshot,name:i.product_name_snapshot,quantity:i.quantity,unitPriceCents:i.unit_price_cents})));
    const owedCents=pLines.reduce((sum,l)=>sum+l.owed,0);
    // Only show owed for orders that actually contain consignment items (blank for pure Hasbro orders).
    const hasConsignment=items.some(i=>CONSIGNMENT_SLUGS.has(i.sku_snapshot));
    return [...columns.map(column=>csvOrderCell(row[column])),csvOrderCell(choice.label??"Poste Italiane · consegna a casa"),csvOrderCell(choice.pickupPoint),hasConsignment?csvOrderCell(owedCents):csvOrderCell(null)].join(",");
  })].join("\r\n");
  return new Response(`﻿${body}`,{headers:{"Content-Disposition":`attachment; filename="geardrop-ordini-${new Date().toISOString().slice(0,10)}.csv"`,"Content-Type":"text/csv; charset=utf-8","Cache-Control":"no-store"}});
}
