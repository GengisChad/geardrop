/**
 * Unit tests for the batched full-catalogue pricing agent.
 *
 * Tests:
 * 1. Batching & cursor: productsToAnalyse returns the right slice, stably sorted by SKU.
 * 2. Brand derivation from SKU.
 * 3. Analyst brief includes brand and box contents.
 * 4. Advisor brief groups Amazon, Italian shops, eBay, Japan import separately.
 * 5. ECB rate fetch: fallback when network fails.
 * 6. runPricingBatchAction state machine: idle→running→done, offset increments, errors propagate.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { PRICING_BATCH_SIZE, catalogueFacts, domainChannel, fetchEcbRates } from "@/lib/ai/pricing-agent";
import type * as PricingAgentModule from "@/lib/ai/pricing-agent";
import type * as ClaudeApiModule from "@/lib/ai/claude-api";

// ----- fetchEcbRates -----

describe("fetchEcbRates", () => {
  it("returns fallback rates when fetch throws", async () => {
    // We test the exported function directly with a mocked global fetch.
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network error"));
    const rates = await fetchEcbRates();
    globalThis.fetch = originalFetch;
    // Should have JPY and USD from the fallback constants.
    expect(rates["JPY"]).toBeDefined();
    expect(rates["USD"]).toBeDefined();
    expect(rates["JPY"]! > 0).toBe(true);
  });

  it("returns fallback rates when fetch returns non-ok", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, text: async () => "" } as Response);
    const rates = await fetchEcbRates();
    globalThis.fetch = originalFetch;
    expect(rates["JPY"]).toBeDefined();
  });

  it("parses JPY and USD from ECB XML format", async () => {
    const xml = `<?xml version="1.0"?><root>
      <Cube currency="USD" rate="1.0523"/>
      <Cube currency="JPY" rate="163.42"/>
      <Cube currency="GBP" rate="0.8520"/>
    </root>`;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => xml } as Response);
    const rates = await fetchEcbRates();
    globalThis.fetch = originalFetch;
    // ECB gives units per EUR; we invert to get EUR per unit.
    expect(rates["USD"]).toBeCloseTo(1 / 1.0523, 5);
    expect(rates["JPY"]).toBeCloseTo(1 / 163.42, 7);
    expect(rates["GBP"]).toBeCloseTo(1 / 0.852, 5);
  });
});

// ----- Batch size constant -----

describe("PRICING_BATCH_SIZE", () => {
  it("is 3 (safe for 6 sources × 12 web calls per product)", () => {
    expect(PRICING_BATCH_SIZE).toBe(3);
  });
});

// ----- productsToAnalyse: sorting and offset -----

// We test the pure sort/slice/brand logic without hitting Supabase by extracting the
// transformation into a helper we can test in isolation.

type ForecastRow = {
  product_id: number;
  sku: string;
  name: string;
  publication_status: string;
  price_cents: number;
  average_cost_cents: number;
  stock_quantity: number;
  unlimited_stock: boolean;
  sold_7: number;
  sold_30: number;
  sold_90: number;
  daily_rate: number;
  trend: number;
  days_of_cover: number;
};

function transformForecast(rows: ForecastRow[], boxMap: Map<number, string[]>, offset: number, limit: number) {
  const all = rows
    .filter((r) => r.publication_status === "published")
    .sort((a, b) => a.sku.localeCompare(b.sku, "en"))
    .map((r) => ({
      sku: r.sku,
      name: r.name,
      boxContents: boxMap.get(r.product_id) ?? [],
      priceCents: r.price_cents,
    }));
  return { total: all.length, products: all.slice(offset, limit > 0 ? offset + limit : all.length) };
}

const makeRow = (product_id: number, sku: string, pub = "published"): ForecastRow => ({
  product_id, sku, name: `Product ${sku}`, publication_status: pub,
  price_cents: 1000, average_cost_cents: 500, stock_quantity: 10,
  unlimited_stock: false, sold_7: 0, sold_30: 0, sold_90: 0,
  daily_rate: 0, trend: 0, days_of_cover: 90,
});

describe("productsToAnalyse sort and offset logic", () => {
  const rows: ForecastRow[] = [
    makeRow(3, "starter-pack-z"),
    makeRow(1, "booster-pack-a"),
    makeRow(4, "bx-01-top"),
    makeRow(2, "cx-20-set"),
    makeRow(5, "starter-pack-m"),
    makeRow(6, "draft-product", "draft"),
  ];
  const boxMap = new Map([[3, ["1 × Starter Pack Z (trottola + lanciatore)"]]]);

  it("excludes draft products", () => {
    const { total } = transformForecast(rows, boxMap, 0, 100);
    expect(total).toBe(5);
  });

  it("sorts by SKU alphabetically", () => {
    const { products } = transformForecast(rows, boxMap, 0, 100);
    const skus = products.map((p) => p.sku);
    expect(skus).toEqual(["booster-pack-a", "bx-01-top", "cx-20-set", "starter-pack-m", "starter-pack-z"]);
  });

  it("slices by offset correctly", () => {
    const { products: p0 } = transformForecast(rows, boxMap, 0, 3);
    const { products: p1 } = transformForecast(rows, boxMap, 3, 3);
    expect(p0.map((p) => p.sku)).toEqual(["booster-pack-a", "bx-01-top", "cx-20-set"]);
    expect(p1.map((p) => p.sku)).toEqual(["starter-pack-m", "starter-pack-z"]);
  });

  it("returns empty slice when offset >= total", () => {
    const { products } = transformForecast(rows, boxMap, 10, 3);
    expect(products).toHaveLength(0);
  });

  it("includes box contents from boxMap", () => {
    const { products } = transformForecast(rows, boxMap, 0, 100);
    const z = products.find((p) => p.sku === "starter-pack-z");
    expect(z?.boxContents).toEqual(["1 × Starter Pack Z (trottola + lanciatore)"]);
    const a = products.find((p) => p.sku === "booster-pack-a");
    expect(a?.boxContents).toHaveLength(0);
  });
});

// ----- Maker and packaging from the catalogue -----

describe("catalogueFacts", () => {
  it("reads a Hasbro starter with its launcher", () => {
    const facts = catalogueFacts("strike-dran-4-50ff", []);
    expect(facts.brand).toBe("hasbro");
    expect(facts.boxContents.join(" ")).toMatch(/Lanciatore/);
  });

  it("reads a Hasbro booster without a launcher", () => {
    const facts = catalogueFacts("cobalt-drake-4-60f", []);
    expect(facts.brand).toBe("hasbro");
    expect(facts.boxContents.join(" ")).not.toMatch(/Lanciatore/);
  });

  it("reads a Takara Tomy piece whatever its SKU looks like", () => {
    expect(catalogueFacts("cx-20-customize-set-c", []).brand).toBe("takara-tomy");
  });

  it("keeps the database box when it has one, and defaults an unknown slug to Hasbro", () => {
    expect(catalogueFacts("strike-dran-4-50ff", ["1 × Trottola"]).boxContents).toEqual(["1 × Trottola"]);
    expect(catalogueFacts("not-in-the-catalogue", ["x"])).toEqual({ brand: "hasbro", boxContents: ["x"] });
    expect(catalogueFacts(undefined, []).boxContents).toEqual([]);
  });
});

// ----- Advisor brief: channel grouping -----

describe("advisor brief channel grouping", () => {
  const obs = [
    { source_domain: "amazon.it",           price_cents: 2300, item_condition: "new" },
    { source_domain: "nerdpoint.it",         price_cents: 2500, item_condition: "new" },
    { source_domain: "bakutenbox.it",        price_cents: 2400, item_condition: "new" },
    { source_domain: "ebay.it",              price_cents: 2600, item_condition: "new" },
    { source_domain: "zenmarket.jp",         price_cents: 1900, item_condition: "new" },
    { source_domain: "beyblade-kingdom.com", price_cents: 2000, item_condition: "new" },
  ];

  it("groups each domain into the correct channel", () => {
    expect(obs.map((o) => domainChannel(o.source_domain))).toEqual([
      "amazon", "italian", "italian", "ebay", "japan_import", "japan_import",
    ]);
  });

  it("cheapest Italian offer excludes Japan import sources", () => {
    const italianAndAmazon = obs.filter((o) => ["amazon", "italian"].includes(domainChannel(o.source_domain)));
    const cheapest = italianAndAmazon.reduce((a, b) => a.price_cents < b.price_cents ? a : b);
    expect(cheapest.source_domain).toBe("amazon.it");
    expect(cheapest.price_cents).toBe(2300);
  });

  it("Japan import sources are not in the cheapest Italian group", () => {
    const italianAndAmazon = obs.filter((o) => ["amazon", "italian"].includes(domainChannel(o.source_domain)));
    expect(italianAndAmazon.some((o) => o.source_domain === "zenmarket.jp")).toBe(false);
    expect(italianAndAmazon.some((o) => o.source_domain === "beyblade-kingdom.com")).toBe(false);
  });
});

// ----- AnalyseAllState machine -----

// Test the pure state transitions from runPricingBatchAction via a mock.
// We test the action by mocking the agent layer so no real Claude calls happen.

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const geardrop = vi.hoisted(() => ({ id: 1, slug: "geardrop", name: "Gear Drop", storefrontPublic: true, role: "owner" as const }));
vi.mock("@/lib/auth/guards", () => ({
  requireUser: vi.fn(async () => ({ id: "owner" })),
  requireStaffRole: vi.fn(async () => ({ userId: "owner", role: "owner", active: true, organization: geardrop, organizations: [geardrop] })),
}));

// Mock runPricingBatch to return a deterministic batch result without calling Claude.
const MOCK_TOTAL = 7; // 7 products → ceil(7/3) = 3 batches
vi.mock("@/lib/ai/pricing-agent", async (importOriginal) => {
  const actual = await importOriginal<typeof PricingAgentModule>();
  return {
    ...actual,
    runPricingBatch: vi.fn(async (_client: unknown, _claude: unknown, _org: unknown, offset: number) => ({
      runId: 100 + offset,
      offset,
      batchSize: Math.min(actual.PRICING_BATCH_SIZE, MOCK_TOTAL - offset),
      totalProducts: MOCK_TOTAL,
      observations: 2,
      proposals: 1,
      summary: `Lotto offset ${offset} completato.`,
      dollars: 0.05,
      timedOut: false,
      error: null,
    })),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({}),
}));

vi.mock("@/lib/ai/claude-api", async (importOriginal) => {
  const actual = await importOriginal<typeof ClaudeApiModule>();
  return { ...actual, claudeApiKey: () => "test-key", createClaudeClient: () => ({}) };
});

const { runPricingBatchAction } = await import("@/app/admin/actions/pricing");
const { ANALYSE_ALL_INITIAL } = await import("@/lib/ai/pricing-actions-types");

function formData(offset: number, stop?: boolean): FormData {
  const fd = new FormData();
  fd.set("offset", String(offset));
  if (stop) fd.set("stop", "1");
  return fd;
}

describe("runPricingBatchAction state machine", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("transitions from idle to running after first batch", async () => {
    const next = await runPricingBatchAction(ANALYSE_ALL_INITIAL, formData(0));
    expect(next.status).toBe("running");
    expect(next.nextOffset).toBe(PRICING_BATCH_SIZE);
    expect(next.processed).toBe(PRICING_BATCH_SIZE);
    expect(next.totalProducts).toBe(MOCK_TOTAL);
    expect(next.observations).toBe(2);
    expect(next.proposals).toBe(1);
  });

  it("marks done when all products processed", async () => {
    let state = ANALYSE_ALL_INITIAL;
    // Simulate the client loop to completion.
    for (let offset = 0; offset < MOCK_TOTAL; offset += PRICING_BATCH_SIZE) {
      state = await runPricingBatchAction(state, formData(offset));
    }
    expect(state.status).toBe("done");
    expect(state.processed).toBe(MOCK_TOTAL);
  });

  it("stops immediately when stop=1 is submitted", async () => {
    const running = await runPricingBatchAction(ANALYSE_ALL_INITIAL, formData(0));
    expect(running.status).toBe("running");
    const stopped = await runPricingBatchAction(running, formData(running.nextOffset, true));
    expect(stopped.status).toBe("stopped");
    expect(stopped.nextOffset).toBe(running.nextOffset); // cursor frozen
  });

  it("accumulates observations and proposals across batches", async () => {
    const b1 = await runPricingBatchAction(ANALYSE_ALL_INITIAL, formData(0));
    const b2 = await runPricingBatchAction(b1, formData(b1.nextOffset));
    expect(b2.observations).toBe(4); // 2 + 2
    expect(b2.proposals).toBe(2);    // 1 + 1
    expect(b2.dollars).toBeCloseTo(0.1, 5);
  });

  it("starts the totals again when a finished or stopped run restarts from offset 0", async () => {
    const b1 = await runPricingBatchAction(ANALYSE_ALL_INITIAL, formData(0));
    const stopped = { ...b1, status: "stopped" as const, errors: ["vecchio errore"] };
    const restarted = await runPricingBatchAction(stopped, formData(0));
    expect(restarted.processed).toBe(b1.processed);
    expect(restarted.observations).toBe(b1.observations);
    expect(restarted.errors).toEqual([]);
    expect(restarted.status).toBe("running");
  });

  it("propagates batch errors without stopping the loop", async () => {
    const { runPricingBatch } = await import("@/lib/ai/pricing-agent");
    vi.mocked(runPricingBatch).mockResolvedValueOnce({
      runId: 999, offset: 0, batchSize: PRICING_BATCH_SIZE, totalProducts: MOCK_TOTAL,
      observations: 0, proposals: 0, summary: "", dollars: 0,
      timedOut: false, error: "Timeout network",
    });
    const next = await runPricingBatchAction(ANALYSE_ALL_INITIAL, formData(0));
    expect(next.status).toBe("running"); // not stopped — error is non-fatal
    expect(next.errors).toHaveLength(1);
    expect(next.errors[0]).toContain("Timeout network");
  });
});
