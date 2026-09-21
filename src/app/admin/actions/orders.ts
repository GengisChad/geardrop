"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireStaffRole, requireUser } from "@/lib/auth/guards";
import { sendEmail, SHOP_EMAIL } from "@/lib/email/resend";
import { carrierById, normalizeTrackingCode } from "@/lib/orders/carriers";
import { refundNotificationEmail } from "@/lib/orders/refund-email";
import { shippingNotificationEmail } from "@/lib/orders/shipping-email";
import type { Database } from "@/lib/supabase/database.types";
import {
  orderCancellationSchema,
  orderNoteSchema,
  orderTransitionSchema,
  refundPreparationSchema,
  refundStripeSchema,
  shipOrderSchema,
  trackingSchema,
} from "@/lib/admin/orders";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createStripeClient } from "@/lib/payments/stripe-api";

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
  // Supabase RPC errors are plain objects with a message, not Error instances.
  const message =
    error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String(error.message) : "";
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

type ShipmentEmailResult = { readonly ok: true } | { readonly ok: false; readonly message: string };

/** Why Resend refused, in words the owner can act on. */
function emailFailure(reason: "not_configured" | "rejected", detail?: string): string {
  if (reason === "not_configured") return "l'invio email non è configurato (manca RESEND_API_KEY).";
  if (detail && /testing emails|verify a domain|domain is not verified|not verified/i.test(detail)) {
    return "il dominio geardropshop.it non è ancora verificato su Resend, quindi l'email può arrivare solo a te.";
  }
  return `Resend ha rifiutato l'invio (${detail ?? "errore sconosciuto"}).`;
}

/** Emails the buyer that the order has shipped and stamps the order, so it is not sent twice. */
async function sendShipmentEmail(client: SupabaseClient<Database>, orderId: number): Promise<ShipmentEmailResult> {
  const [order, items] = await Promise.all([
    client
      .from("orders")
      .select("order_number,email,status,tracking_carrier,tracking_code,tracking_url,shipping_address_snapshot")
      .eq("id", orderId)
      .single(),
    client.from("order_items").select("product_name_snapshot,quantity").eq("order_id", orderId).order("id"),
  ]);
  if (order.error || items.error) return { ok: false, message: "non riesco a leggere l'ordine." };
  if (order.data.status !== "shipped" && order.data.status !== "completed") return { ok: false, message: "l'ordine non risulta spedito." };

  const content = shippingNotificationEmail({
    orderNumber: order.data.order_number,
    email: order.data.email,
    carrier: order.data.tracking_carrier,
    trackingCode: order.data.tracking_code,
    trackingUrl: order.data.tracking_url,
    shippingAddress: order.data.shipping_address_snapshot,
    items: (items.data ?? []).map((item) => ({ name: item.product_name_snapshot, quantity: item.quantity })),
  });
  const sent = await sendEmail({
    ...content,
    replyTo: SHOP_EMAIL,
    idempotencyKey: `gd-order-shipped-${orderId}-${order.data.tracking_code ?? "senza-codice"}`,
  });
  if (!sent.ok) return { ok: false, message: emailFailure(sent.reason, sent.detail) };

  const { error } = await client.rpc("mark_order_shipping_notified", { p_order_id: orderId });
  if (error) return { ok: false, message: "email inviata, ma non sono riuscito a segnarla sull'ordine." };
  return { ok: true };
}

