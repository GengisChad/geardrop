"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { supabasePublishableKey, supabaseUrl } from "./env";

/**
 * Browser client, for the few Auth operations that genuinely need to run in the page
 * (password update after a recovery redirect). Catalog reads, checkout and account data
 * never go through here — they go through Server Components and Server Actions.
 */
export function createClient() {
  return createBrowserClient<Database>(supabaseUrl(), supabasePublishableKey());
}
