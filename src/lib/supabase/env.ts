type EnvSource = Record<string, string | undefined>;

function requireEnv(source: EnvSource, name: string): string {
  const value = source[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
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
