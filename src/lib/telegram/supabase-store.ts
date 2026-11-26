import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { NewsDraft, NewsStore } from "./bot";
import { isNewsPayload, NEWS_KINDS } from "./news";

/**
 * The bot's memory and its drafts, in the two tables of migration 20261126120000. Only the server's
 * own key reaches them: no policy lets a visitor or a signed-in buyer read what is about to be
 * announced.
 */

type Client = SupabaseClient<Database>;
type DraftRow = Database["public"]["Tables"]["telegram_news_drafts"]["Row"];

/** A draft being sent to the owner right now: no message yet, but no longer up for grabs. */
const SENDING = 0;
/** A publication that never finished is taken to have failed after this long, and may be tried again. */
const STUCK_AFTER_MS = 120_000;

function draftOf(row: DraftRow): NewsDraft | null {
  if (!isNewsPayload(row.payload)) return null;
  return {
    id: row.id,
    payload: row.payload,
    status: row.status as NewsDraft["status"],
    ownerMessageId: row.owner_message_id !== null && row.owner_message_id !== SENDING ? row.owner_message_id : null,
  };
}

function check(error: { readonly message: string } | null, what: string): void {
  if (error) throw new Error(`telegram news store, ${what}: ${error.message}`);
}

export function createSupabaseNewsStore(client: Client): NewsStore {
  const stamp = () => new Date().toISOString();
  const drafts = () => client.from("telegram_news_drafts");

  return {
    async readMemory() {
      const result = await client.from("telegram_news_memory").select("subject,state").limit(2000);
      check(result.error, "read memory");
      return new Map((result.data ?? []).map((row) => [row.subject, row.state as unknown]));
    },
    async writeMemory(entries) {
      const rows = [...entries].map(([subject, state]) => ({ subject, state: state as Json, updated_at: stamp() }));
      const result = await client.from("telegram_news_memory").upsert(rows, { onConflict: "subject" });
      check(result.error, "write memory");
    },
    async addDrafts(events) {
      const rows = events
        .filter((event) => (NEWS_KINDS as readonly string[]).includes(event.payload.kind))
        .map((event) => ({ event_key: event.eventKey, kind: event.payload.kind, payload: event.payload as unknown as Json }));
      const result = await drafts().upsert(rows, { onConflict: "event_key", ignoreDuplicates: true }).select("id");
      check(result.error, "add drafts");
      return result.data?.length ?? 0;
    },
    async unsentDrafts(limit) {
      const result = await drafts().select("*").eq("status", "draft").is("owner_message_id", null).order("id").limit(limit);
      check(result.error, "unsent drafts");
      return (result.data ?? []).flatMap((row) => draftOf(row) ?? []);
    },
    async claimSending(id) {
      const result = await drafts()
        .update({ owner_message_id: SENDING, updated_at: stamp() })
        .eq("id", id)
        .eq("status", "draft")
        .is("owner_message_id", null)
        .select("id");
      check(result.error, "claim sending");
      return (result.data?.length ?? 0) > 0;
    },
    async markSent(id, ownerMessageId) {
      const result = await drafts().update({ owner_message_id: ownerMessageId, updated_at: stamp() }).eq("id", id);
      check(result.error, "mark sent");
    },
    async forgetSent() {
      const result = await drafts().update({ owner_message_id: null, updated_at: stamp() }).eq("status", "draft").gt("owner_message_id", SENDING).select("id");
      check(result.error, "forget sent");
      return result.data?.length ?? 0;
    },
    async claimDecision(id) {
      const stuckBefore = new Date(Date.now() - STUCK_AFTER_MS).toISOString();
      const result = await drafts()
        .update({ status: "publishing", updated_at: stamp() })
        .eq("id", id)
        .or(`status.eq.draft,and(status.eq.publishing,updated_at.lt."${stuckBefore}")`)
        .select("*");
      check(result.error, "claim decision");
      const row = result.data?.[0];
      return row ? draftOf(row) : null;
    },
    async finish(id, status, channelMessageId) {
      const result = await drafts()
        .update({ status, updated_at: stamp(), ...(channelMessageId === undefined ? {} : { channel_message_id: channelMessageId }) })
        .eq("id", id);
      check(result.error, "finish");
    },
  };
}
