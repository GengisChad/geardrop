import { NextResponse, type NextRequest } from "next/server";
import { applyInpostEvent } from "@/lib/orders/inpost-delivery";
import { inpostSignatureValid, parseInpostWebhook } from "@/lib/shipping/inpost-webhook";

/**
 * POST /api/inpost/webhook — InPost's Shipment.Tracking events.
 *
 * InPost turns the subscription on by request (Account Manager or Integration Team: this URL, the
 * events, and the shared HMAC secret, which goes in INPOST_WEBHOOK_SECRET). Until then the daily
 * cron does the same work. InPost wants a quick 200 and retries otherwise; a repeated event is a
 * no-op because an order already completed is left alone.
 */

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const secret = process.env["INPOST_WEBHOOK_SECRET"]?.trim();
  if (!secret) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const rawBody = await request.text();
  if (!inpostSignatureValid(rawBody, request.headers.get("x-inpost-signature"), request.headers.get("x-inpost-timestamp"), secret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const event = parseInpostWebhook(rawBody);
  if (!event) return NextResponse.json({ ok: true, result: "ignored" });
  try {
    const result = await applyInpostEvent(event);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("[inpost-webhook]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
