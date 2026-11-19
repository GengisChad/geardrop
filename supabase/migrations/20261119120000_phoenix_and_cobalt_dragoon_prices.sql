-- 2026-11-19, the owner ("Sì, procedi" on the price proposal): two price cuts, a few euros under
-- what the other Italian shops ask. Bundles are not rows of this table (they live in
-- src/data/catalog.ts and Stripe), so only the two single products are mirrored here.
-- Soar Phoenix 9-60GF 24,90 → 19,90; Cobalt Dragoon 2-60C 19,90 → 17,90.

begin;

update public.products
set price_cents = 1990
where slug = 'soar-phoenix-9-60gf'
  and price_cents <> 1990;

update public.products
set price_cents = 1790
where slug = 'cobalt-dragoon-2-60c'
  and price_cents <> 1790;

commit;
