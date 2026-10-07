"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { applyVintedSaleSchema, dismissVintedSaleSchema } from "@/lib/admin/vinted";
import { requireStaffRole, requireUser } from "@/lib/auth/guards";
import { STOREFRONT_CACHE_TAGS } from "@/lib/storefront/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type VintedActionState = { readonly ok: boolean; readonly message: string };

const MANAGERS = ["owner", "admin"] as const;
const text = (data: FormData, key: string) => (typeof data.get(key) === "string" ? String(data.get(key)) : "");

async function managerClient() {
  const client = await createSupabaseServerClient();
  await requireUser(client);
  await requireStaffRole(client, MANAGERS);
  return client;
}

function failure(error: unknown): VintedActionState {
  const message =
    error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String(error.message) : "";
  if (message.includes("GD_VINTED_SALE_ALREADY_HANDLED")) return { ok: false, message: "Questa vendita è già stata registrata o scartata." };
  if (message.includes("GD_PRODUCT_NOT_FOUND")) return { ok: false, message: "Uno dei prodotti scelti non esiste più nel catalogo." };
  if (message.includes("GD_VINTED_LINES_INVALID")) return { ok: false, message: "Controlla prodotti e quantità." };
  if (message.includes("GD_VINTED_MANAGER_REQUIRED")) return { ok: false, message: "Permessi insufficienti." };
  return { ok: false, message: "Operazione non completata. Riprova." };
}

function refresh() {
  revalidateTag(STOREFRONT_CACHE_TAGS.products, "max");
  revalidateTag("inventory", "max");
  revalidateTag("dashboard", "max");
  revalidatePath("/admin/vinted");
  revalidatePath("/admin/inventario");
}

/** The owner says which pieces left with a Vinted sale; they come off the shared shelf. */
export async function applyVintedSaleAction(_previous: VintedActionState, formData: FormData): Promise<VintedActionState> {
  let lines: unknown = [];
  try {
    lines = JSON.parse(text(formData, "lines") || "[]");
  } catch {
    return { ok: false, message: "Controlla prodotti e quantità." };
  }
  const parsed = applyVintedSaleSchema.safeParse({ saleId: text(formData, "saleId"), lines });
  if (!parsed.success) return { ok: false, message: "Scegli almeno un prodotto, con quantità da 1 a 50." };
  try {
    const client = await managerClient();
    const { data, error } = await client.rpc("apply_vinted_sale", { p_sale_id: parsed.data.saleId, p_lines: parsed.data.lines });
    if (error) return failure(error);
    refresh();
    const short = (Array.isArray(data) ? data : []).some(
      (line) => typeof line === "object" && line !== null && "taken" in line && "quantity" in line && line.taken !== line.quantity,
    );
    return short
      ? { ok: true, message: "Registrata. Attenzione: il magazzino del sito aveva meno pezzi di quelli venduti, controlla l'inventario." }
      : { ok: true, message: "Vendita registrata: magazzino aggiornato." };
  } catch (error) {
    return failure(error);
  }
}

/** Not a sale after all (a test, a cancelled order): the email stays on file, the shelf is untouched. */
export async function dismissVintedSaleAction(_previous: VintedActionState, formData: FormData): Promise<VintedActionState> {
  const parsed = dismissVintedSaleSchema.safeParse({ saleId: text(formData, "saleId"), note: text(formData, "note") });
  if (!parsed.success) return { ok: false, message: "Vendita non valida." };
  try {
    const client = await managerClient();
    const { error } = await client.rpc("dismiss_vinted_sale", {
      p_sale_id: parsed.data.saleId,
      ...(parsed.data.note ? { p_note: parsed.data.note } : {}),
    });
    if (error) return failure(error);
    revalidatePath("/admin/vinted");
    return { ok: true, message: "Scartata: il magazzino non è stato toccato." };
  } catch (error) {
    return failure(error);
  }
}
