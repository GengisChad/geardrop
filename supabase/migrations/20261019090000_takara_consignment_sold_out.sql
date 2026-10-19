-- 2026-10-19, the owner: the three Takara Tomy consignment pieces held by NerdPoint
-- (cx-00-evangelion-deck-set, ux-00-glory-valkyrie-lf, cx-00-tigarage-ft3-60t) are sold out.
-- Their stock counts go to zero with one adjustment movement each, so each product page reads
-- "esaurito" and offers "Avvisami quando torna disponibile" (no open pre-orders since 20261008170000).
-- The products stay on the site; the Takara Tomy section keeps showing them as sold-out cards.
--
-- When NerdPoint sends new pieces, a new inventory movement will re-stock them; this migration
-- only captures the removal. A replay changes nothing: the shelves are already empty.
--
-- NOTE: production has unmerged gestionale migrations that add products.organization_id (NOT NULL)
-- and a trigger that propagates it to inventory_movements. The statement shape used by PR #67
-- (blast-pegasus) ran correctly on that schema; the same shape is used here.

begin;

with emptied as (
  select product.id, product.stock_quantity as removed
  from public.products as product
  where product.slug in (
    'cx-00-evangelion-deck-set',
    'ux-00-glory-valkyrie-lf',
    'cx-00-tigarage-ft3-60t'
  )
    and product.stock_quantity > 0
  for update
),
updated as (
  update public.products as product
  set stock_quantity = 0
  from emptied
  where emptied.id = product.id
  returning product.id, product.slug, emptied.removed
)
insert into public.inventory_movements (product_id, delta, stock_after, reason, note)
select
  updated.id,
  -updated.removed,
  0,
  'manual_adjustment'::public.inventory_reason,
  'Rettifica: pezzi Takara NerdPoint esauriti (19/10/2026)'
from updated;

commit;
