import { NextResponse, type NextRequest } from "next/server";
import { sendEveningSummary } from "@/lib/telegram/owner-runtime";

/**
 * GET /api/cron/telegram-summary — run by Vercel Cron (vercel.json) at 20:00 UTC, 21:00 in Rome in
 * winter and 22:00 in summer.
 *
 * Sends the owner, in his private chat with the bot, the day's orders, what waits for him and
 * whether every payment Stripe took has its order. Nothing reaches the channel from here.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET`; without the secret set the route refuses
 * everyone, like the other crons.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env["CRON_SECRET"]?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await sendEveningSummary();
    console.info("[telegram-summary]", result);
    return NextResponse.json({ result });
  } catch (error) {
    console.error("[telegram-summary]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "summary failed" }, { status: 500 });
  }
}
