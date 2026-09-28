import { vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/** What one read of the `site_settings` singleton returns in a test. */
export type SettingsRead =
  | {
      readonly row: { readonly maintenance_mode: boolean; readonly accept_orders: boolean } | null;
      readonly error?: { readonly message: string } | null;
    }
  | { readonly reject: Error };

/**
 * A Supabase client that only knows the `site_settings` singleton, plus whatever extra
 * members a test hands it (an `rpc` spy, for instance). Any other table fails loudly, so a
 * test notices when code reads more than it should before a guard has spoken.
 */
export function fakeSettingsClient(read: SettingsRead, extra: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const builder = {
    select(columns: string) {
      calls.push(`select:${columns}`);
      return builder;
    },
    eq(column: string, value: unknown) {
      calls.push(`eq:${column}=${String(value)}`);
      return builder;
    },
    abortSignal(signal: AbortSignal) {
      calls.push(`abortSignal:${signal instanceof AbortSignal}`);
      return builder;
    },
    async maybeSingle() {
      if ("reject" in read) throw read.reject;
      return { data: read.row, error: read.error ?? null };
    },
  };
  const from = vi.fn((table: string) => {
    if (table === "site_settings") return builder;
    throw new Error(`unexpected table read before the guard: ${table}`);
  });
  return { client: { from, ...extra } as unknown as SupabaseClient<Database>, from, calls };
}
