import { pathToFileURL } from "node:url";
import { PRODUCTS } from "../src/data/catalog";
import type { Money, Product } from "../src/lib/commerce/types";
import { createStripeClient, stripeProductId, type StripeClient } from "../src/lib/payments/stripe-api";
import { PRODUCTION_ORIGIN } from "../src/lib/site-url";

export { formEncode, stripeProductId } from "../src/lib/payments/stripe-api";

/**
 * Mirrors the storefront catalogue into Stripe Products and Prices.
 *
 * `src/data/catalog.ts` stays the source of truth: this only creates or updates Stripe
 * objects so they match it, never the other way round. Every product gets a stable id
 * derived from its slug (`gd_<slug>`), so a re-run updates in place instead of creating
 * duplicates. Stripe prices are immutable, so a changed amount creates a new price, makes
 * it the default and archives the old one.
 *
 * Dry run by default; nothing is written without `--apply`.
 *
 *   pnpm stripe:products            preview the changes
 *   pnpm stripe:products --apply    write them to the account behind STRIPE_SECRET_KEY
 */

export type StripeProductPayload = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly images: readonly string[];
  readonly url: string;
  readonly metadata: Readonly<Record<string, string>>;
};

export type DesiredPrice = {
  readonly unitAmount: number;
  readonly currency: string;
  readonly lookupKey: string;
};

export type StripePrice = {
  readonly id: string;
  readonly unit_amount: number | null;
  readonly currency: string;
  readonly active: boolean;
};

export type StripeProduct = {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly images: readonly string[];
  readonly url: string | null;
  readonly active: boolean;
  readonly metadata: Readonly<Record<string, string>>;
  /** Expanded on retrieval; a bare id only when the expansion was not requested. */
  readonly default_price: StripePrice | string | null;
};

export type ProductSyncPlan = {
  readonly product: "create" | "update" | "unchanged";
  readonly changedFields: readonly string[];
  readonly price: "create" | "replace" | "unchanged";
  readonly replacesPriceId: string | null;
};

type StripeAccount = {
  readonly id: string;
  readonly business_profile?: { readonly name?: string | null } | null;
  readonly settings?: { readonly dashboard?: { readonly display_name?: string | null } | null } | null;
};

export function buildStripeProduct(product: Product, origin: string = PRODUCTION_ORIGIN): StripeProductPayload {
  return {
    id: stripeProductId(product.slug),
    name: product.name,
    description: product.description,
    // Stripe accepts at most 8 images and only absolute URLs it can fetch.
    images: product.images.slice(0, 8).map((image) => new URL(image.src, origin).toString()),
    url: new URL(`/prodotto/${product.slug}`, origin).toString(),
    metadata: { slug: product.slug, sku: product.slug.toUpperCase(), category: product.category },
  };
}

export function buildStripePrice(product: Product): DesiredPrice {
  return {
    unitAmount: product.price.amount,
    currency: product.price.currency.toLowerCase(),
    lookupKey: stripeProductId(product.slug),
  };
}

function sameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

export function planProductSync(
  desired: StripeProductPayload,
  price: DesiredPrice,
  existing: StripeProduct | null,
): ProductSyncPlan {
  if (!existing) return { product: "create", changedFields: [], price: "create", replacesPriceId: null };

  const changedFields: string[] = [];
  if (existing.name !== desired.name) changedFields.push("name");
  if ((existing.description ?? "") !== desired.description) changedFields.push("description");
  if (!sameList(existing.images, desired.images)) changedFields.push("images");
  if (existing.url !== desired.url) changedFields.push("url");
  if (Object.entries(desired.metadata).some(([key, value]) => existing.metadata[key] !== value)) {
    changedFields.push("metadata");
  }
  if (!existing.active) changedFields.push("active");

  const current = typeof existing.default_price === "object" ? existing.default_price : null;
  const priceMatches =
    current !== null &&
    current.active &&
    current.unit_amount === price.unitAmount &&
    current.currency === price.currency;

  return {
    product: changedFields.length > 0 ? "update" : "unchanged",
    changedFields,
    price: priceMatches ? "unchanged" : current ? "replace" : "create",
    replacesPriceId: priceMatches ? null : (current?.id ?? null),
  };
}

