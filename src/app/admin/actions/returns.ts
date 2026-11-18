"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { parseReturnForm, returnFailure } from "@/lib/admin/returns";
import { requireStaffRole, requireUser } from "@/lib/auth/guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ReturnActionState = { readonly ok: boolean; readonly message: string };

const MANAGERS = ["owner", "admin"] as const;
const text = (data: FormData, key: string) => (typeof data.get(key) === "string" ? String(data.get(key)) : "");

async function managerClient() {
  const client = await createSupabaseServerClient();
  await requireUser(client);
  const principal = await requireStaffRole(client, MANAGERS);
  return { client, organizationId: principal.organization.id };
}

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String(error.message) : "";

/** "Registra reso": the pieces sent back go into stock (or are recorded as not sellable). */
export async function recordOrderReturnAction(_previous: ReturnActionState, formData: FormData): Promise<ReturnActionState> {
  const orderId = Number(text(formData, "orderId"));
  if (!Number.isSafeInteger(orderId) || orderId <= 0) return { ok: false, message: "Ordine non valido." };
  const lines = parseReturnForm(formData.entries());
  if (lines === "invalid") return { ok: false, message: "Scrivi le quantità con numeri interi." };
  if (lines.length === 0) return { ok: false, message: "Scrivi quanti pezzi sono tornati." };
  const note = text(formData, "note").trim();

  try {
    const { client } = await managerClient();
    const { data, error } = await client.rpc("record_order_return", {
      p_order_id: orderId,
      p_lines: [...lines],
      ...(note ? { p_note: note } : {}),
    });
    if (error) return { ok: false, message: returnFailure(errorMessage(error)) };
    revalidateTag("inventory", "max");
    revalidateTag("products", "max");
    revalidateTag("dashboard", "max");
    revalidatePath(`/admin/ordini/${orderId}`);
    revalidatePath("/admin/inventario");
    const pieces = lines.reduce((sum, line) => sum + line.quantity, 0);
    return {
      ok: true,
      message: `Reso registrato: ${pieces} ${pieces === 1 ? "pezzo" : "pezzi"}, ${data} ${data === 1 ? "rimesso" : "rimessi"} in vendita. Il rimborso, se serve, si fa da "Rimborsa".`,
    };
  } catch (error) {
    return { ok: false, message: returnFailure(errorMessage(error)) };
  }
}

const supplierOrderSchema = z.object({
  receiptId: z.coerce.number().int().positive(),
  expectedOn: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]).transform((value) => value || null),
  ordered: z.enum(["si", "no"]).transform((value) => value === "si"),
});

/** "Segna come ordinato" on a receipt draft, with the day the goods are expected; or withdraws it. */
export async function markSupplierOrderAction(_previous: ReturnActionState, formData: FormData): Promise<ReturnActionState> {
  const parsed = supplierOrderSchema.safeParse({
    receiptId: text(formData, "receiptId"),
    expectedOn: text(formData, "expectedOn"),
    ordered: text(formData, "ordered"),
  });
  if (!parsed.success) return { ok: false, message: "Controlla la data di arrivo." };
  try {
    const { client } = await managerClient();
    const { error } = await client.rpc("mark_supplier_receipt_ordered", {
      p_receipt_id: parsed.data.receiptId,
      p_ordered: parsed.data.ordered,
      ...(parsed.data.expectedOn ? { p_expected_on: parsed.data.expectedOn } : {}),
    });
    if (error) {
      const message = errorMessage(error);
      if (message.includes("GD_RECEIPT_NOT_DRAFT")) return { ok: false, message: "Il carico è già confermato: non è più un ordine aperto." };
      return { ok: false, message: "Ordine non salvato. Riprova." };
    }
    revalidatePath("/admin/carichi");
    revalidatePath(`/admin/carichi/${parsed.data.receiptId}`);
    return { ok: true, message: parsed.data.ordered ? "Segnato come ordinato al fornitore." : "Non è più segnato come ordinato." };
  } catch {
    return { ok: false, message: "Permessi insufficienti." };
  }
}
