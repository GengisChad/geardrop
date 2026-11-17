import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createInpostClient,
  deduplicationId,
  InpostError,
  inpostConfig,
  inpostPhone,
  INPOST_SENDER,
  lockerCode,
  lockerLabel,
  lockerSearchPath,
  lockerShipmentBody,
  toLocker,
  townName,
  type InpostConfig,
} from "@/lib/shipping/inpost";
import { eventLabel, parcelOutcome } from "@/lib/shipping/inpost-tracking";
import { inpostSignatureValid, parseInpostWebhook } from "@/lib/shipping/inpost-webhook";
import { outcomesFor } from "@/lib/orders/inpost-delivery";
import { recipientName } from "@/lib/admin/orders";

const config: InpostConfig = { clientId: "app-test", clientSecret: "secret", organizationId: "org-1", host: "https://api.test" };

/** A fetch that answers the token call and then each listed response, recording what was asked. */
function fakeFetch(responses: readonly Response[]) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  let index = 0;
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith("/oauth2/token")) return Response.json({ access_token: `token-${calls.length}`, expires_in: 599 });
    const response = responses[index];
    index += 1;
    if (!response) throw new Error(`unexpected call ${url}`);
    return response;
  }) as typeof fetch;
  return { impl, calls };
}

describe("inpostConfig", () => {
  it("is null until both the client id and the secret are set", () => {
    expect(inpostConfig({})).toBeNull();
    expect(inpostConfig({ INPOST_CLIENT_ID: "id" })).toBeNull();
    expect(inpostConfig({ INPOST_CLIENT_ID: " id ", INPOST_CLIENT_SECRET: " s " })).toEqual({
      clientId: "id",
      clientSecret: "s",
      organizationId: null,
      host: "https://api.inpost-group.com",
    });
  });

  it("points at InPost's sandbox only when asked", () => {
    expect(inpostConfig({ INPOST_CLIENT_ID: "id", INPOST_CLIENT_SECRET: "s", INPOST_ENV: "stage" })?.host).toBe("https://stage-api.inpost-group.com");
  });
});

describe("lockerShipmentBody", () => {
  const body = lockerShipmentBody({
    orderNumber: "GD-ABC123",
    recipient: { firstName: " Mario ", lastName: "Rossi", email: "mario@example.it", phone: "333 123.45-67" },
    lockerId: "IT_ITROM44128M",
    size: "B",
    weightKg: 1.5,
    senderEmail: "infogeardrop@gmail.com",
    senderPhone: "0039 06 1234567",
  });

  it("sends from Gear Drop Shop, never the account holder's name (owner, 2026-10-23)", () => {
    expect(body.sender).toEqual({ ...INPOST_SENDER, email: "infogeardrop@gmail.com", phone: "+39061234567" });
    expect(INPOST_SENDER.companyName).toBe("Gear Drop Shop");
  });

  it("goes from any InPost point to the buyer's Locker, by its bare code", () => {
    expect(body.origin).toEqual({ countryCode: "IT", shippingMethod: "ANY_POINT" });
    expect(body.destination).toEqual({ countryCode: "IT", pointId: "ITROM44128M" });
  });

  it("declares the compartment's size and the weight, and files the order number", () => {
    expect(body.parcels).toEqual([
      { type: "STANDARD", dimensions: { length: 64, width: 38, height: 19, unit: "CM" }, weight: { amount: 1.5, unit: "KG" } },
    ]);
    expect(body.references).toEqual({ custom: { orderNumber: "GD-ABC123" } });
    expect(body.recipient).toEqual({ firstName: "Mario", lastName: "Rossi", email: "mario@example.it", phone: "3331234567" });
  });
});

describe("small helpers", () => {
  it("writes phones the way InPost parses them", () => {
    expect(inpostPhone("+39 333 123 4567")).toBe("+393331234567");
    expect(inpostPhone("0039 333 1234567")).toBe("+393331234567");
    expect(inpostPhone("(333) 123-4567")).toBe("3331234567");
  });

  it("strips the country from a Locker id", () => {
    expect(lockerCode("IT_ITFIA131314D")).toBe("ITFIA131314D");
    expect(lockerCode("ITFIA131314D")).toBe("ITFIA131314D");
  });

  it("capitalises a town the way InPost files it", () => {
    expect(townName("  fiano romano ")).toBe("Fiano Romano");
    expect(townName("REGGIO NELL'EMILIA")).toBe("Reggio Nell'Emilia");
  });

  it("splits the buyer's name for InPost", () => {
    expect(recipientName("Mario De Rossi")).toEqual({ firstName: "Mario", lastName: "De Rossi" });
    expect(recipientName("Cher")).toEqual({ firstName: "Cher", lastName: "Cher" });
    expect(recipientName("  ")).toBeNull();
  });
});

