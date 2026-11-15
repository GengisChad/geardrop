-- 2026-11-15, the owner: "abbassa costo dei brachio su gear drop a 28 euro e mettiamoli in promozione".
--
--   CX-18 Random Booster Brachio Whip Select   28,00 (was 30,00)   tag "offerta" next to "novita"
--
-- The struck-through 30,00 is the only price the piece has had since it was listed on 2026-11-06, so
-- it is the lowest of the previous 30 days, as Italian law asks of an announced reduction. The
-- catalogue and Stripe carry the price; this mirrors it into the live database. Stock is left alone:
-- the shelf holds what the shop counts. A replay writes the same price and finds the tag in place.

begin;

update public.products
set price_cents = 2800,
    compare_at_price_cents = 3000
where slug = 'cx-18-random-booster-brachio-whip';

insert into public.product_tags (product_id, tag)
select id, 'offerta'::public.promo_tag
from public.products
where slug = 'cx-18-random-booster-brachio-whip'
on conflict (product_id, tag) do nothing;

commit;
