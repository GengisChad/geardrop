"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@geardrop/data-contract";
import { readManagementSupabaseEnv } from "./env";

export function createManagementBrowserClient(): SupabaseClient<Database> {
  const { url, publishableKey } = readManagementSupabaseEnv();
  return createBrowserClient<Database>(url, publishableKey);
}
