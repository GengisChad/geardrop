"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaffRole, requireUser } from "@/lib/auth/guards";
import type { StaffRole } from "@/lib/auth/roles";
import {
  costDefaultsSchema,
  orderCostsSchema,
  parseCostImport,
  parseEuroCents,
  productCostSchema,
  receiptDraftSchema,
  receiptReversalSchema,
  supplierSchema,
} from "@/lib/admin/warehouse";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

export type WarehouseActionState = { readonly ok: boolean; readonly message: string; readonly id?: number };

const MANAGERS: readonly StaffRole[] = ["owner", "admin"];
const OWNERS: readonly StaffRole[] = ["owner"];

async function authorized(roles: readonly StaffRole[]) {
  const client = await createSupabaseServerClient();
  await requireUser(client);
  const principal = await requireStaffRole(client, roles);
  return { client, organizationId: principal.organization.id };
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/** An optional euro amount: empty is null, anything unreadable is NaN so validation refuses it. */
function euros(formData: FormData, key: string): number | null {
  const value = text(formData, key).trim();
  if (!value) return null;
  return parseEuroCents(value) ?? Number.NaN;
}

function errorText(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const record = error as { message?: unknown; code?: unknown };
  return `${typeof record.code === "string" ? record.code : ""} ${typeof record.message === "string" ? record.message : ""}`;
}

function failure(error: unknown, fallback: string): WarehouseActionState {
  const detail = errorText(error);
  if (detail.includes("GD_WAREHOUSE_MANAGER_REQUIRED") || detail.includes("GD_COST_OWNER_REQUIRED") || detail.includes("42501")) {
    return { ok: false, message: "Il tuo ruolo non può eseguire questa operazione in questa azienda." };
  }
  if (detail.includes("GD_RECEIPT_NOT_DRAFT")) return { ok: false, message: "Il documento è già caricato: si può solo stornare." };
  if (detail.includes("GD_RECEIPT_NOT_CONFIRMED")) return { ok: false, message: "Solo un documento caricato si può stornare." };
  if (detail.includes("GD_RECEIPT_STOCK_ALREADY_SOLD")) {
    return { ok: false, message: "Parte della merce è già stata venduta: lo storno toglierebbe pezzi che non ci sono più." };
  }
  if (detail.includes("GD_RECEIPT_LINES_REQUIRED")) return { ok: false, message: "Aggiungi almeno una riga al documento." };
  if (detail.includes("GD_SUPPLIER_NOT_FOUND")) return { ok: false, message: "Fornitore non trovato in questa azienda." };
  if (detail.includes("GD_PRODUCT_NOT_FOUND")) return { ok: false, message: "Prodotto non trovato in questa azienda." };
  if (detail.includes("23505")) return { ok: false, message: "Questo documento del fornitore è già registrato." };
  if (detail.includes("23503")) return { ok: false, message: "Una riga contiene un prodotto che non appartiene a questa azienda." };
  return { ok: false, message: fallback };
}

function refreshWarehouse(): void {
  revalidateTag("inventory", "max");
  revalidateTag("dashboard", "max");
  revalidateTag("products", "max");
  revalidatePath("/admin");
  revalidatePath("/admin/carichi");
  revalidatePath("/admin/inventario");
  revalidatePath("/admin/prodotti");
}

// ---------------------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------------------

export async function saveSupplierAction(_previous: WarehouseActionState, formData: FormData): Promise<WarehouseActionState> {
  const rawId = text(formData, "id");
  const parsed = supplierSchema.safeParse({
    ...(rawId ? { id: rawId } : {}),
    name: text(formData, "name"),
    countryCode: text(formData, "countryCode"),
    vatNumber: text(formData, "vatNumber"),
    vatRegime: text(formData, "vatRegime"),
    email: text(formData, "email").trim(),
    notes: text(formData, "notes"),
    active: rawId ? formData.get("active") === "on" : true,
  });
  if (!parsed.success) return { ok: false, message: "Controlla nome, paese (due lettere), regime IVA ed email." };
  try {
    const { client, organizationId } = await authorized(MANAGERS);
    const input = parsed.data;
    const record = {
      organization_id: organizationId,
      name: input.name,
      country_code: input.countryCode,
      vat_number: input.vatNumber,
      vat_regime: input.vatRegime,
      email: input.email,
      notes: input.notes,
      active: input.active,
    };
    const result = input.id
      ? await client.from("suppliers").update(record).eq("id", input.id).eq("organization_id", organizationId).select("id").single()
      : await client.from("suppliers").insert(record).select("id").single();
    if (result.error) {
      return result.error.code === "23505"
        ? { ok: false, message: "Esiste già un fornitore con questo nome." }
        : failure(result.error, "Fornitore non salvato. Riprova.");
    }
    revalidatePath("/admin/fornitori");
    revalidatePath("/admin/carichi");
    return { ok: true, message: input.id ? "Fornitore aggiornato." : "Fornitore creato.", id: result.data.id };
  } catch (error) {
    return failure(error, "Fornitore non salvato. Riprova.");
  }
}

// ---------------------------------------------------------------------------------------
// Goods receipts
// ---------------------------------------------------------------------------------------

function receiptLines(formData: FormData): unknown {
  try {
    return JSON.parse(text(formData, "lines"));
  } catch {
    return null;
  }
}

export async function saveReceiptDraftAction(_previous: WarehouseActionState, formData: FormData): Promise<WarehouseActionState> {
  const rawId = text(formData, "id");
  const parsed = receiptDraftSchema.safeParse({
    ...(rawId ? { id: rawId } : {}),
    supplierId: text(formData, "supplierId"),
    documentKind: text(formData, "documentKind"),
    documentNumber: text(formData, "documentNumber"),
    documentDate: text(formData, "documentDate"),
    freightCents: euros(formData, "freight") ?? 0,
    dutiesCents: euros(formData, "duties") ?? 0,
    notes: text(formData, "notes"),
    lines: receiptLines(formData),
  });
  if (!parsed.success) {
    const duplicate = parsed.error.issues.some((issue) => issue.message.includes("una sola volta"));
    return {
      ok: false,
      message: duplicate
        ? "Ogni prodotto compare una sola volta nel documento."
        : "Controlla fornitore, numero e data del documento, spese e righe (quantità intere, costi in euro).",
    };
  }
  const input = parsed.data;
  let savedId: number;
  try {
    const { client, organizationId } = await authorized(MANAGERS);
    const { data, error } = await client.rpc("save_supplier_receipt", {
      p_organization_id: organizationId,
      p_receipt: {
        id: input.id ?? null,
        supplier_id: input.supplierId,
        document_kind: input.documentKind,
        document_number: input.documentNumber,
        document_date: input.documentDate,
        freight_cents: input.freightCents,
        duties_cents: input.dutiesCents,
        notes: input.notes,
      } as Json,
      p_lines: input.lines.map((line) => ({
        product_id: line.productId,
        quantity: line.quantity,
        unit_cost_cents: line.unitCostCents,
      })) as Json,
    });
    if (error) return failure(error, "Bozza non salvata. Riprova.");
    savedId = data;
  } catch (error) {
    return failure(error, "Bozza non salvata. Riprova.");
  }
  revalidatePath("/admin/carichi");
  if (!input.id) redirect(`/admin/carichi/${savedId}?creato=1`);
  revalidatePath(`/admin/carichi/${savedId}`);
  return { ok: true, message: "Bozza salvata.", id: savedId };
}

export async function confirmReceiptAction(_previous: WarehouseActionState, formData: FormData): Promise<WarehouseActionState> {
  const receiptId = Number(text(formData, "receiptId"));
  if (!Number.isSafeInteger(receiptId) || receiptId <= 0) return { ok: false, message: "Documento non valido." };
  if (text(formData, "confirmation").trim().toUpperCase() !== "CARICA") {
    return { ok: false, message: "Scrivi CARICA per confermare: il carico non si potrà più modificare, solo stornare." };
  }
  try {
    const { client } = await authorized(MANAGERS);
    const { error } = await client.rpc("confirm_supplier_receipt", { p_receipt_id: receiptId });
    if (error) return failure(error, "Carico non confermato. Riprova.");
  } catch (error) {
    return failure(error, "Carico non confermato. Riprova.");
  }
  refreshWarehouse();
  redirect(`/admin/carichi/${receiptId}?caricato=1`);
}

export async function reverseReceiptAction(_previous: WarehouseActionState, formData: FormData): Promise<WarehouseActionState> {
  const parsed = receiptReversalSchema.safeParse({ receiptId: text(formData, "receiptId"), reason: text(formData, "reason") });
  if (!parsed.success) return { ok: false, message: "Scrivi il motivo dello storno (almeno 3 caratteri)." };
  try {
    const { client } = await authorized(MANAGERS);
    const { error } = await client.rpc("reverse_supplier_receipt", {
      p_receipt_id: parsed.data.receiptId,
      p_reason: parsed.data.reason,
    });
    if (error) return failure(error, "Storno non eseguito. Riprova.");
  } catch (error) {
    return failure(error, "Storno non eseguito. Riprova.");
  }
  refreshWarehouse();
  revalidatePath(`/admin/carichi/${parsed.data.receiptId}`);
  return { ok: true, message: "Documento stornato: merce tolta dal magazzino al costo di carico." };
}

export async function deleteReceiptDraftAction(formData: FormData): Promise<void> {
  const receiptId = Number(text(formData, "receiptId"));
  if (!Number.isSafeInteger(receiptId) || receiptId <= 0) redirect("/admin/carichi");
  const { client, organizationId } = await authorized(MANAGERS);
  // Row level security deletes a draft only; a confirmed document stays.
  await client.from("supplier_receipts").delete().eq("id", receiptId).eq("organization_id", organizationId)
    .eq("status", "draft");
  revalidatePath("/admin/carichi");
  redirect("/admin/carichi?eliminato=1");
}

// ---------------------------------------------------------------------------------------
// Costs
// ---------------------------------------------------------------------------------------

export async function setProductCostAction(_previous: WarehouseActionState, formData: FormData): Promise<WarehouseActionState> {
  const parsed = productCostSchema.safeParse({
    productId: text(formData, "productId"),
    unitCostCents: euros(formData, "unitCost"),
    reason: text(formData, "reason"),
    valueUnvaluedMovements: formData.get("valueUnvaluedMovements") === "on",
  });
  if (!parsed.success) return { ok: false, message: "Scrivi il costo in euro (es. 6,50) e il motivo." };
  try {
    const { client, organizationId } = await authorized(OWNERS);
    const { data, error } = await client.rpc("set_product_cost", {
      p_organization_id: organizationId,
      p_product_id: parsed.data.productId,
      p_unit_cost_cents: parsed.data.unitCostCents,
      p_reason: parsed.data.reason,
      p_value_unvalued_movements: parsed.data.valueUnvaluedMovements,
    });
    if (error) return failure(error, "Costo non salvato. Riprova.");
    refreshWarehouse();
    revalidatePath(`/admin/prodotti/${parsed.data.productId}`);
    revalidatePath("/admin/ordini");
    return {
      ok: true,
      message: data > 0 ? `Costo salvato. ${data} movimenti passati ora hanno un costo.` : "Costo salvato.",
    };
  } catch (error) {
    return failure(error, "Costo non salvato. Riprova.");
  }
}

export async function setOrderCostsAction(_previous: WarehouseActionState, formData: FormData): Promise<WarehouseActionState> {
  const parsed = orderCostsSchema.safeParse({
    orderId: text(formData, "orderId"),
    shippingCostCents: euros(formData, "shippingCost"),
    packagingCostCents: euros(formData, "packagingCost"),
    paymentFeeCents: euros(formData, "paymentFee"),
  });
  if (!parsed.success) return { ok: false, message: "Scrivi gli importi in euro (es. 4,00); vuoto usa il valore predefinito." };
  try {
    const { client } = await authorized(MANAGERS);
    const { error } = await client.rpc("set_order_costs", {
      p_order_id: parsed.data.orderId,
      p_costs: {
        shipping_cost_cents: parsed.data.shippingCostCents,
        packaging_cost_cents: parsed.data.packagingCostCents,
        payment_fee_cents: parsed.data.paymentFeeCents,
      },
    });
    if (error) return failure(error, "Costi non salvati. Riprova.");
  } catch (error) {
    return failure(error, "Costi non salvati. Riprova.");
  }
  revalidatePath(`/admin/ordini/${parsed.data.orderId}`);
  revalidatePath("/admin/ordini");
  revalidatePath("/admin");
  return { ok: true, message: "Costi dell'ordine salvati." };
}

export async function setCostDefaultsAction(_previous: WarehouseActionState, formData: FormData): Promise<WarehouseActionState> {
  const vat = Number(text(formData, "vatRate").replace(",", "."));
  const parsed = costDefaultsSchema.safeParse({
    vatRateBp: Number.isFinite(vat) ? Math.round(vat * 100) : Number.NaN,
    packagingCostCents: euros(formData, "packagingCost") ?? 0,
  });
  if (!parsed.success) return { ok: false, message: "Aliquota tra 0 e 100, imballo in euro." };
  try {
    const { client, organizationId } = await authorized(OWNERS);
    const { error } = await client.rpc("set_organization_cost_defaults", {
      p_organization_id: organizationId,
      p_default_vat_rate_bp: parsed.data.vatRateBp,
      p_packaging_cost_cents: parsed.data.packagingCostCents,
    });
    if (error) return failure(error, "Impostazioni non salvate. Riprova.");
  } catch (error) {
    return failure(error, "Impostazioni non salvate. Riprova.");
  }
  revalidatePath("/admin/impostazioni");
  revalidatePath("/admin/ordini");
  return { ok: true, message: "Impostazioni dei costi salvate." };
}

/**
 * The opening load: costs of products already on the shelf, pasted as SKU;cost lines. Every
 * line is checked before anything is written; each cost is then set like a single one, audited,
 * and also values the past sales of that product that had no cost.
 */
export async function importProductCostsAction(_previous: WarehouseActionState, formData: FormData): Promise<WarehouseActionState> {
  const { rows, errors } = parseCostImport(text(formData, "rows"));
  const reason = text(formData, "reason").trim() || "Costo di apertura";
  if (errors.length > 0) return { ok: false, message: errors.slice(0, 5).join(" · ") };
  if (rows.length === 0) return { ok: false, message: "Incolla almeno una riga SKU;costo." };
  if (rows.length > 500) return { ok: false, message: "Al massimo 500 prodotti per volta." };
  if (reason.length < 3 || reason.length > 500) return { ok: false, message: "Il motivo va da 3 a 500 caratteri." };
  try {
    const { client, organizationId } = await authorized(OWNERS);
    const products = await client.from("products").select("id,sku").eq("organization_id", organizationId);
    if (products.error) return failure(products.error, "Prodotti non leggibili. Riprova.");
    const idBySku = new Map((products.data ?? []).map((product) => [product.sku.toUpperCase(), product.id]));
    const unknown = rows.filter((row) => !idBySku.has(row.sku.toUpperCase())).map((row) => row.sku);
    if (unknown.length > 0) return { ok: false, message: `SKU non trovati in questa azienda: ${unknown.slice(0, 10).join(", ")}` };

    let valued = 0;
    for (const row of rows) {
      const { data, error } = await client.rpc("set_product_cost", {
        p_organization_id: organizationId,
        p_product_id: idBySku.get(row.sku.toUpperCase()) as number,
        p_unit_cost_cents: row.unitCostCents,
        p_reason: reason,
        p_value_unvalued_movements: true,
      });
      if (error) return failure(error, `Costo di ${row.sku} non salvato: i precedenti sono salvati.`);
      valued += data;
    }
    refreshWarehouse();
    revalidatePath("/admin/ordini");
    return { ok: true, message: `${rows.length} costi salvati${valued > 0 ? `, ${valued} vendite passate ora hanno un costo` : ""}.` };
  } catch (error) {
    return failure(error, "Costi non salvati. Riprova.");
  }
}
