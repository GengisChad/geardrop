import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { readSecretSupabaseEnv } from "./env.server";

export function createPrivilegedSupabaseClient() {
  const { url, secretKey } = readSecretSupabaseEnv();

  return createClient<Database>(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
