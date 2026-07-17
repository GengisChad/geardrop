"use client";

import { createBrowserClient } from "@supabase/ssr";
import { readPublicSupabaseEnv } from "./env";

export function createSupabaseBrowserClient() {
  const { url, publishableKey } = readPublicSupabaseEnv();

  return createBrowserClient(url, publishableKey);
}
