import "server-only";

import { hasPublicSupabaseEnv } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CustomerSession = {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string | null;
  /** True when this visitor also holds an active staff row — used only to offer the admin link. */
  readonly isStaff: boolean;
};

/**
 * The signed-in storefront visitor, or null.
 *
 * Read on the server so the header renders its final state in the first paint: a
 * client-side session lookup would flash the anonymous icon on every navigation.
 *
 * `getClaims()` verifies the JWT signature rather than trusting the cookie, and the
 * staff lookup goes through RLS — `staff_profiles` only ever returns the caller's own
 * row here, so a customer cannot learn that the table has other entries. Staff status is
 * carried purely to decide whether to show the admin link; it grants nothing on its own,
 * because every admin route re-checks the role server-side.
 */
export async function getCustomerSession(): Promise<CustomerSession | null> {
  // A mock deployment has no Supabase project, so nobody can be signed in. Answering
  // "anonymous" keeps the auth pages renderable there instead of throwing on missing env.
  if (!hasPublicSupabaseEnv()) return null;

  const client = await createSupabaseServerClient();
  const { data: claims, error: claimsError } = await client.auth.getClaims();
  const userId = claims?.claims.sub;

  if (claimsError || !userId) return null;

  const { data: user } = await client.auth.getUser();
  if (!user.user?.email) return null;

  const [{ data: profile }, { data: staff }] = await Promise.all([
    client.from("customer_profiles").select("display_name").eq("user_id", userId).maybeSingle(),
    client.from("staff_profiles").select("user_id").eq("user_id", userId).eq("active", true).maybeSingle(),
  ]);

  return {
    userId,
    email: user.user.email,
    displayName: profile?.display_name ?? null,
    isStaff: Boolean(staff),
  };
}
