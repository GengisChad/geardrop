import "server-only";

import { after } from "next/server";
import { BUNDLES } from "@/data/catalog";
import { withBundles } from "@/lib/commerce/bundles";
import { loadFreshCatalogue } from "@/lib/commerce/live-stock";
import type { Product } from "@/lib/commerce/types";
import { getSnapshotRowByMonth, listArchive, listRankingRows } from "@/lib/meta/repository";
import { createPrivilegedSupabaseClient } from "@/lib/supabase/admin";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { createInpostClient, inpostConfig } from "@/lib/shipping/inpost";
import { lockerLabel } from "@/lib/shipping/locker";
import { callTelegram, createTelegramGateway, readTelegramConfig, type TelegramConfig } from "./api";
import { scanNews, scanSummary, type NewsDeps, type ScanReport } from "./bot";
import { isPaypalHandle, newPreorderCode } from "./preorder-rules";
import type { PreorderDeps } from "./preorders";
import { createSupabasePreorderStore } from "./supabase-preorder-store";
import { paidCheckoutFromPreorder } from "./preorder-order";
import { customerOrderEmail } from "@/lib/orders/order-email";
import { SHOP_EMAIL, sendEmail } from "@/lib/email/resend";
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
    // A paid PayPal.me reservation becomes an order of the shop, and the buyer gets the same
    // confirmation email a Stripe order sends (opt-in, like that one: ORDER_CUSTOMER_EMAILS).
    recordOrder: async (preorder) => {
      const result = await client.rpc("record_telegram_preorder_order", { p_preorder_id: preorder.id });
      const row = result.data?.[0];
      if (result.error || !row) throw new Error(`record_telegram_preorder_order: ${result.error?.message ?? "no row"}`);
      if (row.created && process.env["ORDER_CUSTOMER_EMAILS"] === "true" && preorder.email) {
        const content = customerOrderEmail(paidCheckoutFromPreorder(preorder, row.order_number, new Date()), {
          id: row.order_id,
          orderNumber: row.order_number,
          preorderQuantities: [preorder.quantity],
        });
        const sent = await sendEmail({ to: preorder.email, replyTo: SHOP_EMAIL, idempotencyKey: `gd-order-customer-${row.order_id}`, ...content });
        if (!sent.ok) console.error("[telegram-preorders] confirmation not sent:", sent.reason, sent.detail ?? "");
      }
      return { orderNumber: row.order_number, created: row.created };
    },
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
 */
export function scanNewsAfterChange(): void {
  if (!readTelegramConfig()) return;
  try {
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
