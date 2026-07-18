import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrations = join(process.cwd(), "supabase", "migrations");

function source(): string {
  const files = readdirSync(migrations).filter((name) => name.endsWith("_extend_categories_and_bundles.sql"));
  expect(files).toHaveLength(1);
  return readFileSync(join(migrations, files[0] as string), "utf8");
}

describe("category and bundle extension migration", () => {
  it("adds typed publication, ready media, SEO, windows, and ordering", () => {
    const sql = source();
    expect(sql).toContain("media_asset_id bigint");
    expect(sql).toContain("seo_title text");
    expect(sql).toContain("seo_description text");
    expect(sql).toContain("publication_status public.publication_status");
    expect(sql).toContain("availability_override public.availability_override");
    expect(sql).toContain("starts_at timestamptz");
    expect(sql).toContain("ends_at timestamptz");
    expect(sql).toContain("GD_MEDIA_NOT_READY");
  });

  it("defines fixed-search-path atomic RPCs and least privilege", () => {
    const sql = source();
    expect(sql).toContain("public.save_bundle_with_items(");
    expect(sql).toContain("public.reorder_categories(");
    expect(sql.match(/security definer/g)?.length).toBeGreaterThanOrEqual(2);
    expect(sql.match(/set search_path = ''/g)?.length).toBeGreaterThanOrEqual(2);
    expect(sql).toContain("GD_BUNDLE_MANAGER_REQUIRED");
    expect(sql).toContain("GD_CATEGORY_ID_SET_MISMATCH");
    expect(sql).toMatch(/revoke all on function public\.save_bundle_with_items\(jsonb, jsonb\)/);
    expect(sql).toMatch(/revoke all on function public\.reorder_categories\(bigint\[\]\)/);
  });

  it("replaces public visibility and adds row plus aggregate audit", () => {
    const sql = source();
    expect(sql).toContain("private.is_public_category");
    expect(sql).toContain("media_asset.status = 'ready'");
    expect(sql).toContain("category.media_asset_id = media_asset.id");
    expect(sql).toContain("bundle.media_asset_id = media_asset.id");
    expect(sql).toContain("categories_audit_admin_mutation");
    expect(sql).toContain("bundles_audit_admin_mutation");
    expect(sql).toContain("bundle_items_audit_admin_mutation");
    expect(sql).toContain("catalog.bundle.saved");
    expect(sql).toContain("catalog.categories.reordered");
    expect(sql).not.toMatch(/insert\s+into\s+storage\.objects/i);
  });
});
