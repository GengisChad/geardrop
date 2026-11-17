import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { OrganizationMembership } from "@/lib/org/organization";

vi.mock("@/app/admin/actions/organization", () => ({ switchOrganizationAction: vi.fn() }));
// CSS presentation is outside this markup test; avoid invoking PostCSS in Node.
vi.mock("@/components/admin/admin.module.css", () => ({ default: {} }));

import { OrganizationSwitcher } from "@/components/admin/organization-switcher";

const geardrop: OrganizationMembership = { id: 1, slug: "geardrop", name: "Gear Drop", storefrontPublic: true, role: "owner" };
const oryvenne: OrganizationMembership = { id: 2, slug: "oryvenne", name: "Oryvenne", storefrontPublic: false, role: "owner" };

describe("OrganizationSwitcher", () => {
  it("names the only company without offering a menu", () => {
    const html = renderToStaticMarkup(<OrganizationSwitcher current={geardrop} organizations={[geardrop]} />);
    expect(html).toContain('data-testid="organization-current"');
    expect(html).toContain("Gear Drop");
    expect(html).not.toContain("<select");
  });

  it("offers every company the person works for, with the current one selected", () => {
    const html = renderToStaticMarkup(<OrganizationSwitcher current={oryvenne} organizations={[geardrop, oryvenne]} />);
    expect(html).toContain('data-testid="organization-switcher"');
    expect(html).toContain('name="organization"');
    expect(html).toMatch(/<option value="geardrop">Gear Drop<\/option>/);
    expect(html).toMatch(/<option value="oryvenne" selected="">Oryvenne<\/option>/);
    // Without JavaScript the same form still switches.
    expect(html).toContain("<noscript>");
  });
});
