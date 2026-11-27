import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { RestockRequest, RestockStore } from "./restock";

/**
 * The Telegram requests in the shop's own «Avvisami» list, restock_requests (migration
 * 20261127140000): a row with a telegram_chat_id instead of an email. Only the server's key writes
 * and deletes them, and every query names the shop's company, like every other query on the list.
 */

type Client = SupabaseClient<Database>;

/** As for the email requests: past this many for one product, a new one is not kept. */
const MAX_PER_PRODUCT = 2000;

function check(error: { readonly message: string } | null, what: string): void {
  if (error) throw new Error(`telegram restock store, ${what}: ${error.message}`);
}

export function createSupabaseRestockStore(client: Client, organizationId: () => Promise<number>): RestockStore {
  const find = async (shop: number, chatId: string, slug: string) => {
    const result = await client
      .from("restock_requests")
      .select("id")
      .eq("organization_id", shop)
      .eq("product_slug", slug)
      .eq("telegram_chat_id", Number(chatId))
      .maybeSingle();
    check(result.error, "find");
    return result.data?.id ?? null;
  };

  return {
    async add(chatId, slug) {
      const shop = await organizationId();
      const existing = await find(shop, chatId, slug);
      if (existing !== null) return existing;
      const count = await client.from("restock_requests").select("id", { count: "exact", head: true }).eq("organization_id", shop).eq("product_slug", slug);
      check(count.error, "count");
      if ((count.count ?? 0) >= MAX_PER_PRODUCT) throw new Error("telegram restock store: too many requests for this product");
      const inserted = await client
        .from("restock_requests")
        .insert({ organization_id: shop, product_slug: slug, telegram_chat_id: Number(chatId) })
        .select("id")
        .single();
      if (inserted.error?.code === "23505") {
        // Two taps at once: the other one kept it.
        const again = await find(shop, chatId, slug);
        if (again !== null) return again;
      }
      check(inserted.error, "add");
      return inserted.data!.id;
    },
    async remove(id, chatId) {
      const shop = await organizationId();
      const result = await client
        .from("restock_requests")
        .delete()
        .eq("organization_id", shop)
        .eq("id", id)
        .eq("telegram_chat_id", Number(chatId))
        .select("id");
      check(result.error, "remove");
      return (result.data?.length ?? 0) > 0;
    },
    async pending() {
      const shop = await organizationId();
      const result = await client
        .from("restock_requests")
        .select("id,telegram_chat_id,product_slug")
        .eq("organization_id", shop)
        .not("telegram_chat_id", "is", null)
        .is("notified_at", null)
        .order("created_at")
        .limit(500);
      check(result.error, "pending");
      return (result.data ?? []).map((row): RestockRequest => ({ id: row.id, chatId: String(row.telegram_chat_id), slug: row.product_slug }));
    },
    async done(ids) {
      if (ids.length === 0) return;
      const shop = await organizationId();
      const result = await client.from("restock_requests").delete().eq("organization_id", shop).in("id", [...ids]);
      check(result.error, "done");
    },
    async purge(before) {
      const shop = await organizationId();
      const result = await client
        .from("restock_requests")
        .delete()
        .eq("organization_id", shop)
        .not("telegram_chat_id", "is", null)
        .lt("created_at", before.toISOString())
        .select("id");
      check(result.error, "purge");
      return result.data?.length ?? 0;
    },
  };
}
