-- 2026-10-08, the owner: Hammer Incendio 3-70H goes from 12,00 to 11,99. The duo Horus + Enlil
-- (17,99) and the new Promo Attack bundle (Glory Valkerion + Buster Dran, 29,99) are bundles:
-- they live in src/data/catalog.ts and Stripe, not in this table, and sell from their packs'
-- stock. This mirrors the one product price into the live database.

begin;

update public.products
set price_cents = 1199
where slug = 'hammer-incendio-3-70h'
  and price_cents <> 1199;

commit;
