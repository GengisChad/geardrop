import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  track: vi.fn(),
  rpc: vi.fn(),
  configured: { value: true },
}));

// The cache is Next's own and needs its runtime; what matters here is what goes through it.
vi.mock("next/cache", () => ({ unstable_cache: (loader: () => unknown) => loader }));
vi.mock("@/lib/shipping/inpost", () => ({
  inpostConfig: () => (mocks.configured.value ? { clientId: "test" } : null),
  createInpostClient: () => ({ track: mocks.track }),
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ rpc: mocks.rpc }) }));

const { lookupOrderAction } = await import("@/app/(storefront)/ordine/actions");
const { withParcelEvents } = await import("@/lib/orders/customer-orders");

const EVENTS = [{ code: "MMD.1004", at: "2026-11-02T08:10:00Z", place: null }];
const inpost = (trackingCode: string | null, status = "shipped") => ({ status, trackingCarrier: "InPost", trackingCode });

beforeEach(() => {
  mocks.track.mockReset();
  mocks.rpc.mockReset();
  mocks.configured.value = true;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the parcel journey attached to orders", () => {
  it("gives a travelling parcel InPost's events, an unknown one an empty journey, and the rest nothing", async () => {
    mocks.track.mockResolvedValue([{ trackingNumber: "KNOWN", events: EVENTS }]);
    const orders = await withParcelEvents([
      inpost(" KNOWN "),
      inpost("UNKNOWN"),
      inpost("DELIVERED", "completed"),
      { status: "shipped", trackingCarrier: "Poste Italiane", trackingCode: "018207900244" },
      inpost(null, "confirmed"),
    ]);
    expect(orders.map((order) => order.parcelEvents)).toEqual([EVENTS, [], null, null, null]);
    expect(mocks.track).toHaveBeenCalledExactlyOnceWith(["KNOWN", "UNKNOWN"]);
  });

  it("asks InPost ten tracking numbers at a time, its limit", async () => {
    mocks.track.mockResolvedValue([]);
    const codes = Array.from({ length: 12 }, (_, index) => `CODE-${String(index).padStart(2, "0")}`);
    await withParcelEvents(codes.map((code) => inpost(code)));
    expect(mocks.track.mock.calls.map(([batch]) => batch.length)).toEqual([10, 2]);
  });

  it("keeps the orders, with no journey, when InPost is down", async () => {
    mocks.track.mockRejectedValue(new Error("InPost GET /tracking/v1/parcels → 503"));
    const orders = await withParcelEvents([inpost("KNOWN")]);
    expect(orders).toHaveLength(1);
    expect(orders[0]?.parcelEvents).toBeNull();
  });

  it("asks nothing when InPost is not configured, or when no parcel is travelling", async () => {
    mocks.configured.value = false;
    expect((await withParcelEvents([inpost("KNOWN")]))[0]?.parcelEvents).toBeNull();
    mocks.configured.value = true;
    await withParcelEvents([inpost("DELIVERED", "completed")]);
    expect(mocks.track).not.toHaveBeenCalled();
  });
});

describe("the public lookup", () => {
  const row = {
    order_number: "GD-TEST-1",
    status: "shipped",
    created_at: "2026-10-31T19:00:00Z",
    shipped_at: "2026-11-01T16:00:00Z",
    tracking_carrier: "InPost",
    tracking_code: "KNOWN",
    tracking_url: null,
    items: [{ product_name_snapshot: "Porta Deck Giallo", quantity: 1, preorder_quantity: 0 }],
  };
  const form = () => {
    const data = new FormData();
    data.set("orderNumber", "GD-TEST-1");
    data.set("email", "buyer@example.com");
    return data;
  };

  it("answers with the parcel's journey to whoever holds the order number and its email", async () => {
    mocks.rpc.mockResolvedValue({ data: [row], error: null });
    mocks.track.mockResolvedValue([{ trackingNumber: "KNOWN", events: EVENTS }]);
    const result = await lookupOrderAction(null, form());
    expect(result).toMatchObject({ ok: true, order: { order_number: "GD-TEST-1", parcel_events: EVENTS } });
    expect(mocks.rpc).toHaveBeenCalledWith("lookup_order_status", { p_order_number: "GD-TEST-1", p_email: "buyer@example.com" });
  });

  it("asks InPost nothing when the order number and the email do not match", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    const result = await lookupOrderAction(null, form());
    expect(result.ok).toBe(false);
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it("still finds the order when InPost is down", async () => {
    mocks.rpc.mockResolvedValue({ data: [row], error: null });
    mocks.track.mockRejectedValue(new Error("InPost GET /tracking/v1/parcels → 503"));
    const result = await lookupOrderAction(null, form());
    expect(result).toMatchObject({ ok: true, order: { tracking_code: "KNOWN", parcel_events: null } });
  });
});
