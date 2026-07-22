import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("promotion and coupon administration", () => {
  it("defines closed schemas for every pricing rule and relational target", () => {
    const promotions = read("src/lib/admin/promotions.ts");
    const coupons = read("src/lib/admin/coupons.ts");
    for (const value of ["percentage", "fixed", "promotional_price", "minimumSubtotalCents", "minimumQuantity", "priority", "stackable", "productIds", "categoryIds", "bundleIds"]) expect(promotions).toContain(value);
    for (const value of ["percentage", "fixed", "freeShipping", "maximumDiscountCents", "perCustomerLimit", "firstPurchaseOnly", "productIds", "categoryIds", "bundleIds"]) expect(coupons).toContain(value);
  });

  it("protects all six routes and reads real rows from repositories", () => {
    for (const route of [
      "promozioni/page.tsx", "promozioni/nuova/page.tsx", "promozioni/[id]/page.tsx",
      "coupon/page.tsx", "coupon/nuovo/page.tsx", "coupon/[id]/page.tsx",
    ]) {
      const source = read(`src/app/admin/(protected)/${route}`);
      expect(source).toContain("requireAdminAccess");
      expect(source).toContain("createSupabaseServerClient");
    }
    expect(read("src/lib/admin/promotion-repository.ts")).toContain('.from("promotions")');
    expect(read("src/lib/admin/coupon-repository.ts")).toContain('.from("coupons")');
  });

  it("keeps all mutations authenticated, manager-authorized, validated, and server-side", () => {
    for (const file of ["promotions.ts", "coupons.ts"]) {
      const source = read(`src/app/admin/actions/${file}`);
      expect(source).toContain('"use server"');
      expect(source).toContain("requireUser");
      expect(source).toContain("requireStaffRole");
      expect(source).toContain('["owner", "admin"]');
      expect(source).toContain("safeParse");
      expect(source).not.toContain("service_role");
    }
  });

  it("supports real target preview, authoritative pricing, duplication, usage, and immediate disable", () => {
    const repository = read("src/lib/admin/promotion-repository.ts");
    expect(repository).toContain("affectedProducts");
    expect(repository).toContain("calculate_cart_pricing");
    const couponActions = read("src/app/admin/actions/coupons.ts");
    expect(couponActions).toContain("duplicateCouponAction");
    expect(couponActions).toContain("disableCouponAction");
    expect(couponActions).toContain("disabled_at");
    expect(read("src/lib/admin/coupon-repository.ts")).toContain("coupon_redemptions");
  });

  it("offers usable Italian forms without browser Supabase or invented preview data", () => {
    for (const file of ["src/components/admin/promotions/promotion-form.tsx", "src/components/admin/coupons/coupon-form.tsx"]) {
      const source = read(file);
      expect(source).toContain("Prodotti coinvolti");
      expect(source).toContain("Modifiche non salvate");
      expect(source).not.toContain("createSupabase");
      expect(source).not.toContain("mock");
    }
    expect(read("src/components/admin/promotions/pricing.module.css")).toMatch(/min-height:\s*44px/);
  });
});
