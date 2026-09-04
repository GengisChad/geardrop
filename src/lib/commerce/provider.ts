/**
 * Provider selection.
 *
 * The whole app reads the catalogue through `getCommerceProvider()`. It resolves to the
 * local mock catalogue by default and to Supabase when `COMMERCE_PROVIDER=supabase` —
 * a server-only variable, so the choice is never shipped to the browser.
 *
 * It is a per-request factory, not a module singleton: the Supabase provider closes over
 * a request-scoped client carrying that visitor's cookies, and caching one would leak a
 * session across requests. The Supabase modules are imported dynamically so the mock path
 * (and every unit test) never touches `server-only` or needs an env var.
 */

import { createMockProvider } from "./mock-provider";
import type { CommerceProvider } from "./types";

export type ProviderName = "mock" | "supabase";

export function commerceProviderName(): ProviderName {
  return process.env["COMMERCE_PROVIDER"] === "supabase" ? "supabase" : "mock";
}

export async function getCommerceProvider(): Promise<CommerceProvider> {
  if (commerceProviderName() === "mock") return createMockProvider();

  const [{ createClient }, { createSupabaseProvider }] = await Promise.all([
    import("@/lib/supabase/server"),
    import("./supabase-provider"),
  ]);

  return createSupabaseProvider(await createClient());
}

export type { CommerceProvider };
