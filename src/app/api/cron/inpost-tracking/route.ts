import { NextResponse, type NextRequest } from "next/server";
import { syncInpostDeliveries } from "@/lib/orders/inpost-delivery";

/**
 * GET /api/cron/inpost-tracking — run by Vercel Cron (vercel.json), once a day.
 *
 * Follows every InPost order still marked shipped and closes the ones InPost reports collected,
 * emailing the buyer. Vercel sends `Authorization: Bearer $CRON_SECRET`; without the secret set,
 * the route refuses everyone, so nobody else can make the shop email its buyers.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env["CRON_SECRET"]?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await syncInpostDeliveries();
    console.info("[inpost-tracking]", JSON.stringify(result));
    return NextResponse.json(result);
  } catch (error) {
    console.error("[inpost-tracking]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "sync failed" }, { status: 500 });
  }
}
