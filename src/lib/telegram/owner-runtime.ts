import "server-only";

import { after } from "next/server";
import type { LowStockProduct } from "@/lib/orders/process-paid-checkout";
import { storefrontOrganizationId } from "@/lib/org/storefront";
import { createStripeClient } from "@/lib/payments/stripe-api";
import { createPrivilegedSupabaseClient } from "@/lib/supabase/admin";
import { createTelegramGateway, readTelegramConfig } from "./api";
import {
  eveningSummary,
  paidOrderAlert,
  paidWithoutOrderAlarm,
  startOfRomeDay,
  unrecordedSessions,
  type AlertCheckout,
  type DaySummary,
  type OwnerMessage,
  type StripeSessionRow,
} from "./owner-alerts";
import { createSupabaseNewsStore } from "./supabase-store";

/**
 * The owner's private alerts at work (owner-alerts.ts says what they say). Each one goes after the
 * answer to Stripe or to the cron, never holds an order back, and without a configured bot does
 * nothing at all.
 */

function ownerBot() {
  const config = readTelegramConfig();
  return config ? { ownerChatId: config.ownerChatId, telegram: createTelegramGateway(config) } : null;
}

function later(label: string, task: () => Promise<void>): void {
  const run = async () => {
    try {
      await task();
    } catch (error) {
      console.error(`[telegram-owner] ${label}:`, error instanceof Error ? error.message : error);
    }
  };
  try {
    after(run);
  } catch {
    // Outside a request (a script): send it now.
    void run();
  }
}

/** The Stripe webhook's alertOwner: one private message when a paid checkout becomes a new order. */
export function alertOwnerOfPaidOrder(checkout: AlertCheckout, order: { readonly id: number; readonly orderNumber: string }, lowStock: readonly LowStockProduct[]): void {
  const bot = ownerBot();
  if (!bot) return;
  const message = paidOrderAlert(checkout, order, lowStock);
  later("paid order", async () => {
    await bot.telegram.sendText(bot.ownerChatId, message.text, message.keyboard);
  });
}

const ALARM_PREFIX = "alarm:paid-without-order:";

/**
 * The webhook could not read or record a paid checkout. Stripe retries for three days; he hears it
 * once per checkout, and the evening summary repeats it while the order is still missing.
 */
export function alarmOwnerPaidWithoutOrder(sessionId: string): void {
  const bot = ownerBot();
  if (!bot) return;
  later("alarm", async () => {
    const store = createSupabaseNewsStore(createPrivilegedSupabaseClient());
    const key = `${ALARM_PREFIX}${sessionId}`;
    if ((await store.readMemory()).has(key)) return;
    const sent = await bot.telegram.sendText(bot.ownerChatId, paidWithoutOrderAlarm([sessionId]));
    if (sent !== null) await store.writeMemory(new Map([[key, { at: new Date().toISOString() }]]));
  });
}

/** How far back the evening check reads Stripe: a day and a bit, so no checkout falls between two. */
const STRIPE_LOOKBACK_HOURS = 26;

/** The shop's paid Stripe checkouts without an order, or null when Stripe or the database did not answer. */
async function unrecordedCheckouts(now: Date, shop: number): Promise<string[] | null> {
  const key = process.env["STRIPE_SECRET_KEY"]?.trim();
  if (!key) return null;
  try {
    const stripe = createStripeClient(key);
    const since = Math.floor(now.getTime() / 1000) - STRIPE_LOOKBACK_HOURS * 3600;
    const sessions: StripeSessionRow[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 5; page += 1) {
      const query = new URLSearchParams({ "created[gte]": String(since), status: "complete", limit: "100" });
      if (cursor) query.set("starting_after", cursor);
      const result: { readonly data: readonly StripeSessionRow[]; readonly has_more: boolean } | null = await stripe.get(`/checkout/sessions?${query}`);
      if (!result) return null;
      sessions.push(...result.data);
      if (!result.has_more || result.data.length === 0) break;
      cursor = result.data.at(-1)!.id;
    }
    const paid = sessions.filter((session) => session.payment_status === "paid").map((session) => session.id);
    if (paid.length === 0) return [];
    const recorded = await createPrivilegedSupabaseClient()
      .from("orders")
      .select("stripe_checkout_session_id")
      .eq("organization_id", shop)
      .in("stripe_checkout_session_id", paid);
    if (recorded.error) throw new Error(recorded.error.message);
    const known = new Set(recorded.data.flatMap((row) => (row.stripe_checkout_session_id ? [row.stripe_checkout_session_id] : [])));
    return unrecordedSessions(sessions, known, now);
  } catch (error) {
    console.error("[telegram-owner] stripe check:", error instanceof Error ? error.message : error);
    return null;
  }
}

