-- The owner's price list of 2026-10-06:
--   Impact Drake 9-60LR     13,00 € -> 15,00 €
--   Hover Wyvern 3-85N      13,00 € -> 15,00 €
--   Shadow Shinobi 1-80MN   14,90 € ->  9,99 €
--   Hammer Incendio 3-70H   14,90 € -> 12,00 €
--   Buster Dran 5-70DB      12,90 € ->  9,99 €
--
-- The storefront prices from src/data/catalog.ts and Stripe; this keeps the panel's product
-- rows saying the same number. The bundles keep their own price: they have no rows here, and
-- only their struck-through "bought separately" total moves with the pieces.

begin;
select pg_advisory_xact_lock(hashtext('20261006090000_price_list_of_october_sixth'));

update public.products as product
set price_cents = price.cents
from (values
  ('impact-drake-9-60lr', 1500),
  ('hover-wyvern-3-85n', 1500),
  ('shadow-shinobi-1-80mn', 999),
  ('hammer-incendio-3-70h', 1200),
  ('buster-dran-5-70db', 999)
) as price(slug, cents)
where product.slug = price.slug;

commit;
