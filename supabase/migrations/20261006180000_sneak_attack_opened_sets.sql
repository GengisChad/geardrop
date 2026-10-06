-- The Sneak Attack Battle Set is opened too (owner, 2026-10-06), and its pieces sell on Vinted
-- only: the green stadium alone, Rampart Aegis GB and Cutter Shinobi LF, for kids who search
-- there. None of them is a page on the site: draft and inactive stock items, like the Drop Attack
-- stadium. The Hasbro tops carry their ratchet inside the blade, so their names have no ratchet
-- number (GB and LF are the bits).
--
-- They join the opened-set model of 20261006160100: a piece's availability is the loose ones
-- plus the sealed sets, a piece sold takes a loose one first and opens a sealed set when none
-- is left. Nothing has been sold loose yet, so each piece starts at the sealed count.

begin;
select pg_advisory_xact_lock(hashtext('20261006180000_sneak_attack_opened_sets'));

insert into public.products (
  category_id, slug, sku, name, tagline, description, price_cents,
  publication_status, active, stock_quantity, allow_backorder, rating, review_count, sort_order
)
select set_product.category_id, piece.slug, piece.sku, piece.name, piece.tagline, piece.description, piece.price_cents,
  'draft'::public.publication_status, false, set_product.stock_quantity, false, 0, 0, 901
from public.products as set_product
cross join (values
  ('sneak-attack-arena', 'SNEAK-ATTACK-ARENA', 'Beystadium Sneak Attack (solo arena)',
   'L''arena verde del Sneak Attack Battle Set, senza trottole.',
   'Il Beystadium verde del Sneak Attack Battle Set, con il rail a scomparsa, venduto da solo dopo aver tolto Rampart Aegis e Cutter Shinobi. In vendita su Vinted, non sul sito.',
   2500),
  ('rampart-aegis-gb', 'RAMPART-AEGIS-GB', 'Rampart Aegis GB',
   'La trottola di stamina del Sneak Attack Battle Set.',
   'Rampart Aegis GB, trottola di stamina del Sneak Attack Battle Set Hasbro (lama con ratchet integrato, bit GB), estratta dal set e senza lanciatore. In vendita su Vinted, non sul sito.',
   1800),
  ('cutter-shinobi-lf', 'CUTTER-SHINOBI-LF', 'Cutter Shinobi LF',
   'La trottola d''attacco del Sneak Attack Battle Set.',
   'Cutter Shinobi LF, trottola d''attacco del Sneak Attack Battle Set Hasbro (lama con ratchet integrato, bit LF), estratta dal set e senza lanciatore. In vendita su Vinted, non sul sito.',
   1800)
) as piece(slug, sku, name, tagline, description, price_cents)
where set_product.slug = 'sneak-attack-battle-set'
on conflict (slug) do nothing;

insert into public.battle_set_parts (set_product_id, part_product_id)
select set_product.id, piece.id
from public.products as set_product
join public.products as piece on piece.slug in ('rampart-aegis-gb', 'cutter-shinobi-lf', 'sneak-attack-arena')
where set_product.slug = 'sneak-attack-battle-set'
on conflict do nothing;

commit;
