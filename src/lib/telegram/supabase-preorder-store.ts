import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { isPaymentMode } from "./preorder-rules";
import type { LockerChoice, Preorder, PreorderPatch, PreorderStatus, PreorderStep, PreorderStore } from "./preorders";

/**
 * The pre-orders taken in the bot's chat, in telegram_preorders (migration 20261126130000). The
 * table holds buyers' names, emails, phones and Lockers, so only the server's own key reaches it.
 */

type Client = SupabaseClient<Database>;
type Row = Database["public"]["Tables"]["telegram_preorders"]["Row"];
type Update = Database["public"]["Tables"]["telegram_preorders"]["Update"];

/** The memory row that says how one product's pre-order is paid. */
const PAYMENT_SUBJECT = "preorder-pay:";

function lockerOf(value: unknown): LockerChoice | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as { id?: unknown; label?: unknown };
  return typeof candidate.id === "string" && typeof candidate.label === "string" ? { id: candidate.id, label: candidate.label } : null;
}

function preorderOf(row: Row): Preorder {
  return {
    id: row.id,
    code: row.code,
    chatId: String(row.chat_id),
    username: row.username,
    slug: row.product_slug,
    productName: row.product_name,
    quantity: row.quantity,
    unitCents: row.unit_cents,
    shippingCents: row.shipping_cents,
    totalCents: row.total_cents,
    buyerName: row.buyer_name,
    email: row.email,
    phone: row.phone,
    locker: lockerOf(row.locker),
    lockerOptions: Array.isArray(row.locker_options) ? row.locker_options.flatMap((option) => lockerOf(option) ?? []) : [],
    status: row.status as PreorderStatus,
    step: row.step as PreorderStep,
    expiresAt: row.expires_at,
  };
}

function columns(patch: PreorderPatch): Update {
  const update: Update = { updated_at: new Date().toISOString() };
  if (patch.quantity !== undefined) update.quantity = patch.quantity;
  if (patch.unitCents !== undefined) update.unit_cents = patch.unitCents;
  if (patch.shippingCents !== undefined) update.shipping_cents = patch.shippingCents;
  if (patch.totalCents !== undefined) update.total_cents = patch.totalCents;
  if (patch.buyerName !== undefined) update.buyer_name = patch.buyerName;
  if (patch.email !== undefined) update.email = patch.email;
  if (patch.phone !== undefined) update.phone = patch.phone;
  if (patch.locker !== undefined) update.locker = patch.locker as Json;
  if (patch.lockerOptions !== undefined) update.locker_options = patch.lockerOptions as unknown as Json;
  if (patch.step !== undefined) update.step = patch.step;
  if (patch.expiresAt !== undefined) update.expires_at = patch.expiresAt;
  return update;
}

function check(error: { readonly message: string } | null, what: string): void {
  if (error) throw new Error(`telegram preorder store, ${what}: ${error.message}`);
}

export function createSupabasePreorderStore(client: Client): PreorderStore {
  const table = () => client.from("telegram_preorders");

  return {
    async open(input) {
      // One pre-order at a time is being filled in per chat: starting another drops the first.
      const dropped = await table().update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("chat_id", Number(input.chatId)).eq("status", "collecting");
      check(dropped.error, "drop unfinished");
      const result = await table()
        .insert({ code: input.code, chat_id: Number(input.chatId), username: input.username, product_slug: input.slug, product_name: input.productName })
        .select("*")
        .single();
      check(result.error, "open");
      return preorderOf(result.data!);
    },
    async get(id) {
      const result = await table().select("*").eq("id", id).maybeSingle();
      check(result.error, "get");
      return result.data ? preorderOf(result.data) : null;
    },
    async collecting(chatId) {
      const result = await table().select("*").eq("chat_id", Number(chatId)).eq("status", "collecting").order("id", { ascending: false }).limit(1);
      check(result.error, "collecting");
      const row = result.data?.[0];
      return row ? preorderOf(row) : null;
    },
    async update(id, patch) {
      const result = await table().update(columns(patch)).eq("id", id);
      check(result.error, "update");
    },
    async move(id, from, to, patch = {}) {
      const result = await table().update({ ...columns(patch), status: to }).eq("id", id).eq("status", from).select("id");
      check(result.error, "move");
      return (result.data?.length ?? 0) > 0;
    },
    async hold(slug, quantity) {
      const result = await client.rpc("telegram_preorder_hold", { p_slug: slug, p_quantity: quantity });
      check(result.error, "hold");
      return typeof result.data === "number" ? result.data : null;
    },
    async overdue(now) {
      const result = await table().select("*").eq("status", "awaiting_payment").lt("expires_at", now.toISOString()).order("id").limit(50);
      check(result.error, "overdue");
      return (result.data ?? []).map(preorderOf);
    },
    async forget(before) {
      const blank = {
        chat_id: 0,
        username: null,
        buyer_name: null,
        email: null,
        phone: null,
        locker: null,
        locker_options: [] as unknown as Json,
        updated_at: new Date().toISOString(),
      };
      // chat_id 0 marks a row already stripped, so it is never counted twice.
      const abandoned = await table().update({ ...blank, status: "cancelled" }).eq("status", "collecting").lt("updated_at", before.toISOString()).select("id");
      check(abandoned.error, "forget abandoned");
      const closed = await table().update(blank).in("status", ["cancelled", "expired"]).neq("chat_id", 0).lt("updated_at", before.toISOString()).select("id");
      check(closed.error, "forget closed");
      return (abandoned.data?.length ?? 0) + (closed.data?.length ?? 0);
    },
    async list(statuses) {
      const result = await table().select("*").in("status", [...statuses]).order("product_slug").order("id").limit(500);
      check(result.error, "list");
      return (result.data ?? []).map(preorderOf);
    },
    // Kept with the rest of what the bot remembers (telegram_news_memory), one row per product.
    async paymentMode(slug) {
      const result = await client.from("telegram_news_memory").select("state").eq("subject", `${PAYMENT_SUBJECT}${slug}`).maybeSingle();
      check(result.error, "payment mode");
      const mode = (result.data?.state as { readonly mode?: unknown } | null | undefined)?.mode;
      return isPaymentMode(mode) ? mode : null;
    },
    async setPaymentMode(slug, mode) {
      const result = await client
        .from("telegram_news_memory")
        .upsert({ subject: `${PAYMENT_SUBJECT}${slug}`, state: { mode }, updated_at: new Date().toISOString() }, { onConflict: "subject" });
      check(result.error, "set payment mode");
    },
  };
}
