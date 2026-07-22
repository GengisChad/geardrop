import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";

const mocks = vi.hoisted(() => {
  class AuthenticationRequiredError extends Error {}
  class StaffAuthorizationError extends Error {}

  return {
    AuthenticationRequiredError,
    StaffAuthorizationError,
    redirect: vi.fn<(path: string) => never>(),
    requireStaffRole: vi.fn(),
    requireUser: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth/guards", () => ({
  AuthenticationRequiredError: mocks.AuthenticationRequiredError,
  requireStaffRole: mocks.requireStaffRole,
  requireUser: mocks.requireUser,
}));
vi.mock("@/lib/auth/roles", () => ({
  STAFF_ROLES: ["owner", "admin", "editor"],
  StaffAuthorizationError: mocks.StaffAuthorizationError,
}));

import { requireAdminAccess } from "@/lib/admin/access";

const client = {} as SupabaseClient<Database>;
const principal = { userId: "staff-1", role: "admin", active: true } as const;

describe("admin access boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirect.mockImplementation((path) => {
      throw new Error(`redirect:${path}`);
    });
    mocks.requireUser.mockResolvedValue({ id: "staff-1" });
    mocks.requireStaffRole.mockResolvedValue(principal);
  });

  it("verifies the user and allowed staff role on the provided request client", async () => {
    await expect(requireAdminAccess(client)).resolves.toEqual(principal);

    expect(mocks.requireUser).toHaveBeenCalledWith(client);
    expect(mocks.requireStaffRole).toHaveBeenCalledWith(client, ["owner", "admin", "editor"]);
  });

  it("redirects authentication failures to admin login", async () => {
    mocks.requireUser.mockRejectedValue(new mocks.AuthenticationRequiredError("missing auth"));

    await expect(requireAdminAccess(client)).rejects.toThrow("redirect:/admin/login");
    expect(mocks.redirect).toHaveBeenCalledWith("/admin/login");
  });

  it("redirects staff authorization failures to admin login", async () => {
    mocks.requireStaffRole.mockRejectedValue(new mocks.StaffAuthorizationError("inactive staff"));

    await expect(requireAdminAccess(client)).rejects.toThrow("redirect:/admin/login");
    expect(mocks.redirect).toHaveBeenCalledWith("/admin/login");
  });

  it("rethrows unknown failures without converting them to login redirects", async () => {
    const databaseFailure = new Error("database unavailable");
    mocks.requireStaffRole.mockRejectedValue(databaseFailure);

    await expect(requireAdminAccess(client)).rejects.toBe(databaseFailure);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
