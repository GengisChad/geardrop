-- 2026-09-22, the owner: six Suppress Superion arrived from the distributor. One is his, one is
-- promised to a friend, so five go back on sale as a funded pre-order (the piece the shop owed
-- GD-ML6E4UEE comes out of these five). New prices the same day: Strike Dran 23,00, Shatter Horus
-- and Hurricane Enlil 18,00, and the duo follows them down to 33,00 (from 37,00) so it stays
-- cheaper than its two packs, which now cost 36,00 together.
--
-- Catalogue copy and prices live in src/data/catalog.ts; this mirrors them into the live database.
-- Stripe is aligned separately with pnpm stripe:products --apply.

begin;

-- Only from zero: the product is sold out right now, and the guard makes sure a replay can never
-- reset an allocation the shop has already sold from. If it ever no-ops, the allocation is not
-- zero any more and the owner's number is the one to keep.
update public.products
set preorder_allocation = 5
where slug = 'suppress-superion-0-70lp'
  and availability_override = 'preorder'::public.availability_override
  and preorder_allocation = 0;

update public.products as target
set price_cents = seed.price_cents
from (values
  ('strike-dran-4-50ff', 2300),
  ('shatter-horus-9-65gb', 1800),
  ('hurricane-enlil-is-7-55t', 1800)
) as seed(slug, price_cents)
where target.slug = seed.slug;

update public.bundles
set price_cents = 3300,
  compare_at_price_cents = 3600,
  description = 'Due Infinity Starter Beyblade X, stamina contro bilanciata, a €33 invece di €36.'
where slug = 'duo-horus-enlil';

commit;
