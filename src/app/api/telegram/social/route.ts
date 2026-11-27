import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { readTelegramConfig } from "@/lib/telegram/api";
import { publishSocialNow, showWaitingDrafts } from "@/lib/telegram/bot";
import { createNewsDeps } from "@/lib/telegram/runtime";
import { parseSocialRequest } from "@/lib/telegram/social";

/**
 * POST /api/telegram/social — called by `pnpm telegram social` (scripts/telegram.ts) to turn a picture
 * or clip published on Instagram into a draft for the channel (owner, 2026-11-27: "tutto quello che
 * pubblichi su IG mandalo anche su telegram con collegamento al pagamento del sito").
 *
 * The script has already put the media in the owner's chat, so Telegram holds it; this stores the
 * draft and shows it to the owner with «Pubblica» and «Scarta», like every other piece of news.
 * Nothing reaches the channel from here, unless the request says `publish`: the scheduled
 * Instagram publisher sends that once the same post is live on Instagram, and the post goes
 * straight to the channel (bot.ts, publishSocialNow).
 *
 * The caller sends the bot's own secret (TELEGRAM_WEBHOOK_SECRET) as a bearer token: without it set,
 * the route refuses everyone.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const config = readTelegramConfig();
  if (!config?.webhookSecret) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const bearer = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!sameSecret(bearer, config.webhookSecret)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = parseSocialRequest(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.reason }, { status: 400 });

  const deps = createNewsDeps(config);
  const { slug } = parsed.event.payload;
  try {
    if (slug && !(await deps.loadProducts()).some((product) => product.slug === slug)) {
      return NextResponse.json({ error: `${slug} non è nel catalogo` }, { status: 404 });
    }
    if (parsed.publish) {
      const sent = await publishSocialNow(parsed.event, deps);
      return sent.ok ? NextResponse.json({ ok: true, published: true, url: sent.url, already: sent.already === true }) : NextResponse.json({ error: sent.reason }, { status: 409 });
    }
    const added = await deps.store.addDrafts([parsed.event]);
    const sent = await showWaitingDrafts(deps);
    return NextResponse.json({ ok: true, added, sent });
  } catch (error) {
    console.error("[telegram-social]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "non riesco a creare la bozza adesso" }, { status: 500 });
  }
}
