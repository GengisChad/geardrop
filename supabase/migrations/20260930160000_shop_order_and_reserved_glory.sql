-- 2026-09-30, the owner: the shop lists what sells and ships first, and everything that cannot
-- ship today at the bottom.
--
-- Glory Valkerion leads it. Of everything the shop can actually send it is the best seller — nine
-- pieces across eight orders, second only to Suppress Superion, which is sold out. One of its
-- pieces is already spoken for, so the shelf is 25 and not 26.

begin;

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('geardrop:shop-order:2026-09-30', 0)
);

with seed(slug, sort_order) as (
  values
  ('glory-valkerion-lf', 0),
  ('shatter-horus-9-65gb', 1),
  ('hurricane-enlil-is-7-55t', 2),
  ('hammer-incendio-3-70h', 3),
  ('shadow-shinobi-1-80mn', 4),
  ('wand-wizard-1-60r', 5),
  ('buster-dran-5-70db', 6),
  ('cobalt-dragoon-2-60c', 7),
  ('blast-pegasus-a-tr', 8),
  ('saber-samurai-2-70l', 9),
  ('drop-attack-battle-set', 10),
  ('sneak-attack-battle-set', 11),
  ('porta-deck-giallo', 12),
  ('porta-deck-verde-lime', 13),
  ('porta-deck-azzurro', 14),
  ('porta-deck-blu', 15),
  ('porta-deck-rosa', 16),
  ('porta-deck-fucsia', 17),
  ('porta-deck-bianco', 18),
  ('cobalt-drake-4-60f', 19),
  ('mirage-clock-9-65b', 20),
  ('suppress-superion-0-70lp', 21),
  ('strike-dran-4-50ff', 22),
  ('tread-croc-tq-5-50gn', 23),
  ('soar-phoenix-9-60gf', 24)
)
update public.products as target
set sort_order = seed.sort_order
from seed
where target.slug = seed.slug;

-- The reserved Glory leaves the shelf through the ledger, like any other piece that goes out.
with taken as (
  select id, stock_quantity - 1 as stock_after
  from public.products
  where slug = 'glory-valkerion-lf'
    and stock_quantity > 0
    and not exists (
      select 1 from public.inventory_movements as movement
      where movement.product_id = products.id
        and movement.note = 'Un pezzo prenotato fuori dal sito, 30/09/2026'
    )
)
, moved as (
  update public.products as product
  set stock_quantity = taken.stock_after
  from taken
  where product.id = taken.id
  returning product.id, taken.stock_after
)
insert into public.inventory_movements (product_id, delta, stock_after, reason, note)
select id, -1, stock_after, 'manual_adjustment'::public.inventory_reason,
  'Un pezzo prenotato fuori dal sito, 30/09/2026'
from moved;

commit;
