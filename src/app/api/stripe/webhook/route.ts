import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email/resend";
import { processPaidCheckout } from "@/lib/orders/process-paid-checkout";
import { loadPaidCheckout } from "@/lib/orders/stripe-order";
import { createSupabaseOrderStore } from "@/lib/orders/supabase-order-store";
import { createStripeClient } from "@/lib/payments/stripe-api";
import { parseStripeEvent, verifyStripeSignature } from "@/lib/payments/stripe-webhook";
import { STOREFRONT_CACHE_TAGS } from "@/lib/storefront/cache";

/**
 * Stripe → shop. Register https://geardropshop.it/api/stripe/webhook in Stripe with the events
 * below; its signing secret goes in STRIPE_WEBHOOK_SECRET. A non-2xx answer makes Stripe retry
 * for up to three days, which is how a temporary database or email failure heals itself.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAID_EVENTS = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded"]);

export async function POST(request: Request) {
  const webhookSecret = process.env["STRIPE_WEBHOOK_SECRET"]?.trim();
  const stripeKey = process.env["STRIPE_SECRET_KEY"]?.trim();
  const missing = [
    ["STRIPE_WEBHOOK_SECRET", webhookSecret],
    ["STRIPE_SECRET_KEY", stripeKey],
    ["NEXT_PUBLIC_SUPABASE_URL", process.env["NEXT_PUBLIC_SUPABASE_URL"]?.trim()],
    ["SUPABASE_SECRET_KEY", process.env["SUPABASE_SECRET_KEY"]?.trim()],
  ].flatMap(([name, value]) => (value ? [] : [name]));
  if (!webhookSecret || !stripeKey || missing.length > 0) {
    // 503 keeps Stripe retrying, so orders paid before the variables are set still arrive.
    console.error(`[stripe-webhook] missing environment: ${missing.join(", ")}`);
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const payload = await request.text();
  if (!verifyStripeSignature(payload, request.headers.get("stripe-signature"), webhookSecret)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  const event = parseStripeEvent(payload);
  if (!event) return NextResponse.json({ error: "invalid_event" }, { status: 400 });
  if (!PAID_EVENTS.has(event.type) || event.data.object.object !== "checkout.session" || !event.data.object.id) {
    return NextResponse.json({ received: true, ignored: event.type });
  }

  const stripe = createStripeClient(stripeKey);
  const result = await processPaidCheckout(event.data.object.id, {
    loadCheckout: (sessionId) => loadPaidCheckout(sessionId, stripe),
    store: createSupabaseOrderStore(),
    sendEmail: (message) => sendEmail(message),
  });

  if (result.status === "failed") {
    console.error(`[stripe-webhook] ${event.id} failed at ${result.step}: ${result.detail}`);
    return NextResponse.json({ error: result.step }, { status: 500 });
  }

  if (result.status === "recorded") {
    // The shelf just changed: every page that shows availability reads it again.
    if (result.order.created) revalidateTag(STOREFRONT_CACHE_TAGS.products, { expire: 0 });
    console.info(
      `[stripe-webhook] ${event.id} order ${result.order.orderNumber} ${result.order.created ? "created" : "already recorded"}, owner email ${result.ownerEmail}`,
    );
    return NextResponse.json({ received: true, order: result.order.orderNumber });
  }

  return NextResponse.json({ received: true, ignored: "unpaid" });
}
