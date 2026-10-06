import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { chooseOrganization, ORGANIZATION_COOKIE, type OrganizationMembership } from "@/lib/org/organization";
import type { Database } from "../supabase/database.types";
import {
  assertAllowedStaffRole,
  StaffAuthorizationError,
  type StaffPrincipal,
  type StaffRole,
} from "./roles";

export { assertAllowedStaffRole } from "./roles";

// Adapter: il pannello legacy usa i tipi locali in ./roles (strutturalmente identici
// al contratto neutrale in @geardrop/data-contract). AssuranceLevel è re-esportato
// qui per qualsiasi consumer legacy che importi tipi MFA da questo modulo.
export type { AssuranceLevel } from "@geardrop/data-contract";

export class AuthenticationRequiredError extends Error {}

export async function requireUser(client: SupabaseClient<Database>): Promise<User> {
  const { data, error } = await client.auth.getUser();

  if (error || !data.user) {
    throw new AuthenticationRequiredError("Authenticated user required");
  }

  return data.user;
}

/**
 * The companies the person works for, read under their own row level security: an active
 * membership in an active company. The database repeats these checks on every query and RPC;
 * this list only decides what the admin offers.
 */
export async function loadOrganizationMemberships(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<readonly OrganizationMembership[]> {
  const { data, error } = await client
    .from("organization_members")
    .select("role, organization:organizations!inner(id, slug, name, storefront_public, active)")
    .eq("user_id", userId)
    .eq("active", true)
    .eq("organization.active", true);

  if (error) {
    throw new AuthenticationRequiredError("Company memberships unavailable");
  }

  return (data ?? []).map((row) => ({
    id: row.organization.id,
    slug: row.organization.slug,
    name: row.organization.name,
    storefrontPublic: row.organization.storefront_public,
    role: row.role as StaffRole,
  }));
}

async function requestedOrganizationSlug(): Promise<string | null> {
  try {
    return (await cookies()).get(ORGANIZATION_COOKIE)?.value ?? null;
  } catch {
    // Outside a request (a script, a test): no preference, the first company is used.
    return null;
  }
}

/**
 * The signed-in staff member, in the company chosen for this request, with one of the roles.
 * The role checked is the one held in that company; an inactive account, or one without an
 * active membership, is refused.
 */
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
    .select("user_id, active")
    .eq("user_id", subject)
    .maybeSingle();

  if (profileError || !profile) {
    throw new AuthenticationRequiredError("Active staff profile required");
  }

  const organizations = await loadOrganizationMemberships(client, subject);
  const organization = chooseOrganization(organizations, await requestedOrganizationSlug());
  if (!organization) {
    throw new StaffAuthorizationError("No active company membership");
  }

  return assertAllowedStaffRole(
    {
      userId: profile.user_id as string,
      role: organization.role,
      active: profile.active as boolean,
      organization,
      organizations,
    },
    allowedRoles,
  );
}
