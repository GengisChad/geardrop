import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { Follower, FollowStore } from "./order-follow";

/**
 * The chats that follow an order on Telegram (telegram_order_follows, migration 20261127150000).
 * Only the server's key reaches the table; the order itself is read within the shop's company.
 */

type Client = SupabaseClient<Database>;

function check(error: { readonly message: string } | null, what: string): void {
  if (error) throw new Error(`telegram order follows, ${what}: ${error.message}`);
}

export function createSupabaseOrderFollowStore(client: Client, organizationId: () => Promise<number>): FollowStore {
  const follows = () => client.from("telegram_order_follows");
  const stamp = () => new Date().toISOString();

  return {
    async loadOrder(orderId) {
      const result = await client
        .from("orders")
        .select("id,order_number,status,tracking_carrier,tracking_code,tracking_url")
        .eq("organization_id", await organizationId())
        .eq("id", orderId)
        .maybeSingle();
      check(result.error, "load order");
      const row = result.data;
      return row
        ? { id: row.id, orderNumber: row.order_number, status: row.status, carrier: row.tracking_carrier, trackingCode: row.tracking_code, trackingUrl: row.tracking_url }
        : null;
    },
    async follow(orderId, chatId, told) {
      const result = await follows()
        .upsert({ order_id: orderId, chat_id: Number(chatId), last_told: told, updated_at: stamp() }, { onConflict: "order_id,chat_id" })
        .select("id")
        .single();
      check(result.error, "follow");
      return result.data!.id;
    },
    async unfollow(id, chatId) {
      const result = await follows().delete().eq("id", id).eq("chat_id", Number(chatId)).select("id");
      check(result.error, "unfollow");
      return (result.data?.length ?? 0) > 0;
    },
    async followers(orderId) {
      const result = await follows().select("id,chat_id,last_told").eq("order_id", orderId).limit(20);
      check(result.error, "followers");
      return (result.data ?? []).map((row): Follower => ({ id: row.id, chatId: String(row.chat_id), lastTold: row.last_told }));
    },
    async told(id, what) {
      const result = await follows().update({ last_told: what, updated_at: stamp() }).eq("id", id);
      check(result.error, "told");
    },
    async forgetOrder(orderId) {
      const result = await follows().delete().eq("order_id", orderId);
      check(result.error, "forget order");
    },
    async purge(before) {
      const result = await follows().delete().lt("created_at", before.toISOString()).select("id");
      check(result.error, "purge");
      return result.data?.length ?? 0;
    },
  };
}
