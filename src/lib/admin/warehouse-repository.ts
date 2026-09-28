import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;
export type Supplier = Database["public"]["Tables"]["suppliers"]["Row"];
export type SupplierReceipt = Database["public"]["Tables"]["supplier_receipts"]["Row"];
export type SupplierReceiptLine = Database["public"]["Tables"]["supplier_receipt_lines"]["Row"];
export type OrderProfit = Database["public"]["Views"]["order_profit"]["Row"];

export type ReceiptProductOption = {
  readonly id: number;
  readonly name: string;
  readonly sku: string;
  readonly stockQuantity: number;
  readonly averageCostCents: number | null;
};

export type ReceiptListItem = SupplierReceipt & {
  readonly supplierName: string;
  readonly lineCount: number;
  readonly quantity: number;
  readonly valueCents: number;
};

export type ReceiptDetail = {
  readonly receipt: SupplierReceipt;
  readonly supplier: Supplier;
  readonly lines: readonly (SupplierReceiptLine & { readonly productName: string; readonly productSku: string })[];
};

export type WarehouseSummary = {
  readonly stockValueCents: number;
  readonly productsWithoutCost: number;
  readonly draftReceipts: number;
  readonly periodDays: number;
  readonly completeOrders: number;
  readonly incompleteOrders: number;
  readonly profitCents: number;
  readonly revenueNetCents: number;
};

export type ProductCost = {
  readonly averageCostCents: number | null;
  readonly lastCostCents: number | null;
  readonly source: string | null;
  readonly updatedAt: string | null;
  readonly vatRateBp: number;
  readonly recentReceipts: readonly {
    readonly receiptId: number;
    readonly documentKind: string;
    readonly documentNumber: string;
    readonly documentDate: string;
    readonly supplierName: string;
    readonly quantity: number;
    readonly landedUnitCostCents: number | null;
  }[];
};

export const RECEIPT_PAGE_SIZE = 25;

export async function listSuppliers(client: Client, organizationId: number): Promise<readonly Supplier[]> {
  const { data, error } = await client.from("suppliers").select("*").eq("organization_id", organizationId)
    .order("active", { ascending: false }).order("name");
  if (error) throw new Error("Impossibile caricare i fornitori");
  return data ?? [];
}

export async function listReceipts(
  client: Client,
  organizationId: number,
  query: { readonly status: "draft" | "confirmed" | "reversed" | null; readonly page: number },
): Promise<{ readonly items: readonly ReceiptListItem[]; readonly total: number; readonly pageCount: number }> {
  const from = (query.page - 1) * RECEIPT_PAGE_SIZE;
  let receipts = client.from("supplier_receipts").select("*, supplier:suppliers(name)", { count: "exact" })
    .eq("organization_id", organizationId);
  if (query.status) receipts = receipts.eq("status", query.status);
  const result = await receipts.order("document_date", { ascending: false }).order("id", { ascending: false })
    .range(from, from + RECEIPT_PAGE_SIZE - 1);
  if (result.error) throw new Error("Impossibile caricare i carichi merce");

  type Row = SupplierReceipt & { readonly supplier: { readonly name: string } | readonly { readonly name: string }[] | null };
  const rows = (result.data ?? []) as unknown as readonly Row[];
  const ids = rows.map((row) => row.id);
  const lines = ids.length
    ? await client.from("supplier_receipt_lines").select("receipt_id,quantity,unit_cost_cents")
      .eq("organization_id", organizationId).in("receipt_id", ids)
    : { data: [], error: null };
  if (lines.error) throw new Error("Impossibile caricare le righe dei carichi");

  const totals = new Map<number, { lines: number; quantity: number; goods: number }>();
  for (const line of lines.data ?? []) {
    const total = totals.get(line.receipt_id) ?? { lines: 0, quantity: 0, goods: 0 };
    total.lines += 1;
    total.quantity += line.quantity;
    total.goods += line.quantity * line.unit_cost_cents;
    totals.set(line.receipt_id, total);
  }
  const total = result.count ?? 0;
  return {
    items: rows.map(({ supplier, ...receipt }) => {
      const supplierRow = Array.isArray(supplier) ? supplier[0] : supplier;
      const lineTotals = totals.get(receipt.id) ?? { lines: 0, quantity: 0, goods: 0 };
      return {
        ...receipt,
        supplierName: supplierRow?.name ?? "Fornitore rimosso",
        lineCount: lineTotals.lines,
        quantity: lineTotals.quantity,
        valueCents: lineTotals.goods + receipt.freight_cents + receipt.duties_cents,
      };
    }),
    total,
    pageCount: Math.max(1, Math.ceil(total / RECEIPT_PAGE_SIZE)),
  };
}

