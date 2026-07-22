import { describe, expect, it, vi } from "vitest";
import { listAdminProducts } from "@/lib/admin/product-repository";
import type { AdminProductQuery } from "@/lib/admin/products";

vi.mock("server-only", () => ({}));

type Call = { readonly method: string; readonly args: readonly unknown[] };

function query(result: { readonly data: readonly unknown[]; readonly count?: number | null }) {
  const calls: Call[] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "neq", "gt", "or", "order", "range"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  builder.then = (resolve: (value: unknown) => unknown) => resolve({ ...result, error: null });
  return { builder, calls };
}

const baseQuery: AdminProductQuery = {
  q: "",
  publication: "all",
  availability: "all",
  category: null,
  lowStock: false,
  sort: "updated-desc",
  page: 1,
  pageSize: 20,
};

describe("admin product repository", () => {
  it("requests exact count and range from PostgreSQL", async () => {
    const products = query({ data: [], count: 0 });
    const categories = query({ data: [] });
    const client = {
      from: vi.fn((table: string) => table === "products" ? products.builder : categories.builder),
    };

    const result = await listAdminProducts(client as never, { ...baseQuery, page: 2, pageSize: 10 });

    expect(products.calls).toContainEqual({ method: "select", args: [expect.any(String), { count: "exact" }] });
    expect(products.calls).toContainEqual({ method: "range", args: [10, 19] });
    expect(result).toMatchObject({ items: [], total: 0, pageCount: 1 });
  });

  it("pushes search, exact filters, low-stock projection, and ordering into the query", async () => {
    const products = query({ data: [], count: 0 });
    const categories = query({ data: [] });
    const client = {
      from: vi.fn((table: string) => table === "products" ? products.builder : categories.builder),
    };

    await listAdminProducts(client as never, {
      ...baseQuery,
      q: "dran",
      publication: "draft",
      availability: "esaurito",
      category: 7,
      lowStock: true,
      sort: "price-asc",
    });

    expect(products.calls).toContainEqual({ method: "or", args: [expect.stringContaining("name.ilike.%dran%") ] });
    expect(products.calls).toContainEqual({ method: "eq", args: ["publication_status", "draft"] });
    expect(products.calls).toContainEqual({ method: "eq", args: ["stock_status", "esaurito"] });
    expect(products.calls).toContainEqual({ method: "eq", args: ["category_id", 7] });
    expect(products.calls).toContainEqual({ method: "eq", args: ["is_low_stock", true] });
    expect(products.calls).toContainEqual({ method: "order", args: ["price_cents", { ascending: true }] });
  });
});
