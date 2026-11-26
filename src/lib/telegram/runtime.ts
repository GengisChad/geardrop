import "server-only";

import { after } from "next/server";
import { BUNDLES } from "@/data/catalog";
import { withBundles } from "@/lib/commerce/bundles";
import { loadFreshCatalogue } from "@/lib/commerce/live-stock";
import type { Product } from "@/lib/commerce/types";
import { getSnapshotRowByMonth, listArchive, listRankingRows } from "@/lib/meta/repository";
import { createPrivilegedSupabaseClient } from "@/lib/supabase/admin";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { createTelegramGateway, readTelegramConfig, type TelegramConfig } from "./api";
import { scanNews, scanSummary, type NewsDeps, type ScanReport } from "./bot";
import { parseYoutubeFeed } from "./news";
import { createSupabaseNewsStore } from "./supabase-store";

/**
 * The news bot wired to the real shop: the catalogue the storefront serves, the published tier
 * lists, the channel's public upload feed, Telegram and the bot's two tables.
 */

/** @GengisChadBBX, the same channel scripts/youtube-publish.ts uploads to. */
const YOUTUBE_CHANNEL_ID = "UCMMABcKm2rdcHlFIj6SWzRw";
const YOUTUBE_FEED = `https://www.youtube.com/feeds/videos.xml?channel_id=${YOUTUBE_CHANNEL_ID}`;

export function createNewsDeps(config: TelegramConfig): NewsDeps {
  // One read of the catalogue per request: a run that writes eight drafts reads it once.
  let catalogue: Promise<readonly Product[]> | undefined;

  return {
    store: createSupabaseNewsStore(createPrivilegedSupabaseClient()),
    telegram: createTelegramGateway(config),
    ownerChatId: config.ownerChatId,
    channelId: config.channelId,
    now: () => new Date(),
    loadProducts: () => (catalogue ??= loadFreshCatalogue().then((products) => withBundles(products, BUNDLES))),
    // Through the public key: row level security is what says which months are published.
    loadMetaMonths: async () => (await listArchive(createSupabasePublicClient())).map((item) => item.month),
    loadMeta: async (month) => {
      const client = createSupabasePublicClient();
      const snapshot = await getSnapshotRowByMonth(client, month);
      if (!snapshot) return null;
      const rows = await listRankingRows(client, snapshot.id);
      const topBlades = rows.filter((row) => row.tier_type === "blade").sort((a, b) => a.rank - b.rank).map((row) => row.piece_name);
      return { month: snapshot.month, title: snapshot.title, topBlades };
    },
    loadVideos: async () => {
      const response = await fetch(YOUTUBE_FEED, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
      if (!response.ok) throw new Error(`youtube feed ${response.status}`);
      return parseYoutubeFeed(await response.text());
    },
  };
}

/** One look at the shop. Null while the bot is not set up. */
export async function runNewsScan(options: { readonly videos?: boolean } = {}): Promise<ScanReport | null> {
  const config = readTelegramConfig();
  if (!config) return null;
  const deps = createNewsDeps(config);
  const report = await scanNews(deps, options);
  if (report.firstLook) await deps.telegram.sendText(config.ownerChatId, scanSummary(report));
  return report;
}

/**
 * Called by the back office after a save that can be news (stock, price, a tier list): the bot
 * looks at the shop once the answer has gone back to the owner, so a draft reaches his phone a
 * moment after he loads a restock instead of the next morning. It never fails the save, and
 * without a configured bot it does nothing at all.
 */
export function scanNewsAfterChange(): void {
  if (!readTelegramConfig()) return;
  try {
    after(async () => {
      try {
        // The upload feed has nothing to do with a save in the back office: the daily look reads it.
        await runNewsScan({ videos: false });
      } catch (error) {
        console.error("[telegram-news] after change:", error instanceof Error ? error.message : error);
      }
    });
  } catch {
    // Outside a request (a script, a test) there is nothing to run after.
  }
}