describe("Locker search", () => {
  it("searches by CAP and by position around the buyer, by town with InPost's spelling", () => {
    expect(lockerSearchPath({ postalCode: "00185" })).toBe(
      "/location/v1/points/search-by-location?address.country=IT&type=APM&capabilities=PARCEL_COLLECT&relativePostCode=00185&maxDistance=15000&limit=10",
    );
    expect(lockerSearchPath({ latitude: 45.46421, longitude: 9.19 })).toContain("relativePoint=45.46421%2C9.19000");
    expect(lockerSearchPath({ city: "roma" })).toBe("/location/v1/points?address.country=IT&type=APM&capabilities=PARCEL_COLLECT&address.city=Roma&perPage=10");
  });

  it("reads a Location API point into a Locker and one printable line", () => {
    const locker = toLocker({
      id: "IT_ITROM110760D",
      address: { street: "Viale dello Scalo di San Lorenzo", buildingNumber: "29/0", postalCode: "00185", city: "Roma", administrativeArea: "RM" },
      description: { content: "ACI Automobile Club Roma" },
      distance: 714,
      location247: false,
    });
    expect(locker).toEqual({
      id: "IT_ITROM110760D",
      code: "ITROM110760D",
      street: "Viale dello Scalo di San Lorenzo 29",
      postalCode: "00185",
      city: "Roma",
      province: "RM",
      place: "ACI Automobile Club Roma",
      distance: 714,
      openAllDay: false,
    });
    expect(lockerLabel(locker!)).toBe("ITROM110760D · Viale dello Scalo di San Lorenzo 29, 00185 Roma (ACI Automobile Club Roma)");
    expect(toLocker({})).toBeNull();
  });

  it("asks InPost with a client-credentials token and keeps it for the next call", async () => {
    const { impl, calls } = fakeFetch([
      Response.json({ items: [{ id: "IT_ITFIA131314D", address: { street: "Via Milano", buildingNumber: "19", postalCode: "00065", city: "Fiano Romano" } }] }),
      Response.json({ items: [] }),
    ]);
    const client = createInpostClient({ ...config, clientId: "app-cache" }, impl);
    expect((await client.searchLockers({ postalCode: "00065" })).map((locker) => locker.code)).toEqual(["ITFIA131314D"]);
    await client.searchLockers({ city: "Roma" });
    expect(calls.filter((call) => call.url.endsWith("/oauth2/token"))).toHaveLength(1);
    const tokenBody = String(calls[0]!.init?.body);
    expect(tokenBody).toContain("grant_type=client_credentials");
    expect(tokenBody).toContain("scope=api%3Apoints%3Aread");
    expect((calls[1]!.init?.headers as Record<string, string>)["Authorization"]).toBe("Bearer token-1");
  });
});

