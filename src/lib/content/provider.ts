import "server-only";

import { createMockContentProvider } from "./mock-provider";
import { createSupabaseContentProvider } from "./supabase-provider";
import type { StorefrontContentProvider } from "./types";

export type ContentProviderName = "mock" | "supabase";

function selectContentProvider(): StorefrontContentProvider {
  const requested = (process.env["CONTENT_PROVIDER"] ?? "mock") as ContentProviderName;
  switch (requested) {
    case "supabase": return createSupabaseContentProvider();
    case "mock": return createMockContentProvider();
    default: throw new Error(`Unsupported content provider: ${requested}`);
  }
}

export const storefrontContent = selectContentProvider();
