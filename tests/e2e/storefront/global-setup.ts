import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";

/**
 * Fixtures for the storefront order gate.
 *
 * Everything is scoped to a random run id, so this can share a database with the admin
 * gate without either seeing the other's rows. Order intake is opened here because a
 * fresh database ships with `accept_orders = false` — which is the correct default, and
 * exactly what one of the tests then puts back.
 */
export default async function globalSetup(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) {
    throw new Error("Storefront order tests require the local ephemeral Supabase stack");
  }

  const run = randomUUID().slice(0, 8);
  process.env.STOREFRONT_E2E_RUN = run;

  const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
  const sql = `
    insert into public.categories (name, slug, tagline, description, active, publication_status, published_at)
    values (
      'Categoria checkout', ${literal(`checkout-${run}`)},
      'Categoria tecnica per il gate ordini', 'Fixture del gate ordini storefront.',
      true, 'published', now()
    );
    insert into public.products (
      category_id, slug, sku, name, tagline, description, price_cents,
      publication_status, active, stock_quantity, sort_order
    ) values (
      (select id from public.categories where slug = ${literal(`checkout-${run}`)}),
      ${literal(`checkout-product-${run}`)}, ${literal(`checkout-product-${run}`)},
      'Prodotto checkout', 'Fixture', 'Prodotto del gate ordini storefront.',
      -- Deliberately not a price that exists in src/data/catalog.ts: the storefront must
      -- show this number, proving the bundled catalogue is no longer an authority.
      1234, 'published', true, 5, 0
    );
    -- private.is_public_product requires a published image, so without this the fixture
    -- would simply be invisible to the anonymous storefront client.
    insert into public.product_images (product_id, src, width, height, alt, sort_order, published, is_primary)
    values (
      (select id from public.products where slug = ${literal(`checkout-product-${run}`)}),
      '/products/wizard-arrow-4-80b-1.webp', 800, 800, 'Prodotto checkout', 0, true, true
    );
    -- Exactly one active method, so the option the quote picks is not a race with
    -- whatever the admin gate left behind.
    update public.shipping_methods set active = false;
    insert into public.shipping_methods (code, name, price_cents, free_from_cents, active, sort_order)
    values (${literal(`checkout-standard-${run}`)}, 'Corriere test', 500, null, true, 0);
    update public.site_settings set accept_orders = true where singleton;
  `;

  execFileSync(
    "psql",
    ["postgresql://postgres:postgres@127.0.0.1:54322/postgres", "--set", "ON_ERROR_STOP=1", "--command", sql],
    { stdio: "ignore" },
  );
}
