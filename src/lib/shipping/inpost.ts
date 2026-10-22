/**
 * InPost Global API client: the shop's merchant account at merchant.inpost-group.com (owner,
 * 2026-10-23). OAuth 2.1 client credentials; one token serves the Location, Shipping and Tracking
 * APIs. Docs: https://developers.inpost-group.com (OpenAPI under /openapi/*.json).
 *
 * Dependency-free and without `server-only`, so scripts can import it too. It holds the client
 * secret, so it must only ever run on the server.
 */

type Env = Readonly<Record<string, string | undefined>>;

const HOSTS = {
  production: "https://api.inpost-group.com",
  stage: "https://stage-api.inpost-group.com",
} as const;

/** What the account can do: find Lockers, make and read shipments, follow parcels. */
const SCOPES = "api:points:read api:shipments:read api:shipments:write api:tracking:read";

export type InpostConfig = {
  readonly clientId: string;
  readonly clientSecret: string;
  /** Needed to make or read shipments; the Locker search and tracking work without it. */
  readonly organizationId: string | null;
  readonly host: string;
};

/** Null until the client id and secret are both set. */
export function inpostConfig(env: Env = process.env): InpostConfig | null {
  const clientId = env["INPOST_CLIENT_ID"]?.trim();
  const clientSecret = env["INPOST_CLIENT_SECRET"]?.trim();
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    organizationId: env["INPOST_ORGANIZATION_ID"]?.trim() || null,
    host: env["INPOST_ENV"]?.trim() === "stage" ? HOSTS.stage : HOSTS.production,
  };
}

/** A refusal from InPost, with the field errors it named (`{"recipient.email": ["invalid"]}`). */
export class InpostError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fieldErrors: Readonly<Record<string, readonly string[]>> = {},
  ) {
    super(message);
    this.name = "InpostError";
  }
}

/** A Locker as the buyer and the admin see it. */
export type Locker = {
  /** InPost's id, "IT_ITROM44128M". */
  readonly id: string;
  /** The code printed on the Locker, "ITROM44128M". */
  readonly code: string;
  readonly street: string;
  readonly postalCode: string;
  readonly city: string;
  readonly province: string | null;
  /** Where it stands: "ATAC - Metro A e B -Termini". */
  readonly place: string | null;
  /** Metres from the searched CAP or position, when the search had one. */
  readonly distance: number | null;
  readonly openAllDay: boolean;
};

/**
 * One line for the order, the emails and the admin:
 * "ITROM44128M · piazza dei Cinquecento 48, 00185 Roma (ATAC - Metro A e B -Termini)".
 * It fits the 160 characters the checkout keeps for the pickup point.
 */
export function lockerLabel(locker: Pick<Locker, "code" | "street" | "postalCode" | "city" | "place">): string {
  const where = [locker.street, `${locker.postalCode} ${locker.city}`.trim()].filter(Boolean).join(", ");
  const text = `${locker.code} · ${where}${locker.place ? ` (${locker.place})` : ""}`;
  return text.length > 160 ? `${text.slice(0, 159)}…` : text;
}

/** Locker compartments in Italy (cm). A parcel is declared at the size of the one it fills. */
export const LOCKER_SIZES = {
  A: { length: 64, width: 38, height: 8 },
  B: { length: 64, width: 38, height: 19 },
  C: { length: 64, width: 38, height: 41 },
} as const;

export type LockerSize = keyof typeof LOCKER_SIZES;

/** The heaviest parcel a Locker takes. */
export const LOCKER_MAX_KG = 25;

/**
 * Who the parcel is from, on the label and in InPost's messages to the buyer. The trade name
 * only, never the account holder's own name (owner, 2026-10-23: "Gear Drop Shop" instead of the
 * name the InPost account was opened under).
 */
export const INPOST_SENDER = {
  companyName: "Gear Drop Shop",
  firstName: "Gear Drop",
  lastName: "Shop",
} as const;

export type ShipmentPerson = {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly phone: string;
};

export type LockerShipment = {
  readonly orderNumber: string;
  readonly recipient: ShipmentPerson;
  /** The Locker id from the search ("IT_ITROM44128M") or its bare code. */
  readonly lockerId: string;
  readonly size: LockerSize;
  readonly weightKg: number;
  readonly senderEmail: string;
  readonly senderPhone: string;
};