function euro(money: Money): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: money.currency }).format(money.amount / 100);
}

export function describePlan(product: Product, plan: ProductSyncPlan): string {
  const productText =
    plan.product === "create"
      ? "nuovo prodotto"
      : plan.product === "update"
        ? `aggiorna ${plan.changedFields.join(", ")}`
        : "prodotto invariato";
  const priceText =
    plan.price === "create"
      ? `nuovo prezzo ${euro(product.price)}`
      : plan.price === "replace"
        ? `nuovo prezzo ${euro(product.price)}, archivia ${plan.replacesPriceId}`
        : `prezzo ${euro(product.price)} invariato`;
  return `- ${product.name}: ${productText} · ${priceText}`;
}

async function applyPlan(client: StripeClient, desired: StripeProductPayload, price: DesiredPrice, plan: ProductSyncPlan) {
  const { id, ...fields } = desired;
  if (plan.product === "create") {
    // The fixed id makes a second create fail loudly instead of duplicating the product.
    await client.post("/products", { id, ...fields });
  } else if (plan.product === "update") {
    await client.post(`/products/${id}`, { ...fields, active: true });
  }
  if (plan.price === "unchanged") return;

  // Idempotent on the exact change, so a run interrupted before the default is switched
  // reuses the price it already created rather than leaving an orphan behind.
  const created = await client.post<StripePrice>(
    "/prices",
    {
      product: id,
      currency: price.currency,
      unit_amount: price.unitAmount,
      // Consumer prices on the site are final, VAT included.
      tax_behavior: "inclusive",
      lookup_key: price.lookupKey,
      transfer_lookup_key: true,
    },
    `gd-price-${id}-${price.currency}-${price.unitAmount}-${plan.replacesPriceId ?? "first"}`,
  );
  await client.post(`/products/${id}`, { default_price: created.id });
  // A product's default price cannot be archived, so this has to follow the switch.
  if (plan.replacesPriceId) await client.post(`/prices/${plan.replacesPriceId}`, { active: false });
}

function keyMode(secretKey: string): string {
  if (/^(sk|rk)_live_/.test(secretKey)) return "LIVE";
  if (/^(sk|rk)_test_/.test(secretKey)) return "TEST";
  return "sconosciuta";
}

export async function syncStripeProducts(argv: readonly string[]): Promise<void> {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // No file: the key may still come from the shell environment.
  }

  const secretKey = process.env["STRIPE_SECRET_KEY"]?.trim();
  if (!secretKey) {
    console.error("STRIPE_SECRET_KEY è vuota: incolla la chiave segreta in .env.local e rilancia.");
    process.exitCode = 1;
    return;
  }

  const apply = argv.includes("--apply");
  const client = createStripeClient(secretKey);

  const account = await client.get<StripeAccount>("/account").catch(() => null);
  const accountName =
    account?.business_profile?.name ?? account?.settings?.dashboard?.display_name ?? "nome non leggibile";
  console.log(`Account Stripe: ${accountName} (${account?.id ?? "id non leggibile"}) · modalità ${keyMode(secretKey)}`);
  console.log(apply ? "Scrittura attiva.\n" : "Anteprima: nessuna modifica. Rilancia con --apply per scrivere.\n");

  let pending = 0;
  for (const product of PRODUCTS) {
    const desired = buildStripeProduct(product);
    const price = buildStripePrice(product);
    const existing = await client.get<StripeProduct>(`/products/${desired.id}?expand%5B%5D=default_price`);
    const plan = planProductSync(desired, price, existing);
    console.log(describePlan(product, plan));
    if (plan.product === "unchanged" && plan.price === "unchanged") continue;
    pending += 1;
    if (apply) await applyPlan(client, desired, price, plan);
  }

  console.log(
    pending === 0
      ? "\nStripe è già allineato al catalogo."
      : apply
        ? `\n${pending} prodotti allineati su Stripe.`
        : `\n${pending} prodotti da allineare.`,
  );
}

const invokedPath = process.argv[1];

if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  syncStripeProducts(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
