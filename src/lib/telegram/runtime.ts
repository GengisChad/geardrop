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
import { paidCheckoutFromPreorder } from "./preorder-order";
import { customerOrderEmail } from "@/lib/orders/order-email";
import { SHOP_EMAIL, sendEmail } from "@/lib/email/resend";
import { loadEveningSummary } from "./owner-runtime";
import { orderFollowUrl } from "./order-follow";
import { createSupabaseOrderFollowStore } from "./supabase-order-follow-store";
import { createSupabasePollStore } from "./supabase-poll-store";
import { createSupabaseRestockStore } from "./supabase-restock-store";
import { storefrontOrganizationId } from "@/lib/org/storefront";
import { createSupabaseNewsStore } from "./supabase-store";
import { createStripeClient } from "@/lib/payments/stripe-api";
import { cartTokenGateway, remindAbandonedCarts, type CartSession } from "./cart-reminder";
import { isRomeMonday, sendSlowStock } from "./owner-tools";
import { createSupabaseOwnerToolsStore } from "./supabase-owner-tools-store";
import { createSupabaseOrderNotes, createSupabaseSupportStore } from "./supabase-support-store";

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
        }, orderFollowUrl(row.order_id));
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
  const loadProducts = () => (catalogue ??= loadFreshCatalogue().then((products) => withBundles(products, BUNDLES)));
  // Every cart link sent to a customer's private chat carries that chat, for the cart reminder.
  const telegram = cartTokenGateway(createTelegramGateway(config), config.webhookSecret, config.ownerChatId);
  const newsStore = createSupabaseNewsStore(client);
  const shop = () => storefrontOrganizationId();
  const supportStore = createSupabaseSupportStore(client);
  const orderNotes = createSupabaseOrderNotes(client, shop);
  const now = () => new Date();

  return {
    ownerTools: {
      telegram,
      ownerChatId: config.ownerChatId,
      store: createSupabaseOwnerToolsStore(client, shop),
      // As after a save in the back office: the shop's cached stock expires and the bot looks again.
      afterChange: async () => scanNewsAfterChange(),
      now,
    },
    support: { telegram, ownerChatId: config.ownerChatId, store: supportStore, now, orderNumber: orderNotes.orderNumber, shopEmail: SHOP_EMAIL },
    deliveryCheck: { telegram, ownerChatId: config.ownerChatId, secret: config.webhookSecret, support: supportStore, orders: orderNotes },
    cartReminders: { memory: { read: () => newsStore.readMemory(), write: (entries) => newsStore.writeMemory(entries) }, now },
    store: newsStore,
    preorders: createPreorderDeps(config, client),
    restock: createSupabaseRestockStore(client, () => storefrontOrganizationId()),
    summary: () => loadEveningSummary(),
    follows: {
      telegram: createTelegramGateway(config),
      store: createSupabaseOrderFollowStore(client, () => storefrontOrganizationId()),
      now: () => new Date(),
      secret: config.webhookSecret,
    },
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
    telegram,
    ownerChatId: config.ownerChatId,
    channelId: config.channelId,
    now,
    loadProducts,
    polls: { telegram: createTelegramGateway(config), store: createSupabasePollStore(client), ownerChatId: config.ownerChatId, channelId: config.channelId, loadProducts },
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

/** The shop's Checkout sessions since `since` (seconds), expired and complete, for the cart reminder. */
async function listCartSessions(since: number): Promise<readonly CartSession[]> {
  const key = process.env["STRIPE_SECRET_KEY"]?.trim();
  if (!key) return [];
  const stripe = createStripeClient(key);
  const sessions: CartSession[] = [];
  for (const status of ["expired", "complete"] as const) {
    let cursor: string | null = null;
    for (let page = 0; page < 5; page += 1) {
      const query = new URLSearchParams({ "created[gte]": String(since), status, limit: "100" });
      if (cursor) query.set("starting_after", cursor);
      const result: { readonly data: readonly CartSession[]; readonly has_more: boolean } | null = await stripe.get(`/checkout/sessions?${query}`);
      if (!result) break;
      sessions.push(...result.data);
      if (!result.has_more || result.data.length === 0) break;
      cursor = result.data.at(-1)!.id;
    }
  }
  return sessions;
}

/**
 * The morning's other jobs, with the daily look at the shop: on Mondays the list of pieces that do not
 * sell, every day the reminders for carts left unpaid from the bot. Each one failing is logged and
 * leaves the other.
 */
export async function runMorningJobs(now = new Date()): Promise<{ readonly slowStock: boolean | null; readonly cartReminders: number | null } | null> {
  const config = readTelegramConfig();
  if (!config) return null;
  const deps = createNewsDeps(config);
  let slowStock: boolean | null = null;
  let cartReminders: number | null = null;
  if (deps.ownerTools && isRomeMonday(now)) {
    try {
      slowStock = await sendSlowStock(deps.ownerTools, false);
    } catch (error) {
      console.error("[telegram-morning] slow stock:", error instanceof Error ? error.message : error);
    }
  }
  if (deps.cartReminders && config.webhookSecret) {
    try {
      cartReminders = await remindAbandonedCarts({ telegram: deps.telegram, loadProducts: deps.loadProducts, memory: deps.cartReminders.memory, listSessions: listCartSessions, now: () => now });
    } catch (error) {
      console.error("[telegram-morning] cart reminders:", error instanceof Error ? error.message : error);
    }
  }
  return { slowStock, cartReminders };
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