export async function loadReceipt(client: Client, organizationId: number, id: number): Promise<ReceiptDetail | null> {
  const receipt = await client.from("supplier_receipts").select("*").eq("id", id)
    .eq("organization_id", organizationId).maybeSingle();
  if (receipt.error) throw new Error("Impossibile caricare il carico merce");
  if (!receipt.data) return null;
  const [supplier, lines] = await Promise.all([
    client.from("suppliers").select("*").eq("id", receipt.data.supplier_id).eq("organization_id", organizationId).single(),
    client.from("supplier_receipt_lines").select("*, product:products(name,sku)").eq("receipt_id", id)
      .eq("organization_id", organizationId).order("sort_order").order("id"),
  ]);
  if (supplier.error || lines.error) throw new Error("Impossibile caricare il carico merce");

  type LineRow = SupplierReceiptLine & {
    readonly product: { readonly name: string; readonly sku: string } | readonly { readonly name: string; readonly sku: string }[] | null;
  };
  return {
    receipt: receipt.data,
    supplier: supplier.data,
    lines: ((lines.data ?? []) as unknown as readonly LineRow[]).map(({ product, ...line }) => {
      const productRow = Array.isArray(product) ? product[0] : product;
      return { ...line, productName: productRow?.name ?? "Prodotto rimosso", productSku: productRow?.sku ?? "—" };
    }),
  };
}

/** Products a document can list: everything not archived, with its stock and average cost. */
export async function listReceiptProductOptions(client: Client, organizationId: number): Promise<readonly ReceiptProductOption[]> {
  const [products, costs] = await Promise.all([
    client.from("products").select("id,name,sku,stock_quantity").eq("organization_id", organizationId)
      .neq("publication_status", "archived").order("name").limit(1000),
    client.from("inventory_cost_state").select("product_id,average_cost_cents").eq("organization_id", organizationId),
  ]);
  if (products.error || costs.error) throw new Error("Impossibile caricare i prodotti del magazzino");
  const averageByProduct = new Map((costs.data ?? []).map((cost) => [cost.product_id, cost.average_cost_cents]));
  return (products.data ?? []).map((product) => ({
    id: product.id,
    name: product.name,
    sku: product.sku,
    stockQuantity: product.stock_quantity,
    averageCostCents: averageByProduct.get(product.id) ?? null,
  }));
}

function integer(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 0;
}

export async function loadWarehouseSummary(client: Client, organizationId: number, days = 30): Promise<WarehouseSummary> {
  const { data, error } = await client.rpc("get_warehouse_summary", { p_organization_id: organizationId, p_days: days });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Impossibile caricare il riepilogo di magazzino");
  }
  const row = data as Record<string, unknown>;
  return {
    stockValueCents: integer(row.stock_value_cents),
    productsWithoutCost: integer(row.products_without_cost),
    draftReceipts: integer(row.draft_receipts),
    periodDays: integer(row.period_days),
    completeOrders: integer(row.complete_orders),
    incompleteOrders: integer(row.incomplete_orders),
    profitCents: integer(row.profit_cents),
    revenueNetCents: integer(row.revenue_net_cents),
  };
}

export type ValuationRow = {
  readonly averageCostCents: number | null;
  readonly valueCents: number | null;
  readonly unlimitedStock: boolean;
};

