import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_EVENTS = new Set([
  "product_view",
  "add_to_cart",
  "cart_view",
  "checkout_view",
  "checkout_submit",
]);

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as { event?: unknown };
    const event = typeof body.event === "string" ? body.event : null;

    // Unknown events are silently dropped — no error to the client.
    if (!event || !ALLOWED_EVENTS.has(event)) {
      return NextResponse.json({ ok: true });
    }

    const client = await createSupabaseServerClient();
    // Fire-and-forget: the RPC whitelists events server-side too.
    await client.rpc("track_storefront_event", { p_event: event });

    return NextResponse.json({ ok: true });
  } catch {
    // Never expose an error to the buyer — funnel tracking is invisible infrastructure.
    return NextResponse.json({ ok: true });
  }
}
