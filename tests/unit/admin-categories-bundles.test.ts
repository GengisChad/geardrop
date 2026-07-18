import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  categoryEditorSchema,
  categoryIdsSchema,
} from "@/lib/admin/categories";
import {
  bundleEditorSchema,
  bundleMutationCapabilities,
} from "@/lib/admin/bundles";

const root = process.cwd();

const validCategory = {
  name: "Starter",
  slug: "starter",
  tagline: "Primi lanci",
  description: "Categoria per iniziare.",
  mediaAssetId: null,
  publicationStatus: "draft" as const,
  active: false,
  seoTitle: null,
  seoDescription: null,
  sortOrder: 0,
};

const validBundle = {
  slug: "starter-pack",
  eyebrow: "Bundle",
  titleLineOne: "Pronto al",
  titleLineTwo: "primo lancio",
  description: "Set completo per iniziare.",
  priceCents: 2990,
  compareAtPriceCents: 3490,
  heroProductId: 1,
  mediaAssetId: null,
  availabilityOverride: null,
  sortOrder: 0,
  active: false,
  startsAt: null,
  endsAt: null,
  items: [{ productId: 1, quantity: 1, sortOrder: 0 }],
};

describe("category and bundle administration", () => {
  it("validates category content, SEO, slugs, and exact unique ordering", () => {
    expect(categoryEditorSchema.safeParse(validCategory).success).toBe(true);
    expect(categoryEditorSchema.safeParse({ ...validCategory, slug: "Starter Pack" }).success).toBe(false);
    expect(categoryEditorSchema.safeParse({ ...validCategory, seoTitle: "x".repeat(71) }).success).toBe(false);
    expect(categoryIdsSchema.safeParse([1, 2, 3]).success).toBe(true);
    expect(categoryIdsSchema.safeParse([1, 2, 1]).success).toBe(false);
  });

  it("validates bundle prices, dates, quantities, and unique products", () => {
    expect(bundleEditorSchema.safeParse(validBundle).success).toBe(true);
    expect(bundleEditorSchema.safeParse({ ...validBundle, compareAtPriceCents: 2000 }).success).toBe(false);
    expect(bundleEditorSchema.safeParse({
      ...validBundle,
      startsAt: "2026-08-02T12:00:00.000Z",
      endsAt: "2026-08-01T12:00:00.000Z",
    }).success).toBe(false);
    expect(bundleEditorSchema.safeParse({
      ...validBundle,
      items: [{ productId: 1, quantity: 0, sortOrder: 0 }],
    }).success).toBe(false);
    expect(bundleEditorSchema.safeParse({
      ...validBundle,
      items: [
        { productId: 1, quantity: 1, sortOrder: 0 },
        { productId: 1, quantity: 2, sortOrder: 1 },
      ],
    }).success).toBe(false);
  });

  it("keeps bundle commerce manager-only", () => {
    expect(bundleMutationCapabilities("editor")).toEqual({ editContent: true, editCommerce: false });
    expect(bundleMutationCapabilities("admin").editCommerce).toBe(true);
    expect(bundleMutationCapabilities("owner").editCommerce).toBe(true);
  });

  it("uses authenticated server actions and atomic database operations", () => {
    const categories = readFileSync(join(root, "src/app/admin/actions/categories.ts"), "utf8");
    const bundles = readFileSync(join(root, "src/app/admin/actions/bundles.ts"), "utf8");
    expect(categories).toContain("requireStaffRole");
    expect(categories).toContain('.rpc("reorder_categories"');
    expect(categories).toContain("revalidatePath");
    expect(bundles).toContain("requireStaffRole");
    expect(bundles).toContain('.rpc("save_bundle_with_items"');
    expect(bundles).not.toContain('.from("bundle_items").delete');
    expect(bundles).not.toContain('.from("bundle_items").insert');
    expect(`${categories}\n${bundles}`).not.toContain("service_role");
  });

  it("loads exact real rows and ready media in server repositories", () => {
    const categories = readFileSync(join(root, "src/lib/admin/category-repository.ts"), "utf8");
    const bundles = readFileSync(join(root, "src/lib/admin/bundle-repository.ts"), "utf8");
    expect(categories).toContain('{ count: "exact" }');
    expect(categories).toContain('.eq("status", "ready")');
    expect(bundles).toContain('{ count: "exact" }');
    expect(bundles).toContain("loadAdminCategoryCreateContext");
    expect(bundles).toContain('.from("bundle_items")');
    expect(bundles).toContain("if (!bundles.data?.length)");
    expect(bundles).not.toContain("bundle_items(count)");
  });

  it("keeps Supabase out of category and bundle client components", () => {
    for (const file of [
      "src/components/admin/catalog/category-order-list.tsx",
      "src/components/admin/catalog/category-editor-form.tsx",
      "src/components/admin/catalog/bundle-editor-form.tsx",
    ]) {
      const source = readFileSync(join(root, file), "utf8");
      expect(source).not.toContain("@supabase/");
      expect(source).not.toContain("createSupabase");
      expect(source).not.toContain(".from(");
    }
  });
});
