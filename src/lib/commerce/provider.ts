/**
 * Provider selection.
 *
 * The whole app reads the catalogue through `commerce`. Today that resolves to the
 * local mock provider; pointing it at Shopify/Supabase later means adding an adapter
 * that satisfies CommerceProvider and switching on the env var here — no page or
 * component imports a concrete provider.
 */

import { createMockProvider } from "./mock-provider";
import type { CommerceProvider } from "./types";

export type ProviderName = "mock";

function resolveProvider(): CommerceProvider {
  const requested = (process.env["NEXT_PUBLIC_COMMERCE_PROVIDER"] ?? "mock") as ProviderName;

  switch (requested) {
    case "mock":
      return createMockProvider();
    default: {
      // Exhaustiveness guard: adding a ProviderName without an adapter fails typecheck.
      const _never: never = requested;
      throw new Error(`Provider commerce non supportato: ${String(_never)}`);
    }
  }
}

export const commerce: CommerceProvider = resolveProvider();

export type { CommerceProvider };
