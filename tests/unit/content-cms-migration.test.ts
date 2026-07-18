import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrations = join(process.cwd(), "supabase", "migrations");

function source(): string {
  const files = readdirSync(migrations).filter((name) => name.endsWith("_add_structured_content_cms.sql"));
  expect(files).toHaveLength(1);
  return readFileSync(join(migrations, files[0] as string), "utf8");
}

describe("structured content CMS migration", () => {
  it("creates the allowlisted section type and relational CMS tables", () => {
    const sql = source();
    for (const value of [
      "hero", "announcement", "featured_products", "latest_drops", "categories",
      "competitive_products", "bestsellers", "new_arrivals", "offers", "bundle",
      "club", "status_legend", "trust", "newsletter", "promo_banner", "rich_text", "cta",
    ]) expect(sql).toContain(`'${value}'`);
    for (const table of [
      "homepage_sections", "homepage_section_products", "homepage_section_categories",
      "homepage_section_bundles", "content_pages", "navigation_menus", "navigation_items",
      "footer_columns", "footer_items", "social_links",
    ]) expect(sql).toContain(`create table public.${table}`);
    expect(sql).not.toMatch(/\bpayload\s+jsonb/i);
    expect(sql).not.toMatch(/\bhtml\s+text/i);
  });

  it("enforces publication windows, ready media, safe markdown, links, and navigation trees", () => {
    const sql = source();
    expect(sql).toContain("publication_status public.publication_status");
    expect(sql).toContain("desktop_media_asset_id bigint");
    expect(sql).toContain("mobile_media_asset_id bigint");
    expect(sql).toContain("GD_CMS_MEDIA_NOT_READY");
    expect(sql).toContain("GD_NAVIGATION_CYCLE");
    expect(sql).toContain("content_pages_markdown_only");
    expect(sql).toContain("private.is_safe_content_link");
  });

  it("defines least-privilege atomic RPCs and RLS on every exposed table", () => {
    const sql = source();
    for (const rpc of ["reorder_homepage_sections", "publish_homepage_section", "save_navigation_tree"]) {
      expect(sql).toContain(`public.${rpc}(`);
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${rpc}`));
    }
    expect(sql.match(/enable row level security/g)).toHaveLength(10);
    expect(sql).toContain("private.has_staff_role");
    expect(sql).toContain("set search_path = ''");
    expect(sql).not.toContain("auth.role()");
  });

  it("adds row and aggregate audit without touching Storage objects", () => {
    const sql = source();
    expect(sql).toContain("homepage_sections_audit_admin_mutation");
    expect(sql).toContain("navigation_items_audit_admin_mutation");
    expect(sql).toContain("content.homepage.reordered");
    expect(sql).toContain("content.homepage.published");
    expect(sql).toContain("content.navigation.saved");
    expect(sql).not.toMatch(/insert\s+into\s+storage\.objects/i);
  });
});

