export const STAFF_ROLES = ["owner", "admin", "editor"] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export type StaffPrincipal = {
  readonly userId: string;
  readonly role: StaffRole;
  readonly active: boolean;
};

export class StaffAuthorizationError extends Error {}

export function assertAllowedStaffRole(
  profile: StaffPrincipal,
  allowedRoles: readonly StaffRole[],
): StaffPrincipal {
  if (!profile.active) {
    throw new StaffAuthorizationError("Inactive staff profile");
  }

  if (!allowedRoles.includes(profile.role)) {
    throw new StaffAuthorizationError("Staff role not allowed");
  }

  return profile;
}