/** Everything the evening summary says, read now from the shop's own tables and from Stripe. */
export async function loadDaySummary(now = new Date()): Promise<DaySummary> {
  const client = createPrivilegedSupabaseClient();
  const shop = await storefrontOrganizationId();
  const since = startOfRomeDay(now).toISOString();
  const [today, open, shelf, preorders, restock, unrecorded] = await Promise.all([
    client.from("orders").select("id,total_cents").eq("organization_id", shop).eq("payment_status", "paid").gte("created_at", since).limit(1000),
    client.from("orders").select("id", { count: "exact", head: true }).eq("organization_id", shop).eq("payment_status", "paid").in("status", ["confirmed", "processing"]),
    client
      .from("products")
      .select("name,slug,stock_quantity,stock_status,low_stock_threshold")
      .eq("organization_id", shop)
      .eq("publication_status", "published")
      .gt("stock_quantity", 0)
      .limit(1000),
    client.from("telegram_preorders").select("id", { count: "exact", head: true }).eq("status", "awaiting_payment").gt("expires_at", now.toISOString()),
    client.from("restock_requests").select("id", { count: "exact", head: true }).eq("organization_id", shop).is("notified_at", null),
    unrecordedCheckouts(now, shop),
  ]);
  for (const [what, result] of [["orders", today], ["open orders", open], ["products", shelf], ["preorders", preorders], ["restock", restock]] as const) {
    if (result.error) throw new Error(`day summary, ${what}: ${result.error.message}`);
  }
  const ids = (today.data ?? []).map((order) => order.id);
  const lines = ids.length > 0 ? await client.from("order_items").select("quantity").eq("organization_id", shop).in("order_id", ids) : { data: [], error: null };
  if (lines.error) throw new Error(`day summary, order lines: ${lines.error.message}`);
  return {
    day: now,
    orders: {
      count: ids.length,
      totalCents: (today.data ?? []).reduce((sum, order) => sum + order.total_cents, 0),
      pieces: (lines.data ?? []).reduce((sum, line) => sum + line.quantity, 0),
    },
    toShip: open.count ?? 0,
    lowStock: (shelf.data ?? [])
      .filter((product) => product.stock_quantity <= product.low_stock_threshold)
      .sort((a, b) => a.stock_quantity - b.stock_quantity || a.name.localeCompare(b.name, "it"))
      .map((product) => ({ name: product.name, slug: product.slug, stockQuantity: product.stock_quantity, stockStatus: product.stock_status })),
    preordersAwaitingPayment: preorders.count ?? 0,
    restockWaiting: restock.count ?? 0,
    unrecorded,
  };
}

export async function loadEveningSummary(now = new Date()): Promise<OwnerMessage> {
  return eveningSummary(await loadDaySummary(now));
}

/** The 21:00 cron: the summary in his chat. */
export async function sendEveningSummary(now = new Date()): Promise<"sent" | "not configured" | "refused"> {
  const bot = ownerBot();
  if (!bot) return "not configured";
  const message = await loadEveningSummary(now);
  return (await bot.telegram.sendText(bot.ownerChatId, message.text, message.keyboard)) === null ? "refused" : "sent";
}
