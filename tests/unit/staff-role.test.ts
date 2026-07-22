import { describe, expect, it } from "vitest";
import { assertAllowedStaffRole } from "@/lib/auth/roles";

describe("staff role authorization", () => {
  it("accepts an active allowed staff profile", () => {
    expect(
      assertAllowedStaffRole({ userId: "user-1", role: "admin", active: true }, ["owner", "admin"]),
    ).toEqual({ userId: "user-1", role: "admin", active: true });
  });

  it("rejects editors from owner/admin data", () => {
    expect(() =>
      assertAllowedStaffRole({ userId: "user-1", role: "editor", active: true }, ["owner", "admin"]),
    ).toThrow("Staff role not allowed");
  });

  it("rejects inactive staff", () => {
    expect(() =>
      assertAllowedStaffRole({ userId: "user-1", role: "owner", active: false }, ["owner"]),
    ).toThrow("Inactive staff profile");
  });
});