/**
 * Phone in the form InPost parses: digits with an optional leading "+". Without a prefix InPost
 * reads it as an Italian number, which is what the checkout collects.
 */
export function inpostPhone(phone: string): string {
  const compact = phone.trim().replace(/[\s.()/-]/g, "");
  return compact.startsWith("00") ? `+${compact.slice(2)}` : compact;
}

/** The bare Locker code the Shipping API takes: "IT_ITROM44128M" → "ITROM44128M". */
export function lockerCode(id: string): string {
  return id.trim().replace(/^[A-Z]{2}_/, "");
}

/**
 * The body of POST /shipping/v2/organizations/{id}/shipments for a parcel the shop drops at any
 * InPost point and the buyer collects from a Locker.
 */
export function lockerShipmentBody(shipment: LockerShipment) {
  return {
    sender: {
      ...INPOST_SENDER,
      email: shipment.senderEmail,
      phone: inpostPhone(shipment.senderPhone),
    },
    recipient: {
      firstName: shipment.recipient.firstName.trim(),
      lastName: shipment.recipient.lastName.trim(),
      email: shipment.recipient.email.trim(),
      phone: inpostPhone(shipment.recipient.phone),
    },
    origin: { countryCode: "IT", shippingMethod: "ANY_POINT" },
    destination: { countryCode: "IT", pointId: lockerCode(shipment.lockerId) },
    parcels: [
      {
        type: "STANDARD",
        dimensions: { ...LOCKER_SIZES[shipment.size], unit: "CM" },
        weight: { amount: shipment.weightKg, unit: "KG" },
      },
    ],
    references: { custom: { orderNumber: shipment.orderNumber } },
  };
}

/** One event in a parcel's journey, as the Tracking API reports it. */
export type TrackingEvent = {
  readonly code: string;
  readonly at: string;
  readonly place: string | null;
};

export type ParcelTracking = {
  readonly trackingNumber: string;
  /** Oldest first. */
  readonly events: readonly TrackingEvent[];
};

export type InpostClient = {
  /** Lockers near a CAP, in a town, or around a position, nearest first. */
  searchLockers(query: LockerQuery): Promise<readonly Locker[]>;
  /** Makes the shipment and returns its tracking number. */
  createLockerShipment(shipment: LockerShipment): Promise<string>;
  /** The A6 PDF label, to print and stick on the parcel. */
  label(trackingNumber: string): Promise<ArrayBuffer>;
  /** Up to ten parcels per call, as InPost allows. */
  track(trackingNumbers: readonly string[]): Promise<readonly ParcelTracking[]>;
};

export type LockerQuery =
  | { readonly postalCode: string }
  | { readonly city: string }
  | { readonly latitude: number; readonly longitude: number };

type Fetch = typeof fetch;

type TokenEntry = { readonly token: string; readonly expiresAt: number };
const tokens = new Map<string, TokenEntry>();

type RawPoint = {
  readonly id?: string;
  readonly address?: {
    readonly street?: string;
    readonly buildingNumber?: string;
    readonly postalCode?: string;
    readonly city?: string;
    readonly administrativeArea?: string;
  };
  readonly description?: { readonly content?: string | null };
  readonly distance?: number;
  readonly location247?: boolean;
};

/** "29/0" is how the Location API writes a plain 29. */
function buildingNumber(value: string | undefined): string {
  return (value ?? "").replace(/\/0$/, "").trim();
}

export function toLocker(point: RawPoint): Locker | null {
  if (!point.id) return null;
  const address = point.address ?? {};
  return {
    id: point.id,
    code: lockerCode(point.id),
    street: [address.street?.trim(), buildingNumber(address.buildingNumber)].filter(Boolean).join(" "),
    postalCode: address.postalCode ?? "",
    city: address.city ?? "",
    province: address.administrativeArea ?? null,
    place: point.description?.content?.trim() || null,
    distance: typeof point.distance === "number" ? point.distance : null,
    openAllDay: point.location247 === true,
  };
}

/** The town as InPost files it: the city filter is case-sensitive ("roma" finds nothing, "Roma" does). */
export function townName(city: string): string {
  return city.trim().toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toUpperCase());
}

