import { beforeEach, describe, expect, it, vi } from "vitest";
import { chooseOrganization, type OrganizationMembership } from "@/lib/org/organization";

vi.mock("server-only", () => ({}));

const request = vi.hoisted(() => ({ cookie: null as string | null }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (request.cookie === null ? undefined : { value: request.cookie }) }),
}));

const lookup = vi.hoisted(() => ({
  result: { data: { id: 1 }, error: null } as { data: { id: number } | null; error: unknown },
  calls: [] as string[],
}));
vi.mock("@/lib/supabase/public", () => ({
  createSupabasePublicClient: () => {
    const chain = {
      select: (columns: string) => (lookup.calls.push(`select:${columns}`), chain),
      eq: (column: string, value: unknown) => (lookup.calls.push(`eq:${column}=${String(value)}`), chain),
      maybeSingle: async () => lookup.result,
    };
    return { from: (table: string) => (lookup.calls.push(`from:${table}`), chain) };
  },
}));

import { requireStaffRole } from "@/lib/auth/guards";
import { StaffAuthorizationError } from "@/lib/auth/roles";
import {
  resetStorefrontOrganizationCache,
  storefrontOrganizationId,
  storefrontOrganizationSlug,
} from "@/lib/org/storefront";

const geardrop: OrganizationMembership = { id: 1, slug: "geardrop", name: "Gear Drop", storefrontPublic: true, role: "owner" };
const oryvenne: OrganizationMembership = { id: 2, slug: "oryvenne", name: "Oryvenne", storefrontPublic: false, role: "editor" };

describe("chooseOrganization", () => {
  it("works in the company the cookie names when the person belongs to it", () => {
    expect(chooseOrganization([geardrop, oryvenne], "oryvenne")).toBe(oryvenne);
  });

  it("falls back to the first company, by id, without a usable cookie", () => {
    expect(chooseOrganization([oryvenne, geardrop], null)).toBe(geardrop);
    // The cookie is a preference, never a permission.
    expect(chooseOrganization([oryvenne, geardrop], "altra-azienda")).toBe(geardrop);
  });

  it("has nothing to offer someone who belongs to no company", () => {
    expect(chooseOrganization([], "geardrop")).toBeNull();
  });
});

const USER = "00000000-0000-4000-8000-000000000001";

function membershipRow(membership: OrganizationMembership) {
  return {
    role: membership.role,
    organization: { id: membership.id, slug: membership.slug, name: membership.name, storefront_public: membership.storefrontPublic, active: true },
  };
}

function staffClient(options: { readonly active?: boolean; readonly memberships?: readonly OrganizationMembership[] } = {}) {
  const profile = { data: { user_id: USER, active: options.active ?? true }, error: null };
  const members = { data: (options.memberships ?? [geardrop, oryvenne]).map(membershipRow), error: null };
  return {
    auth: { getClaims: async () => ({ data: { claims: { sub: USER } }, error: null }) },
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => profile,
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(table === "organization_members" ? members : profile).then(resolve),
      };
      return chain;
    },
  } as never;
}

describe("requireStaffRole", () => {
  beforeEach(() => {
    request.cookie = null;
  });

  it("returns the chosen company with the role held there, and every company offered", async () => {
    request.cookie = "oryvenne";
    const principal = await requireStaffRole(staffClient(), ["owner", "admin", "editor"]);
    expect(principal.organization).toEqual(oryvenne);
    expect(principal.role).toBe("editor");
    expect(principal.organizations.map((organization) => organization.slug)).toEqual(["geardrop", "oryvenne"]);
  });

  it("checks the role held in the chosen company, not the best one elsewhere", async () => {
    request.cookie = "oryvenne";
    await expect(requireStaffRole(staffClient(), ["owner"])).rejects.toBeInstanceOf(StaffAuthorizationError);
    request.cookie = "geardrop";
    await expect(requireStaffRole(staffClient(), ["owner"])).resolves.toMatchObject({ role: "owner" });
  });

  it("refuses a staff account without an active company membership", async () => {
    await expect(requireStaffRole(staffClient({ memberships: [] }), ["owner"])).rejects.toBeInstanceOf(StaffAuthorizationError);
  });

  it("refuses a closed staff account whatever its memberships say", async () => {
    await expect(requireStaffRole(staffClient({ active: false }), ["owner"])).rejects.toBeInstanceOf(StaffAuthorizationError);
  });
});

describe("storefront organization", () => {
  beforeEach(() => {
    resetStorefrontOrganizationCache();
    lookup.calls.length = 0;
    lookup.result = { data: { id: 1 }, error: null };
  });

  it("serves Gear Drop unless the environment names another company", () => {
    expect(storefrontOrganizationSlug({})).toBe("geardrop");
    expect(storefrontOrganizationSlug({ NEXT_PUBLIC_STOREFRONT_ORGANIZATION: " oryvenne " })).toBe("oryvenne");
    expect(storefrontOrganizationSlug({ NEXT_PUBLIC_STOREFRONT_ORGANIZATION: "" })).toBe("geardrop");
  });

  it("resolves only a company with a public shop, once per process", async () => {
    expect(await storefrontOrganizationId({})).toBe(1);
    expect(await storefrontOrganizationId({})).toBe(1);
    expect(lookup.calls).toEqual(["from:organizations", "select:id", "eq:slug=geardrop", "eq:storefront_public=true"]);
  });

  it("fails closed without a public shop and tries again on the next request", async () => {
    lookup.result = { data: null, error: null };
    await expect(storefrontOrganizationId({ NEXT_PUBLIC_STOREFRONT_ORGANIZATION: "oryvenne" })).rejects.toThrow(
      "GD_STOREFRONT_ORGANIZATION_UNAVAILABLE:oryvenne",
    );
    lookup.result = { data: { id: 2 }, error: null };
    expect(await storefrontOrganizationId({ NEXT_PUBLIC_STOREFRONT_ORGANIZATION: "oryvenne" })).toBe(2);
  });
});
