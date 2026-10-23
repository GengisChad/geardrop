import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail, SHOP_EMAIL } from "@/lib/email/resend";
import { createInpostClient, inpostConfig, type InpostClient, type ParcelTracking } from "@/lib/shipping/inpost";
import { eventLabel, parcelOutcome, type ParcelOutcome } from "@/lib/shipping/inpost-tracking";
import type { Database } from "@/lib/supabase/database.types";
import { createPrivilegedSupabaseClient } from "@/lib/supabase/admin";
import { deliveryConfirmationEmail } from "./delivery-email";
import { emailShell, escapeHtml } from "./order-email";

/**
 * Closes InPost orders on their own (owner, 2026-10-23: "fai tu tutto quello che serve per
 * tracking, aggiornamenti"). When InPost reports the parcel collected from the Locker, the order
 * turns completed exactly as "Conferma consegna" would make it, and the buyer gets the same
 * "è arrivato" email. A parcel on its way back to the shop is flagged to the owner instead.
 *
 * Runs from the daily cron (/api/cron/inpost-tracking) and from InPost's webhook once InPost
 * turns it on for the account; both paths are idempotent.
 */

/** The InPost carrier label ship_order stores on the order (CARRIERS in carriers.ts). */
export const INPOST_CARRIER_LABEL = "InPost";

type Client = SupabaseClient<Database>;

export type DeliverySyncResult = {
  readonly checked: number;
  readonly delivered: readonly string[];
  readonly failed: readonly string[];
  /** Orders InPost closed on an earlier run whose "è arrivato" email had not gone out; sent now. */
  readonly emailRetried: number;
};

/** A shipped order and what InPost says about its parcel. */
export type TrackedOrder = { readonly id: number; readonly orderNumber: string; readonly trackingCode: string };

/** Pairs each order with the outcome of its parcel; orders InPost knows nothing about are left out. */
export function outcomesFor(
  orders: readonly TrackedOrder[],
  parcels: readonly ParcelTracking[],
): readonly { readonly order: TrackedOrder; readonly outcome: ParcelOutcome; readonly lastCode: string | null }[] {
  const byNumber = new Map(parcels.map((parcel) => [parcel.trackingNumber, parcel]));
  return orders.flatMap((order) => {
    const parcel = byNumber.get(order.trackingCode);
    if (!parcel || parcel.events.length === 0) return [];
    return [{ order, outcome: parcelOutcome(parcel.events), lastCode: parcel.events.at(-1)?.code ?? null }];
  });
}

/** Marks a shipped order delivered and emails the buyer. False when it was no longer shipped. */
export async function recordInpostDelivery(client: Client, orderId: number, at: string, code: string): Promise<boolean> {
  const updated = await client
    .from("orders")
    .update({ status: "completed", delivered_at: at })
    .eq("id", orderId)
    .eq("status", "shipped")
    .select("id")
    .maybeSingle();
  if (updated.error) throw new Error(`[inpost-delivery] order ${orderId}: ${updated.error.message}`);
  if (!updated.data) return false;

  const note = `InPost: ${eventLabel(code)}`;
  await client.from("order_status_events").insert({ order_id: orderId, from_status: "shipped", to_status: "completed", note });
  await client.from("audit_events").insert({
    action: "order.delivered",
    entity_type: "orders",
    entity_id: String(orderId),
    before_state: { status: "shipped" },
    after_state: { status: "completed", source: "inpost", event: code },
  });
  await sendDeliveryEmail(client, orderId);
  return true;
}

/**
 * Orders InPost closed whose buyer was never told (Resend refused or timed out on that run). Only
 * closures written by this module: an order the owner completed with "Conferma consegna" and the
 * email box unticked stays silent.
 */
async function retryDeliveryEmails(client: Client, since: string): Promise<number> {
  const closed = await client
    .from("order_status_events")
    .select("order_id")
    .eq("to_status", "completed")
    .like("note", "InPost:%")
    .gte("created_at", since)
    .limit(200);
  const ids = [...new Set((closed.data ?? []).map((row) => row.order_id))];
  if (closed.error || ids.length === 0) return 0;
  const pending = await client.from("orders").select("id").in("id", ids).eq("status", "completed").is("delivery_notified_at", null);
  let sent = 0;
  for (const row of pending.data ?? []) {
    if (await sendDeliveryEmail(client, row.id)) sent += 1;
  }
  return sent;
}

/** True once the buyer has the email (now or before). */
async function sendDeliveryEmail(client: Client, orderId: number): Promise<boolean> {
  const [order, items] = await Promise.all([
    client
      .from("orders")
      .select("order_number,email,tracking_carrier,tracking_code,tracking_url,shipping_address_snapshot,delivery_notified_at")
      .eq("id", orderId)
      .single(),
    client.from("order_items").select("product_name_snapshot,quantity").eq("order_id", orderId).order("id"),
  ]);
  if (order.error || items.error) return false;
  if (order.data.delivery_notified_at) return true;

  const content = deliveryConfirmationEmail({
    orderNumber: order.data.order_number,
    email: order.data.email,
    carrier: order.data.tracking_carrier,
    trackingCode: order.data.tracking_code,
    trackingUrl: order.data.tracking_url,
    shippingAddress: order.data.shipping_address_snapshot,
    items: (items.data ?? []).map((item) => ({ name: item.product_name_snapshot, quantity: item.quantity })),
  });
  // Same key as the admin's "Conferma consegna": the buyer never gets this email twice.
  const sent = await sendEmail({ ...content, replyTo: SHOP_EMAIL, idempotencyKey: `gd-order-delivered-${orderId}` });
  if (!sent.ok) {
    // The next run retries it (retryDeliveryEmails); Resend's idempotency key keeps it to one email.
    console.error("[inpost-delivery] delivery email", orderId, sent.reason, sent.detail ?? "");
    return false;
  }
  await client.from("orders").update({ delivery_notified_at: new Date().toISOString() }).eq("id", orderId);
  return true;
}

