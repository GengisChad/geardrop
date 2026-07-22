import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("structured content repository boundary", () => {
  it("uses request-scoped clients and typed relational tables", () => {
    const source = readFileSync(join(root, "src/lib/content/repository.ts"), "utf8");
    expect(source).toContain('import "server-only"');
    for (const table of [
      "homepage_sections", "homepage_section_products", "homepage_section_categories",
      "homepage_section_bundles", "content_pages", "navigation_menus", "navigation_items",
      "footer_columns", "footer_items", "social_links",
    ]) expect(source).toContain(`.from("${table}")`);
    expect(source).not.toContain("service_role");
    expect(source).not.toContain("createSupabase");
    expect(source).not.toContain("dangerouslySetInnerHTML");
  });

  it("keeps draft reads explicit and relies on RLS as final authorization", () => {
    const source = readFileSync(join(root, "src/lib/content/repository.ts"), "utf8");
    expect(source).toContain("includeDrafts");
    expect(source).toContain('.eq("publication_status", "published")');
    expect(source).toContain('.eq("active", true)');
    expect(source).toContain("RLS remains authoritative");
  });

  it("exposes exact public repository operations and cache tags", () => {
    const source = readFileSync(join(root, "src/lib/content/repository.ts"), "utf8");
    for (const operation of ["listHomepageSections", "getContentPage", "getNavigation", "getFooter"]) {
      expect(source).toContain(`function ${operation}`);
    }
    for (const tag of ["homepage", "pages", "navigation", "footer"]) expect(source).toContain(`"${tag}"`);
  });
});

