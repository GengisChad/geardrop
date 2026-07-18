import { describe, expect, it, vi } from "vitest";
import { mapDashboardPayload, summarizeDashboardProducts } from "@/lib/admin/dashboard";
import * as navigation from "@/lib/admin/navigation";

vi.mock("server-only", () => ({}));

type ProductState = {
  readonly availability_override: "preorder" | "incoming" | null;
  readonly low_stock_threshold: number;
  readonly manage_stock: boolean;
  readonly publication_status: "draft" | "published" | "archived";
  readonly stock_quantity: number;
  readonly stock_status: "disponibile" | "in-arrivo" | "pre-ordine" | "esaurito";
};

function product(overrides: Partial<ProductState> = {}): ProductState {
  return {
    availability_override: null,
    low_stock_threshold: 5,
    manage_stock: true,
    publication_status: "published",
    stock_quantity: 10,
    stock_status: "disponibile",
    ...overrides,
  };
}

describe("admin dashboard metric behavior", () => {
  it("maps an empty manager aggregate to exact zeros and empty lists", () => {
    expect(mapDashboardPayload({ products: { total: 0, published: 0, draft: 0, archived: 0, sold_out: 0, low_stock: 0, preorder: 0 }, active_coupons: 0, active_promotions: 0, commerce: { order_count: 0, revenue_cents: 0, average_order_value_cents: 0, latest_orders: [] }, stock_movements: [], staff_activity: [] })).toMatchObject({
      commerce: { orderCount: 0, revenueCents: 0, averageOrderValueCents: 0, latestOrders: [] }, activeCoupons: 0, activePromotions: 0, movements: [], staffActivity: [],
    });
  });

  it("preserves editor redaction instead of inventing commerce zeros", () => {
    const mapped=mapDashboardPayload({ products: { total: 0, published: 0, draft: 0, archived: 0, sold_out: 0, low_stock: 0, preorder: 0 }, active_coupons: 0, active_promotions: 0, commerce: null, stock_movements: [], staff_activity: null });
    expect(mapped.commerce).toBeNull();expect(mapped.staffActivity).toBeNull();
  });
  it("returns zero metrics for an empty catalogue", () => {
    expect(summarizeDashboardProducts([])).toEqual({
      total: 0,
      published: 0,
      draft: 0,
      archived: 0,
      soldOut: 0,
      lowStock: 0,
      preorder: 0,
    });
  });

  it("counts only generated esaurito state as sold out", () => {
    const metrics = summarizeDashboardProducts([
      product({ stock_quantity: 0, stock_status: "esaurito" }),
      product({
        availability_override: "preorder",
        stock_quantity: 0,
        stock_status: "pre-ordine",
      }),
      product({
        availability_override: "incoming",
        stock_quantity: 0,
        stock_status: "in-arrivo",
      }),
      product({ publication_status: "archived", stock_quantity: 0, stock_status: "esaurito" }),
      product({ manage_stock: false, stock_quantity: 0, stock_status: "esaurito" }),
    ]);

    expect(metrics.soldOut).toBe(1);
  });

  it("counts low stock at the threshold but excludes zero, archived and unmanaged rows", () => {
    const metrics = summarizeDashboardProducts([
      product({ stock_quantity: 5 }),
      product({ stock_quantity: 6 }),
      product({ stock_quantity: 0, stock_status: "esaurito" }),
      product({ publication_status: "archived", stock_quantity: 1 }),
      product({ manage_stock: false, stock_quantity: 1 }),
    ]);

    expect(metrics.lowStock).toBe(1);
  });
});

describe("admin navigation path behavior", () => {
  it("matches exact paths or full child segments without prefix collisions", () => {
    expect("isAdminNavItemActive" in navigation).toBe(true);
    if (!("isAdminNavItemActive" in navigation)) return;

    const isActive = navigation.isAdminNavItemActive;
    expect(isActive("/admin", "/admin")).toBe(true);
    expect(isActive("/admin/prodotti", "/admin/prodotti")).toBe(true);
    expect(isActive("/admin/prodotti/42", "/admin/prodotti")).toBe(true);
    expect(isActive("/admin/prodotti-speciali", "/admin/prodotti")).toBe(false);
    expect(isActive("/admin/prodotti", "/admin")).toBe(false);
  });
});
