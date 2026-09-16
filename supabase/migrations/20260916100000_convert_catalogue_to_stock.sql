begin;

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('geardrop:catalogue-stock:2026-09-16', 0)
);

-- The owner confirmed on 2026-09-16 that the reviewed catalogue is physically in stock, so
-- it is sold as regular stock instead of pre-orders. For each product still carrying its
-- pre-order campaign, the unsold allocation becomes stock on hand and an 'initial' inventory
-- movement records the conversion. Products already converted are left untouched, so the
-- migration is safe to replay.
create temporary table catalogue_stock_slugs (slug text primary key) on commit drop;

insert into catalogue_stock_slugs (slug) values
  ('cobalt-dragoon-2-60c'),
  ('soar-phoenix-9-60gf'),
  ('saber-samurai-2-70l'),
  ('blast-pegasus-a-tr'),
  ('drop-attack-battle-set'),
  ('sneak-attack-battle-set'),
  ('glory-valkyrie-lf'),
  ('hurricane-enlil-is-7-55t'),
  ('shatter-horus-9-65gb');

create temporary table catalogue_stock_conversion on commit drop as
select
  product.id,
  product.preorder_allocation as converted,
  product.stock_quantity + product.preorder_allocation as stock_after
from public.products as product
join catalogue_stock_slugs as seed on seed.slug = product.slug
where product.availability_override = 'preorder'::public.availability_override
  and product.preorder_allocation > 0;

update public.products as product
set availability_override = null,
    preorder_allocation = 0,
    stock_quantity = conversion.stock_after
from catalogue_stock_conversion as conversion
where conversion.id = product.id;

insert into public.inventory_movements (product_id, delta, stock_after, reason, note)
select
  conversion.id,
  conversion.converted,
  conversion.stock_after,
  'initial'::public.inventory_reason,
  'Catalogo disponibile a magazzino: allocazione pre-ordine convertita in giacenza'
from catalogue_stock_conversion as conversion;

commit;
