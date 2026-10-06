import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { BUNDLES, PRODUCTS } from "@/data/catalog";
import { orderNotificationRecipient, sendEmail } from "@/lib/email/resend";
import { STOREFRONT_CACHE_TAGS } from "@/lib/storefront/cache";
import { aiReaderConfigured, readSaleWithClaude, type CatalogueEntry } from "@/lib/vinted/ai-reader";
import { ownerNoticeEmail } from "@/lib/vinted/owner-email";
import { processInboundEmail } from "@/lib/vinted/process-inbound";
import { fetchReceivedEmail, parseReceivedEvent, verifySvixSignature } from "@/lib/vinted/resend-inbound";
import { createSupabaseInboundStore } from "@/lib/vinted/supabase-inbound-store";

/**
 * Resend → shop, for the Vinted sales Gmail forwards to the Resend inbound address.
 *
 * Register https://geardropshop.it/api/vinted/inbound in Resend as a webhook for
 * "email.received"; its signing secret goes in RESEND_WEBHOOK_SECRET. RESEND_API_KEY must be
 * allowed to read received emails. ANTHROPIC_API_KEY is optional: without it the sync still
 * records every sale named by code and leaves the rest in /admin/vinted.
 *
 * A non-2xx answer makes Resend retry; the email id makes a retry harmless.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CATALOGUE: readonly CatalogueEntry[] = [
  ...PRODUCTS.map((product) => ({ slug: product.slug, name: product.name })),
  ...BUNDLES.map((bundle) => ({ slug: bundle.slug, name: bundle.name, ships: bundle.bundleOf ?? [] })),
];
const NAMES = new Map(PRODUCTS.map((product) => [product.slug, product.name]));

export async function POST(request: Request) {
  const webhookSecret = process.env["RESEND_WEBHOOK_SECRET"]?.trim();
  const apiKey = process.env["RESEND_API_KEY"]?.trim();
  const missing = [
    ["RESEND_WEBHOOK_SECRET", webhookSecret],
    ["RESEND_API_KEY", apiKey],
    ["NEXT_PUBLIC_SUPABASE_URL", process.env["NEXT_PUBLIC_SUPABASE_URL"]?.trim()],
    ["SUPABASE_SECRET_KEY", process.env["SUPABASE_SECRET_KEY"]?.trim()],
  ].flatMap(([name, value]) => (value ? [] : [name]));
  if (!webhookSecret || !apiKey || missing.length > 0) {
    console.error(`[vinted-inbound] missing environment: ${missing.join(", ")}`);
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const payload = await request.text();
  const signed = verifySvixSignature(
    payload,
    {
      id: request.headers.get("svix-id"),
      timestamp: request.headers.get("svix-timestamp"),
      signature: request.headers.get("svix-signature"),
    },
    webhookSecret,
  );
  if (!signed) return NextResponse.json({ error: "invalid_signature" }, { status: 400 });

  const event = parseReceivedEvent(payload);
  if (!event) return NextResponse.json({ error: "invalid_event" }, { status: 400 });
  if (event.type !== "email.received" || !event.emailId) return NextResponse.json({ received: true, ignored: event.type });

  try {
    const email = await fetchReceivedEmail(event.emailId, apiKey);
    const result = await processInboundEmail(email, {
      store: createSupabaseInboundStore(),
      products: PRODUCTS,
      catalogue: CATALOGUE,
      ...(aiReaderConfigured() ? { readWithAi: readSaleWithClaude } : {}),
      notifyOwner: async (notice) => {
        const content = ownerNoticeEmail(notice, NAMES);
        const sent = await sendEmail({
          to: orderNotificationRecipient(),
          subject: content.subject,
          html: content.html,
          text: content.text,
          ...(content.idempotencyKey ? { idempotencyKey: content.idempotencyKey } : {}),
        });
        // The sale is already stored and shown in the panel; a lost email must not lose it.
        if (!sent.ok) console.error(`[vinted-inbound] owner email ${sent.reason} ${sent.detail ?? ""}`);
      },
    });

    if (result.status === "recorded") {
      // The shelf just changed: every page that shows availability reads it again.
      revalidateTag(STOREFRONT_CACHE_TAGS.products, { expire: 0 });
      console.info(`[vinted-inbound] sale ${result.saleId} recorded: ${result.lines.map((line) => `${line.taken}/${line.quantity} ${line.slug}`).join(", ")}`);
    } else {
      console.info(`[vinted-inbound] ${event.emailId} ${result.status}`);
    }
    return NextResponse.json({ received: true, status: result.status });
  } catch (error) {
    console.error(`[vinted-inbound] ${event.emailId} failed: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
