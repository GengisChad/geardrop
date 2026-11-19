-- 2026-11-19, the owner: Soar Phoenix 9-60GF sells at 21,90, not 19,90. The 19,90 of migration
-- 20261119120000 was worked out on a cost of 8,00; the shop paid 12,50 a piece (already the cost in
-- the back office). Bundles are not rows of this table.

update public.products
set price_cents = 2190
where slug = 'soar-phoenix-9-60gf'
  and price_cents <> 2190;
