type EnvSource = Record<string, string | undefined>;

function requireEnv(source: EnvSource, name: string): string {
  const value = source[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function readPublicSupabaseEnv(source: EnvSource = process.env) {
  return {
    url: requireEnv(source, "NEXT_PUBLIC_SUPABASE_URL"),
    publishableKey: requireEnv(source, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  };
}
