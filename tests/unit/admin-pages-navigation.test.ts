import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("managed pages, navigation, and footer", () => {
  it("protects every CMS route and reads through repositories", () => {
    for (const route of [
      "src/app/admin/(protected)/pagine/page.tsx",
      "src/app/admin/(protected)/pagine/[slug]/page.tsx",
      "src/app/admin/(protected)/navigazione/page.tsx",
      "src/app/admin/(protected)/footer/page.tsx",
    ]) {
      const source = read(route);
      expect(source).toContain("requireAdminAccess");
      expect(source).toContain("createSupabaseServerClient");
    }
  });

  it("offers the approved informational slugs and a validated Markdown editor", () => {
    const pages = read("src/components/admin/content/page-editor.tsx");
    for (const slug of ["chi-siamo", "assistenza", "faq", "spedizioni", "resi", "privacy", "cookie", "termini"]) {
      expect(pages).toContain(slug);
    }
    expect(pages).toContain("saveContentPageAction");
    expect(pages).toContain("Modifiche non salvate");
    expect(pages).not.toContain("contentEditable");
  });

  it("uses structured controls for desktop/mobile trees, footer columns, items, and social links", () => {
    const navigation = read("src/components/admin/content/navigation-editor.tsx");
    const footer = read("src/components/admin/content/footer-editor.tsx");
    expect(navigation).toContain("desktop");
    expect(navigation).toContain("mobile");
    expect(navigation).toContain("saveNavigationTreeAction");
    expect(navigation).toContain("Sposta");
    expect(footer).toContain("saveFooterConfigurationAction");
    expect(footer).toContain("Colonne");
    expect(footer).toContain("Link social");
    expect(`${navigation}\n${footer}`).not.toContain("<textarea");
  });

  it("keeps mutations in authenticated validated server actions", () => {
    const actions = read("src/app/admin/actions/content.ts");
    expect(actions).toContain("footerConfigurationSchema.safeParse");
    expect(actions).toContain("verifiedStaff()");
    expect(actions).toContain("saveFooterConfigurationAction");
    for (const client of ["page-editor.tsx", "navigation-editor.tsx", "footer-editor.tsx"]) {
      expect(read(`src/components/admin/content/${client}`)).not.toContain("createSupabase");
    }
  });

  it("registers CMS navigation while meeting touch and error-state requirements", () => {
    const nav = read("src/lib/admin/navigation.ts");
    for (const href of ["/admin/pagine", "/admin/navigazione", "/admin/footer"]) expect(nav).toContain(href);
    const css = read("src/components/admin/content/content.module.css");
    expect(css).toMatch(/min-height:\s*44px/);
    expect(read("src/app/admin/(protected)/pagine/error.tsx")).toContain("Riprova");
  });
});
