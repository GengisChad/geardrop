import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("admin homepage editor contract", () => {
  it("renders every allowlisted section type through a closed editor", () => {
    const editor = read("src/components/admin/homepage/section-editor.tsx");
    for (const type of [
      "hero", "announcement", "featured_products", "latest_drops", "categories",
      "competitive_products", "bestsellers", "new_arrivals", "offers", "bundle",
      "club", "status_legend", "trust", "newsletter", "promo_banner", "rich_text", "cta",
    ]) expect(editor).toContain(`value="${type}"`);
    expect(editor).not.toContain("dangerouslySetInnerHTML");
  });

  it("uses real ready media and relational resource pickers", () => {
    const repository = read("src/lib/content/repository.ts");
    expect(repository).toContain('.eq("status", "ready")');
    for (const table of ["products", "categories", "bundles"]) expect(repository).toContain(`.from("${table}")`);
    const editor = read("src/components/admin/homepage/section-editor.tsx");
    expect(editor).toContain("desktopMediaAssetId");
    expect(editor).toContain("mobileMediaAssetId");
    expect(editor).toContain("targetIds");
  });

  it("supports drag, keyboard ordering, explicit save, unsaved warning, and statuses", () => {
    const sortable = read("src/components/admin/homepage/section-sortable-list.tsx");
    const editor = read("src/components/admin/homepage/section-editor.tsx");
    expect(sortable).toContain("draggable");
    expect(sortable).toContain("Sposta");
    expect(sortable).toContain("reorderHomepageSectionsAction");
    expect(editor).toContain("beforeunload");
    expect(editor).toContain("Modifiche non salvate");
    expect(editor).toContain("Salva sezione");
    expect(editor).toContain("Pubblica");
    expect(`${sortable}\n${editor}`).toContain("useActionState");
  });

  it("protects preview and shares the registered renderer", () => {
    const page = read("src/app/admin/(protected)/homepage/anteprima/page.tsx");
    expect(page).toContain("requireAdminAccess");
    expect(page).toContain("includeDrafts: true");
    expect(page).toContain("HomepageSectionRenderer");
    const renderer = read("src/components/content/homepage-section-renderer.tsx");
    expect(renderer).toContain("switch (section.section_type)");
    expect(renderer).not.toContain("eval(");
    expect(renderer).not.toContain("dangerouslySetInnerHTML");
  });

  it("keeps client components free from Supabase and meets touch target floor", () => {
    for (const file of ["homepage-editor.tsx", "section-editor.tsx", "section-sortable-list.tsx"]) {
      const source = read(`src/components/admin/homepage/${file}`);
      expect(source).not.toContain("@supabase/");
      expect(source).not.toContain("createSupabase");
      expect(source).not.toContain(".from(");
    }
    expect(read("src/components/admin/homepage/homepage.module.css")).toMatch(/min-height:\s*44px/);
  });
});
