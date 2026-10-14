-- 2026-10-14, the owner: five price changes effective today. Bundles are not rows of this
-- table (they live in src/data/catalog.ts and Stripe), so only the five single products are
-- mirrored here. Glory Valkerion LF 23,00 → 19,99; Soar Phoenix 9-60GF 25,90 → 24,90;
-- Impact Drake 9-60LR 15,00 → 13,99; Hover Wyvern 3-85N 15,00 → 13,99;
-- Cobalt Dragoon 2-60C 23,00 → 19,90 (added by the owner the same day).

begin;

update public.products
set price_cents = 1999
where slug = 'glory-valkerion-lf'
  and price_cents <> 1999;

update public.products
set price_cents = 2490
where slug = 'soar-phoenix-9-60gf'
  and price_cents <> 2490;

update public.products
set price_cents = 1399
where slug = 'impact-drake-9-60lr'
  and price_cents <> 1399;

update public.products
set price_cents = 1399
where slug = 'hover-wyvern-3-85n'
  and price_cents <> 1399;

update public.products
set price_cents = 1990
where slug = 'cobalt-dragoon-2-60c'
  and price_cents <> 1990;

commit;
