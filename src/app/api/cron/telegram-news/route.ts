import { NextResponse, type NextRequest } from "next/server";
import { runNewsScan } from "@/lib/telegram/runtime";

/**
 * GET /api/cron/telegram-news — run by Vercel Cron (vercel.json), once a day.
 *
 * Looks at the shop for news (arrivals, restocks, lower prices, a new tier list, a new video) and
 * sends the owner a draft of each in his private chat with the bot. Nothing reaches the channel
 * from here: only his tap on "Pubblica" does. The back office also asks for a look after a save
 * that can be news; this daily one catches what never passes through it, such as a price list
 * applied by a migration or a new upload on the channel.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET`; without the secret set the route refuses
 * everyone, like the InPost one.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env["CRON_SECRET"]?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const report = await runNewsScan();
    if (!report) return NextResponse.json({ result: "not configured" });
    console.info("[telegram-news]", JSON.stringify(report));
    return NextResponse.json(report);
  } catch (error) {
    console.error("[telegram-news]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "scan failed" }, { status: 500 });
  }
}
