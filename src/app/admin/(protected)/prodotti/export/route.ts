import { requireAdminAccess } from "@/lib/admin/access";
import { listAdminProductsForCsv } from "@/lib/admin/product-repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function csvCell(value: string | number | boolean | null): string {
  const text = value === null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET() {
  const client = await createSupabaseServerClient();
  await requireAdminAccess(client);
  const products = await listAdminProductsForCsv(client);
  const columns = ["id", "name", "sku", "slug", "publication_status", "active", "stock_status", "stock_quantity", "price_cents", "updated_at"] as const;
  const body = [columns.join(","), ...products.map((product) => columns.map((column) => csvCell(product[column])).join(","))].join("\r\n");
  return new Response(`\uFEFF${body}`, { headers: { "Content-Disposition": `attachment; filename="geardrop-prodotti-${new Date().toISOString().slice(0, 10)}.csv"`, "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store" } });
}
