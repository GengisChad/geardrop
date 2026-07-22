type EnvSource = Record<string, string | undefined>;

function requireEnv(source: EnvSource, name: string): string {
  const value = source[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

/**
 * Whether a Supabase project is configured at all.
 *
 * The mock storefront runs with no Supabase environment, so anything that merely *might*
 * need a session — the request proxy, most of all — has to ask before constructing a
 * client rather than throwing on a page the mock build serves perfectly well.
 */
export function hasPublicSupabaseEnv(source?: EnvSource): boolean {
  const resolved = source ?? {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };

  return Boolean(resolved.NEXT_PUBLIC_SUPABASE_URL?.trim() && resolved.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim());
}

export function readPublicSupabaseEnv(source?: EnvSource) {
  const resolved = source ?? {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
  return {
    url: requireEnv(resolved, "NEXT_PUBLIC_SUPABASE_URL"),
    publishableKey: requireEnv(resolved, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  };
}
