import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { DeliveryCheckContext } from "./delivery-check";
import type { SupportStore } from "./support";

/**
 * Assistance links (telegram_support_messages, migration 20261128100000) and the order notes that
 * «Com'è andata?» leaves. Only the server's key reaches the table; orders are read and annotated
 * within the shop's company.
 */

type Client = SupabaseClient<Database>;

function check(error: { readonly message: string } | null, what: string): void {
  if (error) throw new Error(`telegram support, ${what}: ${error.message}`);
}

export function createSupabaseSupportStore(client: Client): SupportStore {
  const links = () => client.from("telegram_support_messages");
  return {
    async record(chatId, ownerMessageId, orderId) {
      const result = await links().upsert({ chat_id: Number(chatId), owner_message_id: ownerMessageId, order_id: orderId }, { onConflict: "owner_message_id" });
      check(result.error, "record");
    },
    async chatFor(ownerMessageId) {
      const result = await links().select("chat_id,order_id").eq("owner_message_id", ownerMessageId).maybeSingle();
      check(result.error, "chat for");
      return result.data ? { chatId: String(result.data.chat_id), orderId: result.data.order_id } : null;
    },
    async countSince(chatId, since) {
      const result = await links().select("id", { count: "exact", head: true }).eq("chat_id", Number(chatId)).gte("created_at", since.toISOString());
      check(result.error, "count");
      return result.count ?? 0;
    },
    async orderFor(chatId, since) {
      const result = await links()
        .select("order_id")
        .eq("chat_id", Number(chatId))
        .not("order_id", "is", null)
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false })
        .limit(1);
      check(result.error, "order for");
      return result.data?.[0]?.order_id ?? null;
    },
    async purge(before) {
      const result = await links().delete().lt("created_at", before.toISOString()).select("id");
      check(result.error, "purge");
      return result.data?.length ?? 0;
    },
  };
}

export function createSupabaseOrderNotes(client: Client, organizationId: () => Promise<number>): DeliveryCheckContext["orders"] {
  const orderNumber = async (orderId: number) => {
    const result = await client.from("orders").select("order_number").eq("organization_id", await organizationId()).eq("id", orderId).maybeSingle();
    check(result.error, "order number");
    return result.data?.order_number ?? null;
  };
  return {
    orderNumber,
    async note(orderId, text) {
      // Only an order of the shop's own company gets a note.
      if ((await orderNumber(orderId)) === null) return;
      const result = await client.from("order_notes").insert({ order_id: orderId, note: text });
      check(result.error, "note");
    },
  };
}
