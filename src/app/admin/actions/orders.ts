"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { requireStaffRole, requireUser } from "@/lib/auth/guards";
import {
  orderCancellationSchema,
  orderNoteSchema,
  orderTransitionSchema,
  refundPreparationSchema,
  trackingSchema,
} from "@/lib/admin/orders";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type OrderActionState = { readonly ok: boolean; readonly message: string };
const MANAGERS = ["owner", "admin"] as const;
const text = (data: FormData, key: string) => typeof data.get(key) === "string" ? String(data.get(key)) : "";
const cents = (value: string) => Math.round(Number(value.replace(",", ".")) * 100);

function refresh(id: number) {
  revalidateTag("orders", "max");
  revalidateTag("dashboard", "max");
  revalidateTag("inventory", "max");
  revalidatePath("/admin");
  revalidatePath("/admin/ordini");
  revalidatePath(`/admin/ordini/${id}`);
}

function failure(error: unknown): OrderActionState {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("GD_ORDER_NOT_FOUND")) return { ok: false, message: "Ordine non trovato." };
  if (message.includes("GD_ORDER_INVALID_TRANSITION")) return { ok: false, message: "Transizione non consentita per lo stato attuale." };
  if (message.includes("GD_ORDER_INVALID_TRACKING")) return { ok: false, message: "Controlla corriere, codice e URL HTTPS." };
  if (message.includes("GD_ORDER_REFUND_INVALID")) return { ok: false, message: "Importo o stato pagamento non consente la preparazione." };
  if (message.includes("GD_ORDER_MANAGER_REQUIRED") || message.includes("GD_ORDER_STAFF_REQUIRED")) return { ok: false, message: "Permessi insufficienti." };
  return { ok: false, message: "Operazione non completata. Riprova." };
}

async function clientFor(roles: typeof MANAGERS) {
  const client = await createSupabaseServerClient();
  await requireUser(client);
  await requireStaffRole(client, roles);
  return client;
}

export async function transitionOrderAction(_previous: OrderActionState, formData: FormData): Promise<OrderActionState> {
  const parsed = orderTransitionSchema.safeParse({ orderId: text(formData, "orderId"), toStatus: text(formData, "toStatus"), note: text(formData, "note") });
  if (!parsed.success) return { ok: false, message: "Transizione non valida." };
  try {
    const client = await clientFor(MANAGERS);
    const { error } = await client.rpc("transition_order_status", { p_order_id: parsed.data.orderId, p_to_status: parsed.data.toStatus, ...(parsed.data.note ? { p_note: parsed.data.note } : {}) });
    if (error) return failure(error);
    refresh(parsed.data.orderId);
    return { ok: true, message: "Stato ordine aggiornato." };
  } catch (error) { return failure(error); }
}

export async function cancelOrderAction(_previous: OrderActionState, formData: FormData): Promise<OrderActionState> {
  const parsed = orderCancellationSchema.safeParse({ orderId: text(formData, "orderId"), note: text(formData, "note"), confirmed: formData.get("confirmed") === "on" });
  if (!parsed.success) return { ok: false, message: "Conferma annullamento e motivazione." };
  try {
    const client = await clientFor(MANAGERS);
    const { error } = await client.rpc("cancel_order_and_restore_stock", { p_order_id: parsed.data.orderId, p_note: parsed.data.note });
    if (error) return failure(error);
    refresh(parsed.data.orderId);
    return { ok: true, message: "Ordine annullato e stock ripristinato." };
  } catch (error) { return failure(error); }
}

export async function setOrderTrackingAction(_previous: OrderActionState, formData: FormData): Promise<OrderActionState> {
  const parsed = trackingSchema.safeParse({ orderId: text(formData, "orderId"), carrier: text(formData, "carrier"), code: text(formData, "code"), url: text(formData, "url") });
  if (!parsed.success) return { ok: false, message: "Tracking non valido. Usa un URL HTTPS." };
  try {
    const client = await clientFor(MANAGERS);
    const { error } = await client.rpc("set_order_tracking", { p_order_id: parsed.data.orderId, p_carrier: parsed.data.carrier, p_code: parsed.data.code, ...(parsed.data.url ? { p_url: parsed.data.url } : {}) });
    if (error) return failure(error);
    refresh(parsed.data.orderId);
    return { ok: true, message: "Tracking salvato." };
  } catch (error) { return failure(error); }
}

export async function addOrderNoteAction(_previous: OrderActionState, formData: FormData): Promise<OrderActionState> {
  const parsed = orderNoteSchema.safeParse({ orderId: text(formData, "orderId"), note: text(formData, "note") });
  if (!parsed.success) return { ok: false, message: "Inserisci una nota valida." };
  try {
    const client = await clientFor(MANAGERS);
    const { error } = await client.rpc("add_order_note", { p_order_id: parsed.data.orderId, p_note: parsed.data.note });
    if (error) return failure(error);
    refresh(parsed.data.orderId);
    return { ok: true, message: "Nota interna aggiunta." };
  } catch (error) { return failure(error); }
}

export async function prepareOrderRefundAction(_previous: OrderActionState, formData: FormData): Promise<OrderActionState> {
  const parsed = refundPreparationSchema.safeParse({ orderId: text(formData, "orderId"), amountCents: cents(text(formData, "amount")), reason: text(formData, "reason") });
  if (!parsed.success) return { ok: false, message: "Importo e motivazione non validi." };
  try {
    const client = await clientFor(MANAGERS);
    const { error } = await client.rpc("prepare_order_refund", { p_order_id: parsed.data.orderId, p_amount_cents: parsed.data.amountCents, p_reason: parsed.data.reason });
    if (error) return failure(error);
    refresh(parsed.data.orderId);
    return { ok: true, message: "Rimborso preparato. Nessun pagamento esterno eseguito." };
  } catch (error) { return failure(error); }
}
