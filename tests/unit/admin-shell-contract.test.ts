import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  const absolutePath = join(process.cwd(), path);
  expect(existsSync(absolutePath), `${path} must exist`).toBe(true);
  return readFileSync(absolutePath, "utf8");
}

describe("admin route isolation", () => {
  it("keeps storefront chrome out of the root and admin layouts", () => {
    const rootLayout = source("src/app/layout.tsx");
    const storefrontLayout = source("src/app/(storefront)/layout.tsx");
    const adminLayout = source("src/app/admin/layout.tsx");

    expect(rootLayout).not.toMatch(/<Header|<Footer|<BottomTabBar/);
    expect(storefrontLayout).toMatch(/<Header[\s/>]/);
    expect(storefrontLayout).toMatch(/<Footer[\s/>]/);
    expect(storefrontLayout).toMatch(/<BottomTabBar[\s/>]/);
    expect(adminLayout).not.toMatch(/Header|Footer|BottomTabBar/);
  });
});

describe("admin authentication boundary", () => {
  it("uses request-scoped verified auth without a session or service key shortcut", () => {
    const access = source("src/lib/admin/access.ts");
    const layout = source("src/app/admin/(protected)/layout.tsx");
    const page = source("src/app/admin/(protected)/page.tsx");
    const login = source("src/app/admin/login/actions.ts");
    const logout = source("src/app/admin/logout/route.ts");
    const combined = `${access}\n${layout}\n${page}\n${login}\n${logout}`;

    expect(layout).toContain("createSupabaseServerClient");
    expect(layout).toContain("await requireAdminAccess(client)");
    expect(page).toContain("createSupabaseServerClient");
    expect(page).toContain("await requireAdminAccess(client)");
    expect(page.indexOf("await requireAdminAccess")).toBeLessThan(
      page.indexOf("await loadAdminDashboard"),
    );
    expect(access).toContain('import "server-only"');
    expect(access).toContain("requireUser");
    expect(access).toContain("requireStaffRole(client, STAFF_ROLES)");
    expect(access).toContain("AuthenticationRequiredError");
    expect(access).toContain("StaffAuthorizationError");
    expect(access).toContain('redirect("/admin/login")');
    expect(access).toContain("throw error");
    expect(login).toContain("signInWithPassword");
    expect(login).toContain("requireStaffRole");
    expect(logout).toContain("export async function POST");
    expect(logout).toContain("signOut");
    expect(combined).not.toContain("getSession(");
    expect(combined).not.toContain("createPrivilegedSupabaseClient");
  });

  it("marks every protected admin boundary dynamic and non-cacheable", () => {
    const layout = source("src/app/admin/(protected)/layout.tsx");
    const page = source("src/app/admin/(protected)/page.tsx");

    expect(layout).toContain('dynamic = "force-dynamic"');
    expect(layout).toContain('fetchCache = "force-no-store"');
    expect(page).toContain('dynamic = "force-dynamic"');
    expect(page).toContain('fetchCache = "force-no-store"');
  });

  it("does not swallow the authenticated-staff login redirect", () => {
    const page = source("src/app/admin/login/page.tsx");

    expect(page.lastIndexOf('redirect("/admin")')).toBeGreaterThan(page.indexOf("} catch"));
  });
});

describe("admin shell state", () => {
  it("keeps the order lock exact, persistent, and accessible", () => {
    const banner = source("src/components/admin/order-lock-banner.tsx");

    expect(banner).toContain('role="alert"');
    expect(banner).toContain(
      "Gli ordini sono disabilitati. Completa configurazione, stock e pagamenti prima dell’attivazione.",
    );
    expect(banner).not.toMatch(/dismiss|close|chiudi/i);
  });

  it("enables every implemented destination and locks future modules", () => {
    const nav = source("src/lib/admin/navigation.ts");

    for (const label of ["Panoramica", "Prodotti", "Categorie", "Bundle", "Inventario", "Media", "Homepage", "Pagine", "Navigazione", "Footer", "Promozioni", "Coupon", "Ordini"]) {
      expect(nav).toMatch(new RegExp(`label: "${label}"[\\s\\S]{0,120}disabled: false`));
    }

    for (const label of ["Impostazioni", "Team", "Attività"]) {
      expect(nav).toMatch(new RegExp(`label: "${label}"[\\s\\S]{0,120}disabled: true`));
    }
  });

  it("keeps staff identity visible in the base 390px layout", () => {
    const css = source("src/components/admin/admin.module.css");

    expect(css).toMatch(/\.staffIdentity\s*\{[^}]*display:\s*flex/);
    expect(css).not.toMatch(/\.staffIdentity\s*\{[^}]*display:\s*none/);
  });

  it("keeps compact mobile store and logout controls accessibly named", () => {
    const shell = source("src/components/admin/admin-shell.tsx");

    expect(shell).toContain('aria-label="Visualizza negozio"');
    expect(shell).toContain('aria-label="Esci dall’amministrazione"');
  });

  it("removes unused mobile brand and dashboard order-chip presentation", () => {
    const shell = source("src/components/admin/admin-shell.tsx");
    const css = source("src/components/admin/admin.module.css");

    expect(shell).not.toContain("mobileBrand");
    expect(css).not.toMatch(/\.mobileBrand|\.orderChip/);
  });

  it("uses Next links with accessible active navigation state", () => {
    const nav = source("src/components/admin/admin-navigation.tsx");
    const page = source("src/app/admin/(protected)/page.tsx");

    expect(nav).toContain('import Link from "next/link"');
    expect(nav).toContain("isAdminNavItemActive");
    expect(nav).toContain('aria-current={active ? "page" : undefined}');
    expect(nav).not.toMatch(/<a\s/);
    expect(page).not.toMatch(/<a href="\/admin/);
    expect(page.match(/<Link/g)).toHaveLength(5);
    for (const href of ["/admin/prodotti/nuovo", "/admin/inventario", "/admin/media"]) {
      expect(page).toContain(href);
    }
  });
});

describe("admin dashboard data", () => {
  it("queries real catalogue and inventory movement tables without duplicating global settings", () => {
    const dashboard = source("src/lib/admin/dashboard.ts");
    const page = source("src/app/admin/(protected)/page.tsx");

    expect(dashboard).toContain('.from("products")');
    expect(dashboard).toContain('.from("inventory_movements")');
    expect(dashboard).not.toContain('.from("site_settings")');
    expect(page).not.toContain("acceptOrders");
    expect(dashboard).toContain("publication_status");
    expect(dashboard).toContain("low_stock_threshold");
    expect(dashboard).toContain("availability_override");
    expect(dashboard).toContain("stock_status");
    expect(dashboard).not.toMatch(/revenue|fatturato|vendite/i);
  });
});
