import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { supabaseSecretKey, supabaseUrl } from "./env";

/**
 * Privileged client built from the secret key. It bypasses RLS, so it is used for exactly
 * one thing: creating a guest order, which by definition has no authenticated database
 * context. Everything else — catalog, account, staff, authenticated checkout — uses the
 * request-scoped client in server.ts and stays RLS-bound.
 *
 * `server-only` makes importing this from a Client Component a build error. Sessions are
 * disabled so this client can never pick up or refresh a user's tokens.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(supabaseUrl(), supabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
