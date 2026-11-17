import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type NewsletterRow = {
  readonly email: string;
  readonly token: string;
  readonly created_at: string;
  readonly confirmed_at: string | null;
  readonly unsubscribed_at: string | null;
};

export type NewsletterList = {
  /** Confirmed and still subscribed: the only addresses that may be written to. */
  readonly confirmed: readonly NewsletterRow[];
  readonly pending: number;
  readonly unsubscribed: number;
};

/** The whole list for owners and admins (row level security lets nobody else read it). */
export async function listNewsletterSubscribers(client: SupabaseClient<Database>): Promise<NewsletterList> {
  const { data, error } = await client
    .from("newsletter_subscribers")
    .select("email, token, created_at, confirmed_at, unsubscribed_at")
    .order("confirmed_at", { ascending: false, nullsFirst: false })
    .limit(10_000);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as NewsletterRow[];
  return {
    confirmed: rows.filter((row) => row.confirmed_at !== null && row.unsubscribed_at === null),
    pending: rows.filter((row) => row.confirmed_at === null && row.unsubscribed_at === null).length,
    unsubscribed: rows.filter((row) => row.unsubscribed_at !== null).length,
  };
}
