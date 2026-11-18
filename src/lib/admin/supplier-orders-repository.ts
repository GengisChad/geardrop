import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

export type OpenSupplierOrder = {
  readonly id: number;
  readonly supplierName: string;
  readonly documentNumber: string;
  readonly orderedAt: string;
  readonly expectedOn: string | null;
  readonly pieces: number;
  readonly products: readonly string[];
};

/** Drafts marked as ordered from a supplier and not yet arrived, the soonest expected first. */
export async function listOpenSupplierOrders(client: Client, organizationId: number): Promise<readonly OpenSupplierOrder[]> {
  const receipts = await client
    .from("supplier_receipts")
    .select("id,document_number,ordered_at,expected_on,supplier:suppliers(name)")
    .eq("organization_id", organizationId)
    .eq("status", "draft")
    .not("ordered_at", "is", null)
    .order("expected_on", { ascending: true, nullsFirst: false })
    .order("ordered_at", { ascending: true })
    .limit(50);
  if (receipts.error) throw new Error("Impossibile caricare gli ordini ai fornitori");
  const rows = receipts.data ?? [];
  if (rows.length === 0) return [];

  const lines = await client
    .from("supplier_receipt_lines")
    .select("receipt_id,quantity,product:products(name)")
    .eq("organization_id", organizationId)
    .in("receipt_id", rows.map((row) => row.id));
  if (lines.error) throw new Error("Impossibile caricare le righe degli ordini");

  const byReceipt = new Map<number, { pieces: number; products: string[] }>();
  for (const line of lines.data ?? []) {
    const product = Array.isArray(line.product) ? line.product[0] : line.product;
    const entry = byReceipt.get(line.receipt_id) ?? { pieces: 0, products: [] };
    entry.pieces += line.quantity;
    if (product?.name) entry.products.push(product.name);
    byReceipt.set(line.receipt_id, entry);
  }

  return rows.map((row) => {
    const supplier = Array.isArray(row.supplier) ? row.supplier[0] : row.supplier;
    const entry = byReceipt.get(row.id);
    return {
      id: row.id,
      supplierName: supplier?.name ?? "Fornitore",
      documentNumber: row.document_number,
      orderedAt: row.ordered_at!,
      expectedOn: row.expected_on,
      pieces: entry?.pieces ?? 0,
      products: entry?.products ?? [],
    };
  });
}

/** Today in Rome as YYYY-MM-DD, to compare with an expected day. */
export function romeToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(now);
}
