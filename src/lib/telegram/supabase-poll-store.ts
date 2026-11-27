import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { Poll, PollStore } from "./polls";

/** The channel's polls (telegram_polls, migration 20261127160000). Server key only. */

type Client = SupabaseClient<Database>;
type Row = Database["public"]["Tables"]["telegram_polls"]["Row"];

function check(error: { readonly message: string } | null, what: string): void {
  if (error) throw new Error(`telegram polls, ${what}: ${error.message}`);
}

const numbers = (value: Json): number[] => (Array.isArray(value) ? value.map((item) => (typeof item === "number" ? item : 0)) : []);
const strings = (value: Json): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

function toPoll(row: Row): Poll {
  return {
    id: row.id,
    productSlug: row.product_slug,
    subject: row.subject,
    question: row.question,
    options: strings(row.options),
    counts: numbers(row.counts),
    totalVoters: row.total_voters,
    status: row.status as Poll["status"],
    channelMessageId: row.channel_message_id,
  };
}

export function createSupabasePollStore(client: Client): PollStore {
  const polls = () => client.from("telegram_polls");
  const stamp = () => new Date().toISOString();

  return {
    async create(poll) {
      const result = await polls()
        .insert({ product_slug: poll.productSlug, subject: poll.subject, question: poll.question, options: [...poll.options] })
        .select("id")
        .single();
      check(result.error, "create");
      return result.data!.id;
    },
    async get(id) {
      const result = await polls().select("*").eq("id", id).maybeSingle();
      check(result.error, "get");
      return result.data ? toPoll(result.data) : null;
    },
    async claimPublish(id) {
      const result = await polls().update({ status: "open", opened_at: stamp(), updated_at: stamp() }).eq("id", id).eq("status", "draft").select("id");
      check(result.error, "claim");
      return (result.data?.length ?? 0) > 0;
    },
    async releasePublish(id) {
      const result = await polls().update({ status: "draft", opened_at: null, updated_at: stamp() }).eq("id", id).is("poll_id", null);
      check(result.error, "release");
    },
    async published(id, pollId, channelMessageId) {
      const result = await polls().update({ poll_id: pollId, channel_message_id: channelMessageId, updated_at: stamp() }).eq("id", id);
      check(result.error, "published");
    },
    async discard(id) {
      const result = await polls().update({ status: "discarded", updated_at: stamp() }).eq("id", id).eq("status", "draft").select("id");
      check(result.error, "discard");
      return (result.data?.length ?? 0) > 0;
    },
    async votes(pollId, counts, totalVoters, closed) {
      const result = await polls()
        .update({ counts: [...counts], total_voters: totalVoters, updated_at: stamp(), ...(closed ? { status: "closed", closed_at: stamp() } : {}) })
        .eq("poll_id", pollId)
        .in("status", ["open", "closed"])
        .select("id");
      check(result.error, "votes");
      return (result.data?.length ?? 0) > 0;
    },
    async closed(id, counts, totalVoters) {
      const result = await polls().update({ counts: [...counts], total_voters: totalVoters, status: "closed", closed_at: stamp(), updated_at: stamp() }).eq("id", id);
      check(result.error, "close");
    },
    async recent() {
      const result = await polls().select("*").order("created_at", { ascending: false }).limit(20);
      check(result.error, "recent");
      return (result.data ?? []).map(toPoll);
    },
  };
}
