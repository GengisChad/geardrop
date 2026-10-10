import type { OrganizationMembership } from "@/lib/org/organization";

export const STAFF_ROLES = ["owner", "admin", "editor"] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

/**
 * A signed-in staff member working in one company. `role` is their role in that company, not a
 * global title: the same person may own one company and edit the other.
 */
export type StaffPrincipal = {
  readonly userId: string;
  readonly role: StaffRole;
  readonly active: boolean;
  /** The company this request works in. */
  readonly organization: OrganizationMembership;
  /** Every company the person may switch to. */
  readonly organizations: readonly OrganizationMembership[];
};

export class StaffAuthorizationError extends Error {}

export function assertAllowedStaffRole<T extends Pick<StaffPrincipal, "active" | "role">>(
  profile: T,
  allowedRoles: readonly StaffRole[],
): T {
  if (!profile.active) {
    throw new StaffAuthorizationError("Inactive staff profile");
  }

  if (!allowedRoles.includes(profile.role)) {
    throw new StaffAuthorizationError("Staff role not allowed");
  }

  return profile;
}
