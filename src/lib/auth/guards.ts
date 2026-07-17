import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";
import {
  assertAllowedStaffRole,
  type StaffPrincipal,
  type StaffRole,
} from "./roles";

export { assertAllowedStaffRole } from "./roles";

export class AuthenticationRequiredError extends Error {}

export async function requireUser(client: SupabaseClient<Database>): Promise<User> {
  const { data, error } = await client.auth.getUser();

  if (error || !data.user) {
    throw new AuthenticationRequiredError("Authenticated user required");
  }

  return data.user;
}

export async function requireStaffRole(
  client: SupabaseClient<Database>,
  allowedRoles: readonly StaffRole[],
): Promise<StaffPrincipal> {
  const { data: claimsData, error: claimsError } = await client.auth.getClaims();
  const subject = claimsData?.claims.sub;

  if (claimsError || !subject) {
    throw new AuthenticationRequiredError("Verified auth claims required");
  }

  const { data: profile, error: profileError } = await client
    .from("staff_profiles")
    .select("user_id, role, active")
    .eq("user_id", subject)
    .maybeSingle();

  if (profileError || !profile) {
    throw new AuthenticationRequiredError("Active staff profile required");
  }

  return assertAllowedStaffRole(
    {
      userId: profile.user_id as string,
      role: profile.role as StaffRole,
      active: profile.active as boolean,
    },
    allowedRoles,
  );
}
