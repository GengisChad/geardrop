import { assertManagementSupabaseTarget } from "@geardrop/runtime-contract";

type Env = Readonly<Record<string, string | undefined>>;

/** Only statically referenced public values reach the browser bundle. */
export function readManagementSupabaseEnv(source: Env = {
  NEXT_PUBLIC_APP_SURFACE: process.env.NEXT_PUBLIC_APP_SURFACE,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF: process.env.NEXT_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF,
  NODE_ENV: process.env.NODE_ENV,
}) {
  if (source.NEXT_PUBLIC_APP_SURFACE !== "management") throw new Error("GD_MANAGEMENT_SURFACE_REQUIRED");
  const url = source.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const publishableKey = source.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || "";
  assertManagementSupabaseTarget({
    surface: "management", expectedSupabaseProjectRef: source.NEXT_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF?.trim() || null,
  }, url, source.NODE_ENV);
  // Management uses publishable keys, never secret/service-role or legacy JWT keys.
  if ((!publishableKey.startsWith("sb_publishable_") || publishableKey.length <= "sb_publishable_".length) &&
      publishableKey !== "ci-publishable-key") throw new Error("GD_MANAGEMENT_PUBLIC_KEY_INVALID");
  return { url, publishableKey };
}