/**
 * Tells the owner a parcel will not reach the buyer: it is coming back, or InPost lost it. Once
 * per order and event: the note it leaves on the order is what the next run checks.
 */
async function alertOwner(client: Client, order: TrackedOrder, code: string): Promise<void> {
  const what = eventLabel(code);
  const note = `InPost: ${what} (${code}). Avviso inviato a ${SHOP_EMAIL}.`;
  const seen = await client.from("order_notes").select("id").eq("order_id", order.id).eq("note", note).limit(1);
  if (seen.error || (seen.data ?? []).length > 0) return;
  await client.from("order_notes").insert({ order_id: order.id, note });

  const subject = `Pacco ${order.orderNumber}: ${what.toLowerCase()} · InPost`;
  const sent = await sendEmail({
    to: SHOP_EMAIL,
    subject,
    html: emailShell(
      subject,
      `<p style="margin:0 0 12px">InPost segnala per l'ordine <strong>${escapeHtml(order.orderNumber)}</strong>: ${escapeHtml(what)} (${escapeHtml(code)}).</p>
       <p style="margin:0">Tracking ${escapeHtml(order.trackingCode)}. Scrivi al cliente dal pannello ordini.</p>`,
    ),
    text: `InPost segnala per l'ordine ${order.orderNumber}: ${what} (${code}). Tracking ${order.trackingCode}.`,
    idempotencyKey: `gd-inpost-alert-${order.id}-${code}`,
  });
  if (!sent.ok) console.error("[inpost-delivery] owner alert", order.orderNumber, sent.reason);
}

/** Every InPost order still shipped, followed on InPost; the ones collected are closed. */
export async function syncInpostDeliveries(
  client: Client = createPrivilegedSupabaseClient(),
  inpost: InpostClient | null = null,
): Promise<DeliverySyncResult> {
  const config = inpostConfig();
  const api = inpost ?? (config ? createInpostClient(config) : null);
  if (!api) return { checked: 0, delivered: [], failed: [], emailRetried: 0 };

  // InPost keeps tracking for 121 days; a parcel still open after 60 is for the owner to look at.
  const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const shipped = await client
    .from("orders")
    .select("id,order_number,tracking_code")
    .eq("status", "shipped")
    .eq("tracking_carrier", INPOST_CARRIER_LABEL)
    .not("tracking_code", "is", null)
    .gte("shipped_at", since)
    .order("id")
    .limit(200);
  if (shipped.error) throw new Error(`[inpost-delivery] ${shipped.error.message}`);
  const orders: TrackedOrder[] = (shipped.data ?? []).flatMap((row) =>
    row.tracking_code ? [{ id: row.id, orderNumber: row.order_number, trackingCode: row.tracking_code }] : [],
  );

  const parcels: ParcelTracking[] = [];
  for (let start = 0; start < orders.length; start += 10) {
    parcels.push(...(await api.track(orders.slice(start, start + 10).map((order) => order.trackingCode))));
  }

  const delivered: string[] = [];
  const failed: string[] = [];
  for (const { order, outcome } of outcomesFor(orders, parcels)) {
    if (outcome.kind === "delivered") {
      if (await recordInpostDelivery(client, order.id, outcome.at, outcome.code)) delivered.push(order.orderNumber);
    } else if (outcome.kind === "failed") {
      await alertOwner(client, order, outcome.code);
      failed.push(order.orderNumber);
    }
  }
  const emailRetried = await retryDeliveryEmails(client, since);
  return { checked: orders.length, delivered, failed, emailRetried };
}

/** One webhook event: closes the order when it is a delivery, flags it when the parcel turns back. */
export async function applyInpostEvent(
  event: { readonly trackingNumber: string; readonly eventCode: string; readonly timestamp: string },
  client: Client = createPrivilegedSupabaseClient(),
): Promise<"delivered" | "flagged" | "ignored"> {
  const found = await client
    .from("orders")
    .select("id,order_number,tracking_code,status")
    .eq("tracking_carrier", INPOST_CARRIER_LABEL)
    .eq("tracking_code", event.trackingNumber)
    .maybeSingle();
  if (found.error || !found.data || found.data.status !== "shipped") return "ignored";
  const order = { id: found.data.id, orderNumber: found.data.order_number, trackingCode: event.trackingNumber };
  const outcome = parcelOutcome([{ code: event.eventCode, at: event.timestamp, place: null }]);
  if (outcome.kind === "delivered") {
    return (await recordInpostDelivery(client, order.id, outcome.at, event.eventCode)) ? "delivered" : "ignored";
  }
  if (outcome.kind === "failed") {
    await alertOwner(client, order, outcome.code);
    return "flagged";
  }
  return "ignored";
}
