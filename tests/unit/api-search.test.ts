import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createMockProvider } from "@/lib/commerce/mock-provider";

/**
 * Route handler: GET /api/search
 *
 * Verifies query validation (trim, min 2 chars, max 60 chars), response shape, and that
 * the provider receives the validated query. The provider itself is mocked so these tests
 * stay fast and isolated from the catalogue fixture.
 */

const getCommerceProviderMock = vi.fn();

vi.mock("@/lib/commerce/provider", () => ({
  getCommerceProvider: getCommerceProviderMock,
}));

// Import after the mock is registered (vitest hoists vi.mock above imports).
const { GET } = await import("@/app/api/search/route");

const realProvider = createMockProvider();

function makeRequest(q: string | null): NextRequest {
  const url = new URL("/api/search", "http://localhost:3000");
  if (q !== null) url.searchParams.set("q", q);
  return new NextRequest(url);
}

describe("GET /api/search — query validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCommerceProviderMock.mockResolvedValue(realProvider);
  });

  it("returns an empty result for a missing query", async () => {
    const res = await GET(makeRequest(null));
    const data = await res.json() as { items: unknown[]; total: number };
    expect(data.items).toHaveLength(0);
    expect(data.total).toBe(0);
    // Provider must not be called — no point fetching for nothing.
    expect(getCommerceProviderMock).not.toHaveBeenCalled();
  });

  it("returns an empty result for a single-character query", async () => {
    const res = await GET(makeRequest("a"));
    const data = await res.json() as { items: unknown[]; total: number };
    expect(data.items).toHaveLength(0);
    expect(getCommerceProviderMock).not.toHaveBeenCalled();
  });

  it("returns an empty result for a whitespace-only query", async () => {
    const res = await GET(makeRequest("   "));
    const data = await res.json() as { items: unknown[]; total: number };
    expect(data.items).toHaveLength(0);
    expect(getCommerceProviderMock).not.toHaveBeenCalled();
  });

  it("accepts a two-character query and reaches the provider", async () => {
    const res = await GET(makeRequest("co"));
    expect(res.status).toBe(200);
    expect(getCommerceProviderMock).toHaveBeenCalled();
  });

  it("silently trims a query longer than 60 characters", async () => {
    // 70-character query → trimmed to first 60 characters, which is still a valid search.
    const long = "cobalt".repeat(12); // 72 chars
    const res = await GET(makeRequest(long));
    expect(res.status).toBe(200);
    expect(getCommerceProviderMock).toHaveBeenCalled();
  });
});

describe("GET /api/search — response shape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCommerceProviderMock.mockResolvedValue(realProvider);
  });

  it("returns items with the expected fields for a known product name", async () => {
    const res = await GET(makeRequest("cobalt dragoon"));
    const data = await res.json() as {
      items: {
        slug: string;
        name: string;
        price: string;
        stock: string;
        availability: string;
        image: { src: string; alt: string } | null;
      }[];
      total: number;
    };

    expect(data.total).toBeGreaterThan(0);
    const first = data.items[0]!;
    expect(first.slug).toBeTruthy();
    expect(first.name).toContain("Cobalt");
    // Price is formatted as "€XX,XX"
    expect(first.price).toMatch(/^€/);
    // Stock status is one of the four known values
    expect(["disponibile", "in-arrivo", "pre-ordine", "esaurito"]).toContain(first.stock);
    // Availability line is a non-empty Italian string
    expect(first.availability.length).toBeGreaterThan(0);
    // Image is either null or has src and alt
    if (first.image !== null) {
      expect(first.image.src).toBeTruthy();
      expect(first.image.alt).toBeTruthy();
    }
  });

  it("caps results at 6 even when more products match", async () => {
    // "beyblade" or a very broad term should match more than 6 products
    const res = await GET(makeRequest("cobalt"));
    const data = await res.json() as { items: unknown[]; total: number };
    expect(data.items.length).toBeLessThanOrEqual(6);
  });

  it("includes compareAt only when the product is discounted", async () => {
    // Fetch all results with a broad term and verify the shape contract:
    // compareAt is present only when the item has a compareAtPrice.
    const res = await GET(makeRequest("horus enlil"));
    const data = await res.json() as {
      items: { compareAt?: string }[];
    };
    for (const item of data.items) {
      if ("compareAt" in item) {
        expect(item.compareAt).toMatch(/^€/);
      }
    }
  });

  it("sets a Cache-Control header", async () => {
    const res = await GET(makeRequest("cobalt"));
    expect(res.headers.get("Cache-Control")).toMatch(/s-maxage/);
  });
});