export async function shipOrderAction(_previous: OrderActionState, formData: FormData): Promise<OrderActionState> {
  const parsed = shipOrderSchema.safeParse({
    orderId: text(formData, "orderId"),
    carrierId: text(formData, "carrierId"),
    code: text(formData, "code"),
    url: text(formData, "url"),
    notify: formData.get("notify") === "on",
  });
  const carrier = parsed.success ? carrierById(parsed.data.carrierId) : undefined;
  if (!parsed.success || !carrier) return { ok: false, message: "Scegli il corriere e controlla codice e link (solo HTTPS)." };
  const code = normalizeTrackingCode(carrier.id, parsed.data.code);
  try {
    const client = await clientFor(MANAGERS);
    const { error } = await client.rpc("ship_order", {
      p_order_id: parsed.data.orderId,
      p_carrier: carrier.label,
      ...(code ? { p_code: code } : {}),
      ...(parsed.data.url ? { p_url: parsed.data.url } : {}),
    });
    if (error) return failure(error);
    refresh(parsed.data.orderId);
    if (!parsed.data.notify) return { ok: true, message: "Ordine segnato come spedito. Nessuna email inviata." };

    const email = await sendShipmentEmail(client, parsed.data.orderId);
    refresh(parsed.data.orderId);
    return email.ok
      ? { ok: true, message: "Ordine spedito ed email inviata al cliente." }
      : { ok: false, message: `Ordine segnato come spedito, ma l'email non è partita: ${email.message}` };
  } catch (error) {
    return failure(error);
  }
}

function stripeRefundFailure(error: unknown): OrderActionState {
  const message = error instanceof Error ? error.message : "";
  // Stripe error messages mention permission issues in specific ways
  if (/insufficient_permissions|api_key.*permission|RefundPermission|refunds.*not.*allowed/i.test(message)) {
    return { ok: false, message: "La chiave Stripe non ha il permesso per i rimborsi: abilitalo nella chiave limitata su Stripe." };
  }
  if (/no such charge|no such payment_intent/i.test(message)) {
    return { ok: false, message: "Il pagamento Stripe non esiste o non è associato a questo ordine." };
  }
  if (/charge_already_refunded|already been fully refunded/i.test(message)) {
    return { ok: false, message: "Il pagamento risulta già rimborsato su Stripe." };
  }
  if (/invalid_request/i.test(message)) {
    return { ok: false, message: `Richiesta non valida: ${message.replace(/^Stripe [A-Z]+ .* → \d+: /, "").slice(0, 120)}` };
  }
  return { ok: false, message: "Il rimborso su Stripe non è andato a buon fine. Verifica la chiave e riprova." };
}

