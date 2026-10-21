import type { StaffRole } from "@/lib/auth/roles";

/** One company the signed-in person works for, with their role there. */
export type OrganizationMembership = {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly storefrontPublic: boolean;
  readonly role: StaffRole;
};

/** How the admin writes the company's name: Gear Drop keeps its wordmark. */
export function organizationBrand(organization: Pick<OrganizationMembership, "slug" | "name">): string {
  return organization.slug === "geardrop" ? "GEAR//DROP" : organization.name.toUpperCase();
}

/** The admin remembers the chosen company in this cookie; it only ever names a slug. */
export const ORGANIZATION_COOKIE = "gd_organization";

/**
 * The company to work in: the one the cookie names when the person belongs to it, otherwise
 * the first they belong to (lowest id, so Gear Drop for its owners). Null when they belong to
 * none. The cookie is a preference, never a permission: an unknown slug is simply ignored.
 */
export function chooseOrganization(
  memberships: readonly OrganizationMembership[],
  requestedSlug: string | null | undefined,
): OrganizationMembership | null {
  if (memberships.length === 0) return null;
  const ordered = [...memberships].sort((left, right) => left.id - right.id);
  return ordered.find((membership) => membership.slug === requestedSlug) ?? ordered[0] ?? null;
}
