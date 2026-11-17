import type * as DataContract from "@geardrop/data-contract";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The read-access switch on the security page. After a change the page must render again from
// the database: the badge shows the new state and the form carries the new updated_at, otherwise
// the next click sends the old timestamp and the database answers with a conflict nobody caused.
const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("../../apps/management/src/lib/supabase/server", () => ({
  createManagementServerClient: async () => ({
    auth: { mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: "aal2" }, error: null }) } },
    schema: () => ({ rpc: mocks.rpc }),
  }),
}));
vi.mock("@geardrop/data-contract", async (importOriginal) => ({
  ...(await importOriginal<typeof DataContract>()),
  requireManagementPrincipal: async () => ({ role: "owner", organization: { id: 1, slug: "geardrop", name: "Gear Drop" } }),
}));

import { setReadAccess } from "../../apps/management/src/app/actions/features";

describe("setReadAccess", () => {
  beforeEach(() => {
    mocks.revalidatePath.mockReset();
    mocks.rpc.mockReset();
  });

  it("renders the pages again once the database has the new value", async () => {
    mocks.rpc.mockResolvedValue({ data: { feature: "read_access", organization_id: 1, enabled: true }, error: null });

    await expect(setReadAccess(1, true, "2026-10-06T21:27:13Z", "Verifica locale")).resolves.toEqual({ success: true });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("leaves the pages alone when the database refused the change", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "GD_MANAGEMENT_FEATURE_CONFLICT", code: "P0001" } });

    await expect(setReadAccess(1, true, "2026-10-06T21:27:13Z", "Verifica locale")).resolves.toEqual({ success: false, code: "CONFLICT" });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
