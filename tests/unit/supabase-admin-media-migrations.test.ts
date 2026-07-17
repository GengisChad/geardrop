import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDirectory = join(process.cwd(), "supabase", "migrations");

function migration(name: string): string {
  const filename = readdirSync(migrationsDirectory).find((candidate) => candidate.endsWith(`_${name}.sql`));

  if (!filename) {
    throw new Error(`Migration not found: ${name}`);
  }

  return readFileSync(join(migrationsDirectory, filename), "utf8").toLowerCase();
}

function pgTap(name: string): string {
  return readFileSync(join(process.cwd(), "supabase", "tests", name), "utf8").toLowerCase();
}

describe("Admin Phase 2 database and media foundation", () => {
  it("adds only the normalized product and media schema", () => {
    const sql = migration("add_admin_media_schema");

    for (const column of [
      "short_name",
      "manage_stock",
      "low_stock_threshold",
      "allow_backorder",
      "preorder_release_date",
      "seo_title",
      "seo_description",
    ]) {
      expect(sql).toContain(`add column ${column}`);
    }

    expect(sql).toContain("add value if not exists 'cross_sell'");
    expect(sql).toContain("add value if not exists 'compatible'");
    expect(sql).toContain("create table public.media_assets");
    expect(sql).toContain("media_asset_id bigint references public.media_assets(id)");
    expect(sql).toContain("create unique index product_images_one_primary_idx");
    expect(sql).toContain("where is_primary");
    expect(sql).toContain("alter table public.media_assets enable row level security");
    expect(sql).toContain("create or replace function private.preserve_media_asset_provenance");
    expect(sql).toContain("gd_media_uploader_immutable");
    expect(sql).not.toContain("media_storage_mutation_intents");
  });

  it("keeps the product-images bucket private and restricts upload shape", () => {
    const sql = migration("add_admin_media_schema");

    expect(sql).toContain("'product-images'");
    expect(sql).toContain("10485760");
    for (const mime of ["image/png", "image/jpeg", "image/webp", "image/avif"]) {
      expect(sql).toContain(mime);
    }
    expect(sql).not.toContain("image/svg+xml");
    expect(sql).toMatch(/public\s*=\s*false/);
  });

  it("enforces least-privilege media, Storage, and inventory authorization", () => {
    const sql = migration("secure_admin_media_inventory");

    expect(sql).not.toContain("alter table public.media_assets enable row level security");
    expect(sql).toContain("media_assets_staff_read");
    expect(sql).toContain("media_assets_content_staff_insert");
    expect(sql).toContain("media_assets_content_staff_update");
    expect(sql).toContain("media_assets_manager_delete");
    expect(sql).toContain("on storage.objects");
    expect(sql).toContain("bucket_id = 'product-images'");
    expect(sql).toContain("storage.allow_any_operation");
    expect(sql).toContain("public.record_completed_media_storage_mutation");
    expect(sql).toContain("'storage.' || normalized_operation || '.completed'");
    expect(sql).toContain("gd_storage_manager_required");
    expect(sql).toContain("private.is_public_product(product_image.product_id)");
    expect(sql).toContain("create or replace function public.adjust_inventory");
    expect(sql).not.toMatch(/adjust_inventory[\s\S]+?'editor'::public\.staff_role/);
    expect(sql).not.toContain("auth.role()");
    expect(sql).not.toContain("user_metadata");
    expect(sql).not.toContain("media_storage_mutation_intent");
    expect(sql).not.toContain("authorize_media_storage_mutation");
    expect(sql).not.toContain("consume_media_storage_mutation_intent");
    expect(sql).not.toContain("delete from private.");
    expect(sql).not.toMatch(/create trigger[\s\S]+?on storage\.objects/);
  });

  it("allows official cross-staff Storage upsert without weakening first-upload provenance", () => {
    const sql = migration("secure_admin_media_inventory");
    const insertPolicy = sql.match(
      /create policy product_images_content_staff_insert[\s\S]*?\n\);/,
    )?.[0];

    expect(insertPolicy).toBeDefined();
    expect(insertPolicy).toContain("bucket_id = 'product-images'");
    expect(insertPolicy).toContain("owner_id = (select auth.uid()::text)");
    expect(insertPolicy).toContain("media_asset.uploaded_by = (select auth.uid())");
    expect(insertPolicy).toContain("storage.allow_only_operation('object.upload_update')");
    expect(insertPolicy).toMatch(
      /media_asset\.uploaded_by = \(select auth\.uid\(\)\)\s+or storage\.allow_only_operation\('object\.upload_update'\)/,
    );
  });

  it("audits product and media mutations without exposing the trigger function", () => {
    const sql = migration("secure_admin_media_inventory");

    expect(sql).toContain("create or replace function private.audit_admin_mutation");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("auth.uid()");
    expect(sql).toContain("insert into public.audit_events");
    expect(sql).toContain("entity_row ->> 'relation_type'");
    expect(sql).toContain("'storage.objects'");
    expect(sql).toContain("revoke all on function private.audit_admin_mutation()");

    for (const table of [
      "products",
      "media_assets",
      "product_images",
      "product_specs",
      "product_features",
      "product_box_contents",
      "product_tags",
      "product_relations",
    ]) {
      expect(sql).toContain(`on public.${table}`);
    }
  });

  it("carries executable pgTAP contracts for schema, policies, denial, and audit behavior", () => {
    const schema = pgTap("006_admin_media_schema.test.sql");
    const security = pgTap("007_admin_media_security.test.sql");
    const reviewFixes = pgTap("008_admin_media_review_fixes.test.sql");

    for (const expected of [
      "media_assets",
      "product_images_one_primary_idx",
      "cross_sell",
      "compatible",
      "product-images",
      "image/avif",
    ]) {
      expect(schema).toContain(expected);
    }

    for (const expected of [
      "customer cannot enumerate the media library",
      "editor cannot permanently delete media",
      "editor cannot adjust inventory",
      "storage.allow_any_operation",
      "audit event records the editor actor",
      "product mutation is audited",
    ]) {
      expect(security).toContain(expected);
    }

    for (const expected of [
      "media uploader provenance cannot be reassigned",
      "media uploader provenance cannot be cleared",
      "product relation audit identity includes relation type",
      "storage list operation cannot enumerate eligible objects",
      "eligible object read succeeds without media-library enumeration",
      "anonymous storage insert is denied",
      "nonstaff storage insert is denied",
      "editor storage insert is allowed by pure rls",
      "editor storage update is allowed by pure rls",
      "editor can update media uploaded by another staff member",
      "official cross-staff storage upsert is allowed",
      "editor storage delete is denied",
      "admin storage delete is allowed",
      "nonstaff cannot record completed storage mutation",
      "editor completed storage mutations are audited",
      "admin completed storage delete is audited",
    ]) {
      expect(reviewFixes).toContain(expected);
    }
  });
});
