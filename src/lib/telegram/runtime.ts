import "server-only";

import { revalidateTag } from "next/cache";
import { after } from "next/server";
import { BUNDLES } from "@/data/catalog";
import { withBundles } from "@/lib/commerce/bundles";
import { loadFreshCatalogue } from "@/lib/commerce/live-stock";
import type { Product } from "@/lib/commerce/types";
import { getSnapshotRowByMonth, listArchive, listRankingRows } from "@/lib/meta/repository";
import { createPrivilegedSupabaseClient } from "@/lib/supabase/admin";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { STOREFRONT_CACHE_TAGS } from "@/lib/storefront/cache";
import { createInpostClient, inpostConfig } from "@/lib/shipping/inpost";
import { lockerLabel } from "@/lib/shipping/locker";
import { callTelegram, createTelegramGateway, readTelegramConfig, type TelegramConfig } from "./api";
import { scanNews, scanSummary, type NewsDeps, type ScanReport } from "./bot";
import { isPaypalHandle, newPreorderCode } from "./preorder-rules";
import type { PreorderDeps } from "./preorders";
import { createSupabasePreorderStore } from "./supabase-preorder-store";
import { loadEveningSummary } from "./owner-runtime";
import { createSupabaseRestockStore } from "./supabase-restock-store";
import { storefrontOrganizationId } from "@/lib/org/storefront";
import { createSupabaseNewsStore } from "./supabase-store";

/**
 * The news bot wired to the real shop: the catalogue the storefront serves, the published tier
 * lists, Telegram and the bot's tables.
 */

/** The bot's own @name never changes while the server runs: asked of Telegram once. */
let botName: Promise<string | null> | undefined;

function createPreorderDeps(config: TelegramConfig, client: ReturnType<typeof createPrivilegedSupabaseClient>): PreorderDeps {
  const handle = process.env["PAYPAL_ME_HANDLE"]?.trim();
  return {
    store: createSupabasePreorderStore(client),
    paypalHandle: isPaypalHandle(handle) ? handle : null,
    newCode: () => newPreorderCode(),
    botUsername: () =>
      (botName ??= callTelegram<{ readonly username?: string }>(config.token, "getMe", {}).then((me) => {
        const name = me.ok ? (me.result.username ?? null) : null;
        // A failed answer is not remembered: the next post asks again.
        if (!name) botName = undefined;
        return name;
      })),
    // The same Locker search the checkout uses, with the shop's own InPost credentials.
    searchLockers: async (postalCode) => {
      const inpost = inpostConfig();
      if (!inpost) throw new Error("InPost is not configured");
      return (await createInpostClient(inpost).searchLockers({ postalCode })).map((locker) => ({ id: locker.id, label: lockerLabel(locker) }));
    },
  };
}

export function createNewsDeps(config: TelegramConfig): NewsDeps {
  // One read of the catalogue per request: a run that writes eight drafts reads it once.
  let catalogue: Promise<readonly Product[]> | undefined;
  const client = createPrivilegedSupabaseClient();

  return {
    store: createSupabaseNewsStore(client),
    preorders: createPreorderDeps(config, client),
    restock: createSupabaseRestockStore(client, () => storefrontOrganizationId()),
    summary: () => loadEveningSummary(),
    // The latest published tier list, through the public key like the /meta page.
    loadRankings: async () => {
      const client = createSupabasePublicClient();
      const [latest] = await listArchive(client);
      const snapshot = latest ? await getSnapshotRowByMonth(client, latest.month) : null;
      if (!snapshot) return null;
      const rows = await listRankingRows(client, snapshot.id);
      return {
        month: snapshot.month,
        rankings: rows.map((row) => ({ tierType: row.tier_type, rank: row.rank, pieceName: row.piece_name, productSlug: row.product_slug, archetype: row.archetype })),
      };
    },
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
  };
}

/** One look at the shop. Null while the bot is not set up. */
export async function runNewsScan(): Promise<ScanReport | null> {
  const config = readTelegramConfig();
  if (!config) return null;
  const deps = createNewsDeps(config);
  const report = await scanNews(deps);
  if (report.firstLook) await deps.telegram.sendText(config.ownerChatId, scanSummary(report));
  return report;
}

/**
 * Called by the back office after a save that can be news (stock, price, a tier list): the bot
 * looks at the shop once the answer has gone back to the owner, so a draft reaches his phone a
 * moment after he loads a restock instead of the next morning. It never fails the save, and
 * without a configured bot it does nothing at all.
 *
 * What the bot announces, in a draft or in a private «Avvisami» message, is what the cart must
 * sell: the shop's cached product read expires now, instead of serving the old stock once more.
 */
export function scanNewsAfterChange(): void {
  if (!readTelegramConfig()) return;
  try {
    revalidateTag(STOREFRONT_CACHE_TAGS.products, { expire: 0 });
    after(async () => {
      try {
        await runNewsScan();
      } catch (error) {
        console.error("[telegram-news] after change:", error instanceof Error ? error.message : error);
      }
    });
  } catch {
    // Outside a request (a script, a test) there is nothing to run after.
  }
}
