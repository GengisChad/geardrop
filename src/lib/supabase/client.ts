"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { readPublicSupabaseEnv } from "./env";

export function createSupabaseBrowserClient() {
  const { url, publishableKey } = readPublicSupabaseEnv();

  return createBrowserClient<Database>(url, publishableKey);
}