/** The Location API query for a search: Lockers that take parcels in, in Italy, ten at most. */
export function lockerSearchPath(query: LockerQuery): string {
  const params = new URLSearchParams({ "address.country": "IT", type: "APM", capabilities: "PARCEL_COLLECT" });
  if ("city" in query) {
    params.set("address.city", townName(query.city));
    params.set("perPage", "10");
    return `/location/v1/points?${params.toString()}`;
  }
  if ("postalCode" in query) params.set("relativePostCode", query.postalCode.trim());
  else params.set("relativePoint", `${query.latitude.toFixed(5)},${query.longitude.toFixed(5)}`);
  params.set("maxDistance", "15000");
  params.set("limit", "10");
  return `/location/v1/points/search-by-location?${params.toString()}`;
}

export function createInpostClient(config: InpostConfig, fetchImpl: Fetch = fetch): InpostClient {
  async function accessToken(): Promise<string> {
    const cached = tokens.get(config.clientId);
    if (cached && cached.expiresAt > Date.now()) return cached.token;
    const response = await fetchImpl(`${config.host}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: config.clientId,
        client_secret: config.clientSecret,
        scope: SCOPES,
      }),
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
    if (!response.ok || !payload.access_token) {
      throw new InpostError(`InPost non ha accettato le credenziali (${payload.error ?? response.status}).`, response.status);
    }
    // A minute of margin, so a token never expires between this check and InPost reading it.
    tokens.set(config.clientId, { token: payload.access_token, expiresAt: Date.now() + Math.max(0, (payload.expires_in ?? 300) - 60) * 1000 });
    return payload.access_token;
  }

  async function request(path: string, init: { method?: "GET" | "POST"; accept?: string; body?: unknown } = {}): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await accessToken()}`,
      Accept: init.accept ?? "application/json",
      "Accept-Language": "it",
    };
    if (init.body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetchImpl(`${config.host}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? null : JSON.stringify(init.body),
      cache: "no-store",
    });
    if (response.ok) return response;
    const problem = (await response.json().catch(() => ({}))) as { title?: string; detail?: string; errors?: Record<string, string[]> };
    throw new InpostError(
      `InPost ${init.method ?? "GET"} ${path.split("?")[0]} → ${response.status}: ${problem.detail ?? problem.title ?? "errore sconosciuto"}`,
      response.status,
      problem.errors ?? {},
    );
  }

  function organization(): string {
    if (!config.organizationId) throw new InpostError("Manca INPOST_ORGANIZATION_ID.", 0);
    return encodeURIComponent(config.organizationId);
  }

  return {
    async searchLockers(query) {
      const response = await request(lockerSearchPath(query));
      const payload = (await response.json()) as { items?: readonly RawPoint[] };
      return (payload.items ?? []).flatMap((point) => toLocker(point) ?? []);
    },

    async createLockerShipment(shipment) {
      const response = await request(`/shipping/v2/organizations/${organization()}/shipments`, {
        method: "POST",
        body: lockerShipmentBody(shipment),
      });
      const payload = (await response.json()) as { trackingNumber?: string };
      if (!payload.trackingNumber) throw new InpostError("InPost ha creato la spedizione senza numero di tracking.", response.status);
      return payload.trackingNumber;
    },

    async label(trackingNumber) {
      const response = await request(
        `/shipping/v2/organizations/${organization()}/shipments/${encodeURIComponent(trackingNumber)}/label`,
        { accept: "application/pdf;format=A6" },
      );
      return response.arrayBuffer();
    },

    async track(trackingNumbers) {
      if (trackingNumbers.length === 0) return [];
      const params = new URLSearchParams();
      for (const number of trackingNumbers.slice(0, 10)) params.append("trackingNumbers", number);
      const response = await request(`/tracking/v1/parcels?${params.toString()}`);
      const payload = (await response.json()) as {
        parcels?: readonly {
          trackingNumber?: string;
          events?: readonly { eventCode?: string; eventTimestamp?: string; location?: { name?: string | null; city?: string | null } | null }[];
        }[];
      };
      return (payload.parcels ?? []).flatMap((parcel) =>
        parcel.trackingNumber
          ? [
              {
                trackingNumber: parcel.trackingNumber,
                events: (parcel.events ?? [])
                  .flatMap((event) =>
                    event.eventCode && event.eventTimestamp
                      ? [{ code: event.eventCode, at: event.eventTimestamp, place: [event.location?.name, event.location?.city].filter(Boolean).join(", ") || null }]
                      : [],
                  )
                  .sort((a, b) => a.at.localeCompare(b.at)),
              },
            ]
          : [],
      );
    },
  };
}
