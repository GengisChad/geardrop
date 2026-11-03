import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OrderCard } from "@/components/account/order-card";
import { ORDER_STATUS_LABEL, ORDER_STEPS, liveTrackingCodes, orderStepIndex, parcelJourney } from "@/lib/orders/customer-order-status";
import type { CustomerOrder } from "@/lib/orders/customer-orders";

const LOCKER_EVENTS = [
  { code: "MMD.1004", at: "2026-11-02T08:10:00Z", place: null },
  { code: "LMD.1005", at: "2026-11-03T11:42:00Z", place: "ITLRM05261P, Roma" },
  { code: "FMD.1002", at: "2026-11-01T17:05:00Z", place: "Roma" },
];

function order(overrides: Partial<CustomerOrder> = {}): CustomerOrder {
  return {
    orderNumber: "GD-TEST-1",
    status: "shipped",
    createdAt: "2026-10-31T19:00:00Z",
    totalCents: 2290,
    shippedAt: "2026-11-01T16:00:00Z",
    deliveredAt: null,
    trackingCarrier: "InPost",
    trackingCode: "520000012345678901234567",
    trackingUrl: null,
    items: [{ name: "Porta Deck Bicolore Viola e menta", quantity: 1, preorderQuantity: 0 }],
    parcelEvents: LOCKER_EVENTS,
    ...overrides,
  };
}

describe("an order as its buyer reads it", () => {
  it("walks confirmed, in lavorazione, shipped and delivered; a cancelled or pending order walks none", () => {
    expect(ORDER_STEPS.map((step) => ORDER_STATUS_LABEL[step])).toEqual(["Confermato", "In lavorazione", "Spedito", "Consegnato"]);
    expect(["pending", "confirmed", "processing", "shipped", "completed", "cancelled"].map(orderStepIndex)).toEqual([-1, 0, 1, 2, 3, -1]);
  });

  it("tells the parcel's journey newest first, and flags the moment it waits to be collected", () => {
    const journey = parcelJourney(LOCKER_EVENTS);
    expect(journey.map((update) => update.code)).toEqual(["LMD.1005", "MMD.1004", "FMD.1002"]);
    expect(journey[0]).toMatchObject({ label: "Pronta per il ritiro nel Locker", place: "ITLRM05261P, Roma", readyForPickup: true });
    expect(journey.slice(1).every((update) => !update.readyForPickup)).toBe(true);
  });

  it("asks InPost only about its parcels still travelling", () => {
    expect(
      liveTrackingCodes([
        { status: "shipped", trackingCarrier: "InPost", trackingCode: " 520000000000000000000002 " },
        { status: "shipped", trackingCarrier: "InPost", trackingCode: "520000000000000000000001" },
        { status: "shipped", trackingCarrier: "InPost", trackingCode: "520000000000000000000001" },
        // Delivered already, another courier, or no code yet: nothing to ask.
        { status: "completed", trackingCarrier: "InPost", trackingCode: "520000000000000000000003" },
        { status: "shipped", trackingCarrier: "Poste Italiane", trackingCode: "018207900244" },
        { status: "shipped", trackingCarrier: "InPost", trackingCode: null },
      ]),
    ).toEqual(["520000000000000000000001", "520000000000000000000002"]);
  });
});

describe("the account page's order card", () => {
  it("shows where an InPost parcel is, the Locker it waits in, and every step behind a tap", () => {
    const html = renderToStaticMarkup(<OrderCard order={order()} />);
    expect(html).toContain("GD-TEST-1");
    expect(html).toContain("Pronta per il ritiro nel Locker");
    expect(html).toContain("ITLRM05261P, Roma");
    expect(html).toContain("text-lime");
    expect(html).toContain("Tutti i passaggi (3)");
    expect(html).toContain('href="https://inpost.it/trova-il-tuo-pacco?number=520000012345678901234567"');
    expect(html).toContain('aria-current="step"');
    expect(html).toContain("1 × Porta Deck Bicolore Viola e menta");
  });

  it("says InPost has nothing yet rather than staying blank, and links the courier's page", () => {
    const html = renderToStaticMarkup(<OrderCard order={order({ parcelEvents: [] })} />);
    expect(html).toContain("InPost non ha ancora registrato movimenti");
    expect(html).toContain("Segui il pacco");
  });

  it("gives a Poste parcel its code and poste.it, with no InPost journey", () => {
    const html = renderToStaticMarkup(
      <OrderCard order={order({ trackingCarrier: "Poste Italiane", trackingCode: "018207900244", parcelEvents: null })} />,
    );
    expect(html).toContain("poste.it/cerca/index.html#/risultati-spedizioni/018207900244");
    expect(html).not.toContain("Tutti i passaggi");
    expect(html).not.toContain("InPost non ha ancora");
  });

  it("tells a buyer whose order is not shipped yet what to expect", () => {
    const html = renderToStaticMarkup(
      <OrderCard order={order({ status: "confirmed", shippedAt: null, trackingCarrier: null, trackingCode: null, parcelEvents: null })} />,
    );
    expect(html).toContain("Quando lo spediamo trovi qui corriere e codice");
    expect(html).not.toContain('data-testid="order-parcel"');
  });

  it("marks a cancelled order without a progress bar", () => {
    const html = renderToStaticMarkup(
      <OrderCard order={order({ status: "cancelled", trackingCarrier: null, trackingCode: null, parcelEvents: null })} />,
    );
    expect(html).toContain("Annullato");
    expect(html).not.toContain('aria-label="Stato dell&#x27;ordine"');
    expect(html).not.toContain("Quando lo spediamo");
  });

  it("shows a parcel InPost says is collected as delivered, before the order itself closes", () => {
    const html = renderToStaticMarkup(
      <OrderCard order={order({ parcelEvents: [...LOCKER_EVENTS, { code: "EOL.1001", at: "2026-11-03T17:20:00Z", place: null }] })} />,
    );
    expect(html).toContain("Consegnata");
    expect(html).toContain("03 nov");
    // All four steps are lit: the bar is lime four times, and none is left grey.
    expect(html.match(/h-1\.5 rounded-full bg-lime/g)).toHaveLength(4);
    expect(html).not.toContain("h-1.5 rounded-full bg-white/10");
  });

  it("dates the delivery in Italian time", () => {
    const html = renderToStaticMarkup(
      <OrderCard order={order({ status: "completed", deliveredAt: "2026-11-03T23:30:00Z", parcelEvents: null })} />,
    );
    // 23:30 UTC is already the 4th in Rome.
    expect(html).toContain("04 nov");
  });
});