describe("shipments", () => {
  it("creates the shipment on the organization and returns its tracking number", async () => {
    const { impl, calls } = fakeFetch([Response.json({ trackingNumber: "600000658493991742009752" }, { status: 201 })]);
    const client = createInpostClient({ ...config, clientId: "app-create" }, impl);
    const tracking = await client.createLockerShipment({
      orderNumber: "GD-1",
      recipient: { firstName: "A", lastName: "B", email: "a@b.it", phone: "3331234567" },
      lockerId: "IT_ITROM44128M",
      size: "A",
      weightKg: 1,
      senderEmail: "infogeardrop@gmail.com",
      senderPhone: "+390612345678",
    });
    expect(tracking).toBe("600000658493991742009752");
    expect(calls[1]!.url).toBe("https://api.test/shipping/v2/organizations/org-1/shipments");
    expect(calls[1]!.init?.method).toBe("POST");
  });

  it("names the fields InPost refused", async () => {
    const { impl } = fakeFetch([
      Response.json({ type: "ValidationFailed", status: 400, detail: "Check errors object for more info.", errors: { "recipient.email": ["invalid"] } }, { status: 400 }),
    ]);
    const client = createInpostClient({ ...config, clientId: "app-refused" }, impl);
    const attempt = client.createLockerShipment({
      orderNumber: "GD-1",
      recipient: { firstName: "A", lastName: "B", email: "nope", phone: "3331234567" },
      lockerId: "IT_ITROM44128M",
      size: "A",
      weightKg: 1,
      senderEmail: "infogeardrop@gmail.com",
      senderPhone: "+390612345678",
    });
    await expect(attempt).rejects.toBeInstanceOf(InpostError);
    await expect(attempt).rejects.toMatchObject({ status: 400, fieldErrors: { "recipient.email": ["invalid"] } });
  });

  it("refuses to make a shipment without the organization id", async () => {
    const { impl } = fakeFetch([]);
    const client = createInpostClient({ ...config, clientId: "app-noorg", organizationId: null }, impl);
    await expect(client.label("600")).rejects.toThrow("INPOST_ORGANIZATION_ID");
  });

  it("asks for the A6 label and decodes the base64 PDF InPost answers with (LabelResponse)", async () => {
    const { impl, calls } = fakeFetch([Response.json({ label: { content: Buffer.from("%PDF-1.4").toString("base64") } })]);
    const client = createInpostClient({ ...config, clientId: "app-label" }, impl);
    const pdf = await client.label("600000658493991742009752");
    expect(Buffer.from(pdf).toString()).toBe("%PDF-1.4");
    expect((calls[1]!.init?.headers as Record<string, string>)["Accept"]).toBe("application/pdf+json;format=A6");
  });

  it("passes a raw PDF through, and refuses a label with no content", async () => {
    const raw = fakeFetch([new Response(new Uint8Array([37, 80, 68, 70]), { headers: { "Content-Type": "application/pdf" } })]);
    expect(new Uint8Array(await createInpostClient({ ...config, clientId: "app-raw" }, raw.impl).label("600"))).toEqual(new Uint8Array([37, 80, 68, 70]));
    const empty = fakeFetch([Response.json({ label: {} })]);
    await expect(createInpostClient({ ...config, clientId: "app-empty" }, empty.impl).label("600")).rejects.toBeInstanceOf(InpostError);
  });

  it("sends a deduplication id drawn from the request, so a retry is one shipment and a correction a new one", async () => {
    const shipment = {
      orderNumber: "GD-1",
      recipient: { firstName: "A", lastName: "B", email: "a@b.it", phone: "3331234567" },
      lockerId: "IT_ITROM44128M",
      size: "A" as const,
      weightKg: 1,
      senderEmail: "infogeardrop@gmail.com",
      senderPhone: "+390612345678",
    };
    const { impl, calls } = fakeFetch([Response.json({ trackingNumber: "1" }), Response.json({ trackingNumber: "1" }), Response.json({ trackingNumber: "2" })]);
    const client = createInpostClient({ ...config, clientId: "app-dedup" }, impl);
    await client.createLockerShipment(shipment);
    await client.createLockerShipment(shipment);
    await client.createLockerShipment({ ...shipment, size: "B" });
    const ids = calls.filter((call) => call.url.endsWith("/shipments")).map((call) => (call.init?.headers as Record<string, string>)["X-Deduplication-Id"]);
    expect(ids[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(ids[1]).toBe(ids[0]);
    expect(ids[2]).not.toBe(ids[0]);
    expect(deduplicationId({ a: 1 })).toBe(deduplicationId({ a: 1 }));
  });
});

describe("tracking", () => {
  it("reads events oldest first, ten parcels per call at most", async () => {
    const { impl, calls } = fakeFetch([
      Response.json({
        parcels: [
          {
            trackingNumber: "600",
            events: [
              { eventCode: "EOL.1002", eventTimestamp: "2026-10-25T10:00:00Z", location: { name: "ITROM44128M", city: "Roma" } },
              { eventCode: "CRE.1001", eventTimestamp: "2026-10-23T10:00:00Z", location: null },
            ],
          },
        ],
      }),
    ]);
    const client = createInpostClient({ ...config, clientId: "app-track" }, impl);
    const numbers = Array.from({ length: 12 }, (_, index) => `n${index}`);
    const [parcel] = await client.track(["600", ...numbers]);
    expect(parcel?.events.map((event) => event.code)).toEqual(["CRE.1001", "EOL.1002"]);
    expect(parcel?.events[1]?.place).toBe("ITROM44128M, Roma");
    expect(new URL(calls[1]!.url).searchParams.getAll("trackingNumbers")).toHaveLength(10);
  });

  it("calls a parcel delivered once collected from the Locker, and only by its latest ending", () => {
    expect(parcelOutcome([
      { code: "CRE.1001", at: "2026-10-23T08:00:00Z", place: null },
      { code: "LMD.1005", at: "2026-10-24T08:00:00Z", place: null },
      { code: "EOL.1002", at: "2026-10-25T08:00:00Z", place: null },
    ])).toEqual({ kind: "delivered", code: "EOL.1002", at: "2026-10-25T08:00:00Z" });
    expect(parcelOutcome([{ code: "LMD.1005", at: "2026-10-24T08:00:00Z", place: null }])).toEqual({ kind: "moving" });
    expect(parcelOutcome([
      { code: "EOL.9004", at: "2026-10-20T08:00:00Z", place: null },
      { code: "FMD.1002", at: "2026-10-21T08:00:00Z", place: null },
    ])).toEqual({ kind: "moving" });
    expect(parcelOutcome([
      { code: "LMD.9002", at: "2026-10-30T08:00:00Z", place: null },
      { code: "LMD.9014", at: "2026-10-31T08:00:00Z", place: null },
    ])).toEqual({ kind: "failed", code: "LMD.9014", at: "2026-10-31T08:00:00Z" });
  });

  it("labels events in Italian, with the code when it has no name", () => {
    expect(eventLabel("LMD.1005")).toBe("Pronta per il ritiro nel Locker");
    expect(eventLabel("XYZ.1")).toBe("Aggiornamento InPost (XYZ.1)");
  });

  it("pairs shipped orders with what InPost reports, skipping parcels it does not know", () => {
    const orders = [
      { id: 1, orderNumber: "GD-1", trackingCode: "600" },
      { id: 2, orderNumber: "GD-2", trackingCode: "601" },
    ];
    const result = outcomesFor(orders, [{ trackingNumber: "600", events: [{ code: "EOL.1002", at: "2026-10-25T08:00:00Z", place: null }] }]);
    expect(result).toEqual([{ order: orders[0], outcome: { kind: "delivered", code: "EOL.1002", at: "2026-10-25T08:00:00Z" }, lastCode: "EOL.1002" }]);
  });
});

describe("webhook", () => {
  const secret = "fdXbfU27DBNG6LuoHu@ThKl3";
  const body = JSON.stringify({ trackingNumber: "600", eventId: "e1", eventCode: "EOL.1002", timestamp: "2026-10-25T08:00:00Z" });
  const sign = (content: string) => createHmac("sha256", secret).update(content, "utf8").digest("base64");

  it("accepts InPost's signature over the body or over timestamp.body", () => {
    expect(inpostSignatureValid(body, sign(body), null, secret)).toBe(true);
    expect(inpostSignatureValid(body, sign(`2026-10-25T08:00:01Z.${body}`), "2026-10-25T08:00:01Z", secret)).toBe(true);
  });

  it("refuses a missing, forged or re-serialised signature", () => {
    expect(inpostSignatureValid(body, null, null, secret)).toBe(false);
    expect(inpostSignatureValid(body, sign(body).slice(1), null, secret)).toBe(false);
    expect(inpostSignatureValid(body, createHmac("sha256", "other").update(body).digest("base64"), null, secret)).toBe(false);
    expect(inpostSignatureValid(` ${body}`, sign(body), null, secret)).toBe(false);
  });

  it("reads the event fields and ignores anything else", () => {
    expect(parseInpostWebhook(body)).toEqual({ trackingNumber: "600", eventCode: "EOL.1002", timestamp: "2026-10-25T08:00:00Z" });
    expect(parseInpostWebhook("{}")).toBeNull();
    expect(parseInpostWebhook("not json")).toBeNull();
  });
});
