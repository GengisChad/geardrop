import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@geardrop/data-contract";
import { cookies } from "next/headers";
import { readManagementSupabaseEnv } from "./env";

export async function createManagementServerClient(): Promise<SupabaseClient<Database>> {
  const { url, publishableKey } = readManagementSupabaseEnv();
  const store = await cookies();
  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(values) {
        try {
          for (const { name, value, options } of values) store.set(name, value, options);
        } catch (error) {
          // A Server Component cannot write; the proxy persists its refresh cookies.
          if (!(error instanceof Error && error.message.startsWith("Cookies can only be modified in a Server Action or Route Handler"))) throw error;
        }
      },
    },
  });
}
