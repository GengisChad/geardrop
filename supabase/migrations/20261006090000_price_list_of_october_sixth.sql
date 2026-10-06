-- The owner's price list of 2026-10-06:
--   Impact Drake 9-60LR        13,00 € -> 15,00 €
--   Hover Wyvern 3-85N         13,00 € -> 15,00 €
--   Shadow Shinobi 1-80MN      14,90 € ->  9,99 €
--   Hammer Incendio 3-70H      14,90 € -> 12,00 €
--   Buster Dran 5-70DB         12,90 € ->  9,99 €
--   Shatter Horus 9-65GB       12,50 € -> 11,99 €
--   Hurricane Enlil IS 7-55T   12,50 € ->  9,99 €
--
-- The storefront prices from src/data/catalog.ts and Stripe; this keeps the panel's rows saying
-- the same number. The storefront-only bundles keep their own price and only their struck-through
-- "bought separately" total moves with the pieces. The Horus + Enlil duo is the exception: at
-- 22,90 € it would now cost more than its two packs (21,98 €), so it comes down to 19,90 €, the
-- same two euros under them it has always been.

begin;
select pg_advisory_xact_lock(hashtext('20261006090000_price_list_of_october_sixth'));

update public.products as product
set price_cents = price.cents
from (values
  ('impact-drake-9-60lr', 1500),
  ('hover-wyvern-3-85n', 1500),
  ('shadow-shinobi-1-80mn', 999),
  ('hammer-incendio-3-70h', 1200),
  ('buster-dran-5-70db', 999),
  ('shatter-horus-9-65gb', 1199),
  ('hurricane-enlil-is-7-55t', 999)
) as price(slug, cents)
where product.slug = price.slug;

update public.bundles
set price_cents = 1990,
  compare_at_price_cents = 2198,
  description = 'Due Infinity Starter Beyblade X, stamina contro bilanciata, a €19,90 invece di €21,98.'
where slug = 'duo-horus-enlil';

commit;
