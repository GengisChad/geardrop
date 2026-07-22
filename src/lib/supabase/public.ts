import "server-only";

import { createClient } from "@supabase/supabase-js";
import { readPublicSupabaseEnv } from "./env";
import type { Database } from "./database.types";

export function createSupabasePublicClient() {
  const { url, publishableKey } = readPublicSupabaseEnv();
  return createClient<Database>(url, publishableKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}
