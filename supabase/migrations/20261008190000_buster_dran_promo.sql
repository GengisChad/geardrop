-- 2026-10-08, the owner: Buster Dran 5-70DB on promotion at 8,90 (was 9,99). The struck-through
-- 9,99 is the lowest price of the previous 30 days (12,90 from 2026-10-04, 9,99 from 2026-10-06),
-- as Italian law asks of an announced reduction. The catalogue and Stripe carry the price; this
-- mirrors it into the live database.

begin;

update public.products
set price_cents = 890,
    compare_at_price_cents = 999
where slug = 'buster-dran-5-70db';

commit;
