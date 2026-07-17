import "server-only";

import { createClient } from "@supabase/supabase-js";
import { readSecretSupabaseEnv } from "./env.server";

export function createPrivilegedSupabaseClient() {
  const { url, secretKey } = readSecretSupabaseEnv();

  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