export async function refundStripeAction(_previous: OrderActionState, formData: FormData): Promise<OrderActionState> {
  const parsed = refundStripeSchema.safeParse({
    orderId: text(formData, "orderId"),
    amountCents: cents(text(formData, "amount")),
    reason: text(formData, "reason"),
    confirmed: formData.get("confirmed") === "on",
    restoreStock: formData.get("restoreStock") === "on",
    notifyCustomer: formData.get("notifyCustomer") === "on",
    alreadyRefunded: formData.get("alreadyRefunded") === "on",
    attempt: text(formData, "attempt"),
  });
  if (!parsed.success) return { ok: false, message: "Importo, motivazione e conferma sono obbligatori." };

  try {
    const client = await clientFor(MANAGERS);

    // Read the order to get the payment intent id and current state.
    const { data: order, error: orderError } = await client
      .from("orders")
      .select("id,order_number,email,shipping_address_snapshot,stripe_payment_intent_id,payment_status,total_cents,refunded_cents,status")
      .eq("id", parsed.data.orderId)
      .single();

    if (orderError || !order) return { ok: false, message: "Ordine non trovato." };
    if (!order.stripe_payment_intent_id) return { ok: false, message: "Questo ordine non ha un pagamento Stripe collegato." };
    if (!["authorized", "paid"].includes(order.payment_status)) return { ok: false, message: "Il pagamento non è in uno stato rimborsabile." };
    const remaining = order.total_cents - order.refunded_cents;
    if (parsed.data.amountCents > remaining) {
      return { ok: false, message: `Puoi rimborsare al massimo ${(remaining / 100).toFixed(2).replace(".", ",")} €.` };
    }

    let refund: { readonly id: string };
    if (parsed.data.alreadyRefunded) {
      // Done by hand in the Stripe dashboard: the shop only records it and writes to the buyer.
      refund = { id: `dashboard-${parsed.data.attempt.slice(0, 8)}` };
    } else {
      const secretKey = process.env["STRIPE_SECRET_KEY"]?.trim();
      if (!secretKey) return { ok: false, message: "La configurazione Stripe non è disponibile." };

      // Call Stripe to create the refund
      const stripe = createStripeClient(secretKey);
      const idempotencyKey = `gd-refund-${order.order_number}-${parsed.data.attempt}`;
      type StripeRefund = { readonly id: string; readonly status: string };
      refund = await stripe.post<StripeRefund>("/refunds", {
        payment_intent: order.stripe_payment_intent_id,
        amount: parsed.data.amountCents,
        reason: "requested_by_customer",
        "metadata[order_number]": order.order_number,
      }, idempotencyKey);
    }

    // Record the refund in the database
    const { error: recordError } = await client.rpc("record_order_refund", {
      p_order_id: parsed.data.orderId,
      p_amount_cents: parsed.data.amountCents,
      p_reason: parsed.data.reason,
      p_stripe_refund_id: refund.id,
    });
    if (recordError) return failure(recordError);

    // Optionally restore stock (only when the order has not shipped yet)
    if (parsed.data.restoreStock && ["pending", "confirmed", "processing"].includes(order.status)) {
      const { error: cancelError } = await client.rpc("cancel_order_and_restore_stock", {
        p_order_id: parsed.data.orderId,
        p_note: `Rimborso Stripe ${refund.id}: ${parsed.data.reason}`,
      });
      if (cancelError) {
        refresh(parsed.data.orderId);
        return { ok: false, message: "Rimborso Stripe eseguito, ma il ripristino stock non è riuscito." };
      }
    }

    refresh(parsed.data.orderId);
    const done = parsed.data.alreadyRefunded ? "Rimborso fatto su Stripe registrato" : `Rimborso ${refund.id} eseguito su Stripe`;
    if (!parsed.data.notifyCustomer) return { ok: true, message: `${done}.` };

    // The money is back either way: an email that fails is reported, never undoes the refund.
    const sent = await sendEmail({
      ...refundNotificationEmail({
        orderNumber: order.order_number,
        email: order.email,
        shippingAddress: order.shipping_address_snapshot,
        amountCents: parsed.data.amountCents,
        refundedCents: order.refunded_cents + parsed.data.amountCents,
        totalCents: order.total_cents,
        reason: parsed.data.reason,
      }),
      replyTo: SHOP_EMAIL,
      idempotencyKey: `gd-order-refund-${order.order_number}-${refund.id}`,
    });
    return sent.ok
      ? { ok: true, message: `${done} ed email inviata al cliente.` }
      : { ok: true, message: `${done}, ma l'email non è partita: ${emailFailure(sent.reason, sent.detail)}` };
  } catch (error) {
    return stripeRefundFailure(error);
  }
}

/** Sends the shipping email to every shipped order still waiting for one. */
export async function notifyShippedOrdersAction(_previous: OrderActionState, _formData: FormData): Promise<OrderActionState> {
  try {
    const client = await clientFor(MANAGERS);
    const pending = await client
      .from("orders")
      .select("id,order_number")
      .in("status", ["shipped", "completed"])
      .is("shipping_notified_at", null)
      .order("shipped_at", { ascending: true })
      .limit(50);
    if (pending.error) return { ok: false, message: "Non riesco a leggere gli ordini spediti." };
    if (!pending.data.length) return { ok: true, message: "Tutti gli ordini spediti hanno già ricevuto l'email." };

    const failed: string[] = [];
    for (const order of pending.data) {
      const result = await sendShipmentEmail(client, order.id);
      if (!result.ok) failed.push(`${order.order_number}: ${result.message}`);
    }
    revalidatePath("/admin/ordini");
    const sent = pending.data.length - failed.length;
    return failed.length === 0
      ? { ok: true, message: `Email di spedizione inviate: ${sent}.` }
      : { ok: sent > 0, message: `Inviate ${sent} di ${pending.data.length}. ${failed.join(" · ")}` };
  } catch (error) {
    return failure(error);
  }
}
