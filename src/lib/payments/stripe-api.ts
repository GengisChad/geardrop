/**
 * Minimal Stripe REST client shared by the storefront checkout and the catalogue sync script.
 *
 * Dependency-free and deliberately without `server-only`, so the tsx script can import it
 * too. It needs the secret key, so it must only ever run on the server.
 */

const STRIPE_API = "https://api.stripe.com/v1";

type FormValue = string | number | boolean | readonly string[] | Readonly<Record<string, string>>;
export type FormFields = Readonly<Record<string, FormValue | undefined>>;

/** Stable Stripe id for a catalogue slug; also used as the price lookup key. */
export function stripeProductId(slug: string): string {
  return `gd_${slug.replaceAll("-", "_")}`;
}

/** Stripe's form encoding: arrays and records share the bracket syntax, images[0] and metadata[slug]. */
export function formEncode(fields: FormFields): URLSearchParams {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (typeof value === "object") {
      for (const [name, item] of Object.entries(value)) body.append(`${key}[${name}]`, item);
    } else {
      body.append(key, String(value));
    }
  }
  return body;
}

export type StripeClient = {
  /** Resolves null on 404, so a missing object is a value rather than an exception. */
  get<T>(path: string): Promise<T | null>;
  post<T>(path: string, fields: FormFields, idempotencyKey?: string): Promise<T>;
};

export function createStripeClient(secretKey: string): StripeClient {
  async function send(method: "GET" | "POST", path: string, body?: URLSearchParams, idempotencyKey?: string) {
    const headers: Record<string, string> = { Authorization: `Bearer ${secretKey}` };
    if (body) headers["Content-Type"] = "application/x-www-form-urlencoded";
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    return fetch(`${STRIPE_API}${path}`, { method, headers, body: body ?? null, cache: "no-store" });
  }

  async function parse<T>(response: Response, label: string): Promise<T> {
    const payload = (await response.json()) as T & { readonly error?: { readonly message?: string } };
    if (!response.ok) {
      // Stripe masks keys in its own messages, so the error text is safe to log.
      throw new Error(`Stripe ${label} → ${response.status}: ${payload.error?.message ?? "errore sconosciuto"}`);
    }
    return payload;
  }

  return {
    async get<T>(path: string): Promise<T | null> {
      const response = await send("GET", path);
      if (response.status === 404) return null;
      return parse<T>(response, `GET ${path.split("?")[0]}`);
    },
    async post<T>(path: string, fields: FormFields, idempotencyKey?: string): Promise<T> {
      return parse<T>(await send("POST", path, formEncode(fields), idempotencyKey), `POST ${path}`);
    },
  };
}
