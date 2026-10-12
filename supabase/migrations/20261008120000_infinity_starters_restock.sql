-- 2026-10-08, the owner: a new Hasbro shipment of the three Infinity Starters arrived.
--
--   Glory Valkerion LF          +50
--   Shatter Horus 9-65GB        +75
--   Hurricane Enlil IS 7-55T    +75
--
-- The pieces are added to whatever the shelf holds right now: the update is relative, so an
-- order paid while this runs is never overwritten. A replay adds nothing, because each product
-- already carries the intake movement below. Prices do not change.
--
-- Catalogue copy and prices live in src/data/catalog.ts; this mirrors the count into the live
-- database, where the storefront reads availability.

begin;

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('geardrop:infinity-starters-restock:2026-10-08', 0)
);

create temporary table infinity_restock (slug text primary key, received integer not null)
  on commit drop;

insert into infinity_restock (slug, received) values
  ('glory-valkerion-lf', 50),
  ('shatter-horus-9-65gb', 75),
  ('hurricane-enlil-is-7-55t', 75);

with intake as (
  select product.id, restock.received
  from public.products as product
  join infinity_restock as restock on restock.slug = product.slug
  where not exists (
    select 1
    from public.inventory_movements as movement
    where movement.product_id = product.id
      and movement.note = 'Carico merce Infinity Starter dell''08/10/2026'
  )
),
updated as (
  update public.products as product
  set stock_quantity = product.stock_quantity + intake.received
  from intake
  where intake.id = product.id
  returning product.id, intake.received, product.stock_quantity as stock_after
)
insert into public.inventory_movements (product_id, delta, stock_after, reason, note)
select updated.id, updated.received, updated.stock_after, 'manual_adjustment'::public.inventory_reason,
  'Carico merce Infinity Starter dell''08/10/2026'
from updated;

commit;
