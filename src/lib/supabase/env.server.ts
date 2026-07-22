import "server-only";

type EnvSource = Record<string, string | undefined>;

function requireServerEnv(source: EnvSource, name: string): string {
  const value = source[name]?.trim();

  if (!value) {
    throw new Error(`Missing required server environment variable: ${name}`);
  }

  return value;
}

export function readSecretSupabaseEnv(source: EnvSource = process.env) {
  return {
    url: requireServerEnv(source, "NEXT_PUBLIC_SUPABASE_URL"),
    secretKey: requireServerEnv(source, "SUPABASE_SECRET_KEY"),
  };
}
