import { describe, expect, it } from "vitest";
import { customersFrom, fulfilmentKpis, orderAnomalies, type ControlOrder } from "@/lib/admin/control";

const NOW = new Date("2026-11-18T12:00:00Z");

const order = (overrides: Partial<ControlOrder> = {}): ControlOrder => ({
  id: 1,
  orderNumber: "GD-1",
  email: "mario@example.it",
  name: "Mario Rossi",
  status: "completed",
  paymentStatus: "paid",
  totalCents: 3000,
  refundedCents: 0,
  createdAt: "2026-11-10T10:00:00Z",
  shippedAt: "2026-11-11T10:00:00Z",
  deliveredAt: "2026-11-13T10:00:00Z",
  ownerNotifiedAt: "2026-11-10T10:01:00Z",
  shippingNotifiedAt: "2026-11-11T10:01:00Z",
  deliveryNotifiedAt: "2026-11-13T10:01:00Z",
  refundPreparedAt: null,
  refundAmountCents: null,
  trackingCode: "600",
  trackingCarrier: "InPost",
  ...overrides,
});

describe("fulfilmentKpis", () => {
  it("measures order to shipment and shipment to delivery over the window", () => {
    const kpis = fulfilmentKpis(
      [
        order(),
        order({ id: 2, createdAt: "2026-11-12T10:00:00Z", shippedAt: "2026-11-15T10:00:00Z", deliveredAt: null, status: "shipped" }),
        order({ id: 3, createdAt: "2026-11-17T12:00:00Z", shippedAt: null, deliveredAt: null, status: "confirmed" }),
        order({ id: 4, createdAt: "2026-09-01T10:00:00Z" }),
        order({ id: 5, paymentStatus: "pending", status: "pending" }),
      ],
      NOW,
    );
    expect(kpis.paidOrders).toBe(3);
    expect(kpis.shippedOrders).toBe(2);
    expect(kpis.medianHoursToShip).toBe(48); // 24 h and 72 h
    expect(kpis.shippedWithin48h).toBe(0.5);
    expect(kpis.medianDaysToDeliver).toBe(2);
    expect(kpis.waiting).toBe(1);
    expect(kpis.oldestWaitingHours).toBe(24);
  });

  it("has nothing to say without orders", () => {
    expect(fulfilmentKpis([], NOW)).toMatchObject({ paidOrders: 0, medianHoursToShip: null, shippedWithin48h: null, oldestWaitingHours: null });
  });
});

describe("orderAnomalies", () => {
  it("finds missed emails, stuck orders, long journeys, half refunds and uncaptured payments", () => {
    const anomalies = orderAnomalies(
      [
        order(),
        order({ id: 2, orderNumber: "GD-2", status: "confirmed", shippedAt: null, deliveredAt: null, ownerNotifiedAt: null, createdAt: "2026-11-14T10:00:00Z" }),
        order({ id: 3, orderNumber: "GD-3", status: "shipped", deliveredAt: null, shippingNotifiedAt: null, shippedAt: "2026-11-01T10:00:00Z", createdAt: "2026-10-31T10:00:00Z" }),
        order({ id: 4, orderNumber: "GD-4", refundPreparedAt: "2026-11-15T10:00:00Z", refundAmountCents: 1000, refundedCents: 0 }),
        order({ id: 5, orderNumber: "GD-5", paymentStatus: "authorized", status: "pending", createdAt: "2026-11-16T10:00:00Z" }),
      ],
      NOW,
    );
    expect(anomalies.map((anomaly) => [anomaly.orderNumber, anomaly.kind])).toEqual([
      ["GD-2", "owner-email"],
      ["GD-2", "stuck"],
      ["GD-3", "shipping-email"],
      ["GD-4", "refund"],
      ["GD-5", "payment"],
      ["GD-3", "in-transit"],
    ]);
  });

  it("flags a long journey only for InPost, which closes itself on collection", () => {
    const poste = order({ status: "shipped", deliveredAt: null, trackingCarrier: "Poste Italiane", shippedAt: "2026-10-01T10:00:00Z", createdAt: "2026-09-30T10:00:00Z" });
    expect(orderAnomalies([poste], NOW)).toEqual([]);
    expect(orderAnomalies([{ ...poste, trackingCarrier: "InPost" }], NOW).map((anomaly) => anomaly.kind)).toEqual(["in-transit"]);
  });

  it("does not flag the emails of old orders that predate the sent stamps", () => {
    const old = order({ createdAt: "2026-09-02T10:00:00Z", shippedAt: "2026-09-03T10:00:00Z", deliveredAt: "2026-09-05T10:00:00Z", ownerNotifiedAt: null, shippingNotifiedAt: null, deliveryNotifiedAt: null });
    expect(orderAnomalies([old], NOW)).toEqual([]);
  });
});

describe("customersFrom", () => {
  it("joins orders by email in any case, nets refunds and keeps the latest name", () => {
    const customers = customersFrom([
      order({ id: 1, email: "Mario@Example.it", name: "Mario", createdAt: "2026-10-01T10:00:00Z", totalCents: 2000 }),
      order({ id: 2, email: "mario@example.it", name: "Mario Rossi", createdAt: "2026-11-01T10:00:00Z", totalCents: 5000, refundedCents: 1000 }),
      order({ id: 3, email: "luca@example.it", name: "Luca", totalCents: 1500 }),
      order({ id: 4, email: "nopay@example.it", paymentStatus: "failed" }),
    ]);
    expect(customers).toEqual([
      { email: "mario@example.it", name: "Mario Rossi", orders: 2, spentCents: 6000, firstOrderAt: "2026-10-01T10:00:00Z", lastOrderAt: "2026-11-01T10:00:00Z", lastOrderId: 2 },
      { email: "luca@example.it", name: "Luca", orders: 1, spentCents: 1500, firstOrderAt: "2026-11-10T10:00:00Z", lastOrderAt: "2026-11-10T10:00:00Z", lastOrderId: 3 },
    ]);
  });
});
