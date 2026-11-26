import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { readTelegramConfig } from "@/lib/telegram/api";
import { handleUpdate } from "@/lib/telegram/bot";
import { createNewsDeps } from "@/lib/telegram/runtime";

/**
 * POST /api/telegram/webhook — what Telegram calls when the owner taps a draft's button or writes
 * the bot a command (set once with `pnpm telegram webhook set`).
 *
 * Telegram sends the secret chosen at that moment in a header with every call; without
 * TELEGRAM_WEBHOOK_SECRET the route refuses everyone, so nobody else can feed the bot updates.
 * Who pressed the button is checked again inside: only the owner's account publishes.
 *
 * Telegram repeats a call that does not answer 200, so a failure while handling is logged and
 * still answered: a publication must never be attempted twice because the first attempt was slow.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function sameSecret(given: string | null, expected: string): boolean {
  const a = Buffer.from(given ?? "");
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const config = readTelegramConfig();
  if (!config?.webhookSecret) return NextResponse.json({ error: "not configured" }, { status: 503 });
  if (!sameSecret(request.headers.get("x-telegram-bot-api-secret-token"), config.webhookSecret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const update: unknown = await request.json().catch(() => null);
  try {
    const result = await handleUpdate(update, createNewsDeps(config));
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("[telegram-webhook]", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: true, result: "failed" });
  }
}
