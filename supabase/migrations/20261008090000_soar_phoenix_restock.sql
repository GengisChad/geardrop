-- 2026-10-08, the owner: 199 Soar Phoenix 9-60GF (the red one, with its launcher) arrived. It
-- had been selling as an open pre-order with no shelf; now it goes on the shelf at 25,90
-- (was 32,00) and joins the new releases, so it leads "Nuovi arrivi" and wears the Novità badge.
--
-- allow_backorder stays on: once the shelf runs out it becomes a pre-order again by itself,
-- the rule the owner asked for in 20260917140000.
--
-- Catalogue copy and prices live in src/data/catalog.ts; this mirrors them into the live
-- database. Stripe is aligned separately with pnpm stripe:products --apply.

begin;

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('geardrop:soar-phoenix-restock:2026-10-08', 0)
);

update public.products
set price_cents = 2590
where slug = 'soar-phoenix-9-60gf';

-- Only a shelf that is still empty is filled. If the owner (or an earlier replay) already
-- counted the goods in, that number is the real one and this leaves it alone.
create temporary table soar_phoenix_intake on commit drop as
select product.id, 199 as received, product.stock_quantity + 199 as stock_after
from public.products as product
where product.slug = 'soar-phoenix-9-60gf'
  and product.stock_quantity <= 0;

update public.products as product
set stock_quantity = intake.stock_after,
    availability_override = null,
    preorder_allocation = 0
from soar_phoenix_intake as intake
where intake.id = product.id;

insert into public.inventory_movements (product_id, delta, stock_after, reason, note)
select intake.id, intake.received, intake.stock_after, 'manual_adjustment'::public.inventory_reason,
  'Carico merce Soar Phoenix dell''08/10/2026'
from soar_phoenix_intake as intake;

insert into public.product_tags (product_id, tag)
select product.id, 'novita'::public.promo_tag
from public.products as product
where product.slug = 'soar-phoenix-9-60gf'
on conflict (product_id, tag) do nothing;

commit;
