import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { supabasePublishableKey, supabaseUrl } from "./env";

/**
 * Request-scoped Supabase client for Server Components, Server Actions and Route
 * Handlers. It uses the publishable key, so every query stays subject to RLS and runs as
 * the caller (anon or the signed-in user).
 *
 * A new client per call is required, not an optimisation: it closes over the current
 * request's cookies. Caching one in a module global would leak one visitor's session into
 * another's request.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only. The proxy
          // refreshes the session cookies for these requests, so ignoring this is safe.
        }
      },
    },
  });
}
