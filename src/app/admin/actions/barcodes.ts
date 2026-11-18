"use server";

import { revalidatePath } from "next/cache";
import { packCheckSchema, productGtinSchema } from "@/lib/admin/barcodes";
import { requireStaffRole, requireUser } from "@/lib/auth/guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type BarcodeActionState = { readonly ok: boolean; readonly message: string };

const MANAGERS = ["owner", "admin"] as const;
const text = (data: FormData, key: string) => (typeof data.get(key) === "string" ? String(data.get(key)) : "");

async function managerClient() {
  const client = await createSupabaseServerClient();
  await requireUser(client);
  const principal = await requireStaffRole(client, MANAGERS);
  return { client, organizationId: principal.organization.id };
}

/** Saves (or clears) the barcode printed on a product's box. */
export async function setProductGtinAction(_previous: BarcodeActionState, formData: FormData): Promise<BarcodeActionState> {
  const parsed = productGtinSchema.safeParse({ productId: text(formData, "productId"), gtin: text(formData, "gtin") });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Codice a barre non valido." };
  try {
    const { client, organizationId } = await managerClient();
    const { error } = await client
      .from("products")
      .update({ gtin: parsed.data.gtin })
      .eq("id", parsed.data.productId)
      .eq("organization_id", organizationId);
    if (error) {
      if (error.code === "23505") return { ok: false, message: "Questo codice è già su un altro prodotto." };
      return { ok: false, message: "Codice non salvato. Riprova." };
    }
    revalidatePath("/admin/inventario/codici");
    return { ok: true, message: parsed.data.gtin ? `Salvato: ${parsed.data.gtin}.` : "Codice tolto." };
  } catch {
    return { ok: false, message: "Permessi insufficienti." };
  }
}

/** Writes on the order that every piece was scanned before the box was closed. */
export async function markOrderPackedAction(_previous: BarcodeActionState, formData: FormData): Promise<BarcodeActionState> {
  const parsed = packCheckSchema.safeParse({ orderId: text(formData, "orderId"), pieces: text(formData, "pieces") });
  if (!parsed.success) return { ok: false, message: "Ordine non valido." };
  try {
    const { client } = await managerClient();
    const { error } = await client.rpc("add_order_note", {
      p_order_id: parsed.data.orderId,
      p_note: `Pacco controllato con scansione: ${parsed.data.pieces} ${parsed.data.pieces === 1 ? "pezzo" : "pezzi"}, tutti giusti.`,
    });
    if (error) return { ok: false, message: "Controllo non registrato sull'ordine. Riprova." };
    revalidatePath(`/admin/ordini/${parsed.data.orderId}`);
    return { ok: true, message: "Controllo registrato sull'ordine." };
  } catch {
    return { ok: false, message: "Permessi insufficienti." };
  }
}
