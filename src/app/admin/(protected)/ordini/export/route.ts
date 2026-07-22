import { requireAdminAccess } from "@/lib/admin/access";
import { listAdminOrdersForCsv } from "@/lib/admin/order-repository";
import { csvOrderCell, normalizeAdminOrderQuery, orderPiiVisibility } from "@/lib/admin/orders";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const client = await createSupabaseServerClient(); const principal = await requireAdminAccess(client);
  if (!orderPiiVisibility(principal.role).export) return new Response("Esportazione non autorizzata", { status: 403 });
  const params = Object.fromEntries(new URL(request.url).searchParams.entries()); const query = normalizeAdminOrderQuery(params);
  const rows = await listAdminOrdersForCsv(client, query);
  const columns = ["order_number","email","created_at","status","payment_status","shipping_method_code","coupon_code","subtotal_cents","discount_cents","shipping_cents","total_cents","currency"] as const;
  const body=[columns.join(","),...rows.map(row=>columns.map(column=>csvOrderCell(row[column])).join(","))].join("\r\n");
  return new Response(`\uFEFF${body}`,{headers:{"Content-Disposition":`attachment; filename="geardrop-ordini-${new Date().toISOString().slice(0,10)}.csv"`,"Content-Type":"text/csv; charset=utf-8","Cache-Control":"no-store"}});
}