export async function loadInventoryValuation(
  client: Client,
  organizationId: number,
  productIds: readonly number[],
): Promise<ReadonlyMap<number, ValuationRow>> {
  if (productIds.length === 0) return new Map();
  const { data, error } = await client.from("inventory_valuation")
    .select("product_id,average_cost_cents,value_cents,unlimited_stock")
    .eq("organization_id", organizationId).in("product_id", [...productIds]);
  if (error) throw new Error("Impossibile caricare il valore di magazzino");
  return new Map((data ?? []).flatMap((row) => row.product_id === null ? [] : [[row.product_id, {
    averageCostCents: row.average_cost_cents,
    valueCents: row.value_cents,
    unlimitedStock: row.unlimited_stock ?? false,
  }] as const]));
}

export async function loadProductCost(client: Client, organizationId: number, productId: number): Promise<ProductCost> {
  const [state, lines, organization] = await Promise.all([
    client.from("inventory_cost_state").select("average_cost_cents,last_cost_cents,source,updated_at")
      .eq("organization_id", organizationId).eq("product_id", productId).maybeSingle(),
    client.from("supplier_receipt_lines")
      .select("quantity,landed_unit_cost_cents,receipt:supplier_receipts!inner(id,status,document_kind,document_number,document_date,supplier:suppliers(name))")
      .eq("organization_id", organizationId).eq("product_id", productId).eq("receipt.status", "confirmed")
      .order("id", { ascending: false }).limit(5),
    client.from("organizations").select("default_vat_rate_bp").eq("id", organizationId).single(),
  ]);
  if (state.error || lines.error || organization.error) throw new Error("Impossibile caricare il costo del prodotto");

  type LineRow = {
    readonly quantity: number;
    readonly landed_unit_cost_cents: number | null;
    readonly receipt: {
      readonly id: number;
      readonly document_kind: string;
      readonly document_number: string;
      readonly document_date: string;
      readonly supplier: { readonly name: string } | readonly { readonly name: string }[] | null;
    } | null;
  };
  return {
    averageCostCents: state.data?.average_cost_cents ?? null,
    lastCostCents: state.data?.last_cost_cents ?? null,
    source: state.data?.source ?? null,
    updatedAt: state.data?.updated_at ?? null,
    vatRateBp: organization.data.default_vat_rate_bp,
    recentReceipts: ((lines.data ?? []) as unknown as readonly LineRow[]).flatMap((line) => {
      if (!line.receipt) return [];
      const supplier = Array.isArray(line.receipt.supplier) ? line.receipt.supplier[0] : line.receipt.supplier;
      return [{
        receiptId: line.receipt.id,
        documentKind: line.receipt.document_kind,
        documentNumber: line.receipt.document_number,
        documentDate: line.receipt.document_date,
        supplierName: supplier?.name ?? "Fornitore rimosso",
        quantity: line.quantity,
        landedUnitCostCents: line.landed_unit_cost_cents,
      }];
    }),
  };
}

export async function loadOrderProfits(
  client: Client,
  organizationId: number,
  orderIds: readonly number[],
): Promise<ReadonlyMap<number, OrderProfit>> {
  if (orderIds.length === 0) return new Map();
  const { data, error } = await client.from("order_profit").select("*")
    .eq("organization_id", organizationId).in("order_id", [...orderIds]);
  if (error) throw new Error("Impossibile calcolare il profitto degli ordini");
  return new Map((data ?? []).flatMap((row) => row.order_id === null ? [] : [[row.order_id, row] as const]));
}

export async function loadCostDefaults(client: Client, organizationId: number) {
  const { data, error } = await client.from("organizations").select("default_vat_rate_bp,packaging_cost_cents")
    .eq("id", organizationId).single();
  if (error) throw new Error("Impossibile caricare le impostazioni dei costi");
  return { vatRateBp: data.default_vat_rate_bp, packagingCostCents: data.packaging_cost_cents };
}
