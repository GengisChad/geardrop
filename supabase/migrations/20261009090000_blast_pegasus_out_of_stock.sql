-- 2026-10-09, the owner: Blast Pegasus A Tr is not on the shelf, although the database counted
-- 54. The count goes to zero with an adjustment movement, so the product reads "esaurito" and
-- its page offers "Avvisami quando torna disponibile" (no open pre-orders since 20261008170000).
-- The Duo Lanciatori Speciali sells from the same pack and sells out with it.
--
-- A replay changes nothing: the shelf is already empty.

begin;

with emptied as (
  select product.id, product.stock_quantity as removed
  from public.products as product
  where product.slug = 'blast-pegasus-a-tr'
    and product.stock_quantity > 0
  for update
),
updated as (
  update public.products as product
  set stock_quantity = 0
  from emptied
  where emptied.id = product.id
  returning product.id, emptied.removed
)
insert into public.inventory_movements (product_id, delta, stock_after, reason, note)
select updated.id, -updated.removed, 0, 'manual_adjustment'::public.inventory_reason,
  'Rettifica: Blast Pegasus non a magazzino (09/10/2026)'
from updated;

commit;
