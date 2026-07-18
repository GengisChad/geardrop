import { describe, expect, it } from "vitest";
import {
  adminProductComputedStateSchema,
  normalizeAdminProductQuery,
  productEditorSchema,
  productMutationCapabilities,
  slugifyProduct,
  skuSchema,
} from "@/lib/admin/products";

describe("product administration domain", () => {
  it("accepts only computed availability returned by PostgreSQL", () => {
    expect(adminProductComputedStateSchema.parse({
      stock_status: "pre-ordine",
      is_purchasable: false,
    })).toEqual({ stock_status: "pre-ordine", is_purchasable: false });
    expect(adminProductComputedStateSchema.safeParse({
      stock_status: "calcolato-nel-browser",
      is_purchasable: true,
    }).success).toBe(false);
  });

  it("normalizes slugs and validates normalized SKUs", () => {
    expect(slugifyProduct("  Dran Sword 3-60F!  ")).toBe("dran-sword-3-60f");
    expect(skuSchema.safeParse("bx-01").success).toBe(true);
    expect(skuSchema.safeParse("BX 01").success).toBe(false);
  });

  it("rejects invalid prices and preorder without release acknowledgement", () => {
    const base = {
      name: "Dran Sword",
      slug: "dran-sword",
      sku: "bx-01",
      categoryId: 1,
      tagline: "Starter",
      description: "Descrizione completa",
      priceCents: 1990,
      compareAtPriceCents: null,
      publicationStatus: "draft" as const,
      active: false,
      bladeType: null,
      shortName: null,
      manageStock: true,
      lowStockThreshold: 5,
      allowBackorder: false,
      availabilityOverride: null,
      preorderAllocation: 0,
      preorderReleaseDate: null,
      preorderWarningConfirmed: false,
      seoTitle: null,
      seoDescription: null,
      sortOrder: 0,
    };

    expect(productEditorSchema.safeParse({ ...base, compareAtPriceCents: 1500 }).success).toBe(false);
    expect(productEditorSchema.safeParse({
      ...base,
      availabilityOverride: "preorder",
      preorderAllocation: 5,
    }).success).toBe(false);
    expect(productEditorSchema.safeParse({
      ...base,
      availabilityOverride: "preorder",
      preorderAllocation: 5,
      preorderWarningConfirmed: true,
    }).success).toBe(true);
  });

  it("keeps editor away from sensitive commerce and destructive mutations", () => {
    expect(productMutationCapabilities("editor")).toEqual({
      editContent: true,
      editCommerce: false,
      publish: true,
      hardDelete: false,
      duplicate: true,
    });
    expect(productMutationCapabilities("admin").editCommerce).toBe(true);
    expect(productMutationCapabilities("owner").hardDelete).toBe(true);
  });

  it("bounds filters and pagination from URL search params", () => {
    expect(normalizeAdminProductQuery({ page: "-2", pageSize: "999", sort: "unknown", q: "  dran  " })).toEqual(
      expect.objectContaining({ page: 1, pageSize: 50, sort: "updated-desc", q: "dran" }),
    );
  });
});
