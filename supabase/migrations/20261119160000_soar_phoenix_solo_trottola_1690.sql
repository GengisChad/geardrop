-- 2026-11-19, the owner: Soar Phoenix 9-60GF solo trottola 12,99 -> 16,90. Each top comes out of a
-- starter bought at 12,50, so 12,99 (10,65 net of VAT) sold it under cost. Sold out today: the price
-- applies when it is back on the shelf.

update public.products
set price_cents = 1690
where slug = 'soar-phoenix-9-60gf-solo-trottola'
  and price_cents <> 1690;
