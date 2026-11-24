-- 2026-11-24, the owner: "se da scheda prodotto cambio nome, sku o simile la pagina effettivamente
-- non si aggiorna con il prodotto nuovo. Cambia solo il prezzo".
--
-- The shop reads each product's copy from src/data/catalog.ts and only stock and price from this
-- table. From now on every save on the product sheet records here which fields it changed, and the
-- shop shows exactly those from the database (src/lib/commerce/storefront-content.ts). A field
-- nobody changed keeps the catalogue's copy, so an old text sitting in a row cannot reach the page
-- on its own.
--
-- Additive only: the code reads the column apart from stock and prices and copes without it, so
-- the migration can run before or after the deploy.

begin;

alter table public.products
  add column if not exists storefront_fields text[] not null default '{}';

alter table public.products drop constraint if exists products_storefront_fields_known;
alter table public.products add constraint products_storefront_fields_known check (
  storefront_fields <@ array[
    'name', 'tagline', 'description', 'category', 'blade_type',
    'specs', 'features', 'box_contents', 'images', 'tags'
  ]::text[]
);

-- The sheet writes it with the partner's own session, like the other content columns.
grant update (storefront_fields) on public.products to authenticated;

comment on column public.products.storefront_fields is
  'Fields changed on the product sheet that the shop shows instead of the catalogue copy (name, tagline, description, category, blade_type, specs, features, box_contents, images, tags).';

commit;
