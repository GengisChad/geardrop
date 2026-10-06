-- Impact Drake 9-60LR and Hover Wyvern 3-85N go from 13,00 € to 15,00 € each (owner,
-- 2026-10-06). Two of them now cost what the owner already charged for the pair by hand.
--
-- The storefront prices from src/data/catalog.ts and Stripe; this keeps the panel's product
-- rows saying the same number. The Deck Completo and the Trio Starter keep their price: they
-- have no rows here, and only their struck-through "bought separately" total moves with it.

begin;
select pg_advisory_xact_lock(hashtext('20261006090000_loose_tops_at_fifteen'));

update public.products
set price_cents = 1500
where slug in ('impact-drake-9-60lr', 'hover-wyvern-3-85n');

commit;
