-- 2026-09-29, the owner: the shipment from Spain arrived, so four pieces the shop had been
-- selling as open pre-orders are physically on the shelf. They go back to regular stock, and the
-- prices come down to what the landed cost allows while still undercutting every Italian shop
-- that actually has them (most are sold out):
--
--   Drop Attack   46,50 -> 39,90   102 pieces   (market 46,50-58,41)
--   Sneak Attack  45,00 -> 44,90    51 pieces   (market 49,85-62,00, list 54,99)
--   Blast Pegasus 29,50 -> 26,90    56 pieces   (market 34,90-35,90)
--   Saber Samurai 27,90 -> 25,90    16 pieces   (market 29,90-35,33)
--
-- allow_backorder stays on: once a shelf runs out the product becomes a pre-order again by
-- itself, which is the rule the owner asked for in 20260917140000.
--
-- Catalogue copy and prices live in src/data/catalog.ts; this mirrors them into the live
-- database. Stripe is aligned separately with pnpm stripe:products --apply.

begin;

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('geardrop:spain-arrival:2026-09-29', 0)
);

create temporary table spain_arrival (slug text primary key, price_cents integer not null, received integer not null)
  on commit drop;

insert into spain_arrival (slug, price_cents, received) values
  ('drop-attack-battle-set', 3990, 102),
  ('sneak-attack-battle-set', 4490, 51),
  ('blast-pegasus-a-tr', 2690, 56),
  ('saber-samurai-2-70l', 2590, 16);

update public.products as target
set price_cents = arrival.price_cents
from spain_arrival as arrival
where target.slug = arrival.slug;

-- Only a shelf that is still empty is filled. If the owner (or an earlier replay) already
-- counted the goods in, that number is the real one and this leaves it alone.
create temporary table spain_arrival_intake on commit drop as
select product.id, arrival.received, product.stock_quantity + arrival.received as stock_after
from public.products as product
join spain_arrival as arrival on arrival.slug = product.slug
where product.stock_quantity <= 0;

update public.products as product
set stock_quantity = intake.stock_after,
    availability_override = null,
    preorder_allocation = 0
from spain_arrival_intake as intake
where intake.id = product.id;

insert into public.inventory_movements (product_id, delta, stock_after, reason, note)
select intake.id, intake.received, intake.stock_after, 'manual_adjustment'::public.inventory_reason,
  'Carico merce dalla Spagna del 29/09/2026'
from spain_arrival_intake as intake;

commit;
