/**
 * Environment access for the Supabase layer.
 *
 * Reads are deliberately lazy and per-call: `process.env` is captured at module scope
 * nowhere, so a missing variable is a clear runtime error at the point of use instead of
 * an import-time crash that would also break the mock provider and the unit tests.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} non è configurata. Copia .env.example in .env.local e valorizza le chiavi Supabase.`,
    );
  }
  return value;
}

export function supabaseUrl(): string {
  return required("NEXT_PUBLIC_SUPABASE_URL");
}

export function supabasePublishableKey(): string {
  return required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
}

export function supabaseSecretKey(): string {
  return required("SUPABASE_SECRET_KEY");
}

/** True when the server should talk to Supabase rather than the local mock catalog. */
export function isSupabaseBackend(): boolean {
  return process.env.COMMERCE_PROVIDER === "supabase";
}

/**
 * True when the project keys exist at all. Auth, account and admin need them regardless
 * of COMMERCE_PROVIDER; checking first lets those routes say "non configurato" instead of
 * throwing on a fresh clone with no .env.local.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
