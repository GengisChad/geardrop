-- 2026-10-08, the owner: Glory Valkerion LF costs 23,00. The catalogue and Stripe already
-- charge 23,00 (src/data/catalog.ts), but the live database row still carried 25,00 from
-- an earlier price list, which the admin showed. This brings the row back in line; it is
-- the only product whose database price differed from the catalogue on that day.

begin;

update public.products
set price_cents = 2300
where slug = 'glory-valkerion-lf'
  and price_cents <> 2300;

commit;
