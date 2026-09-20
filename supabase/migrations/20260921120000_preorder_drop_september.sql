-- The 2026-09-21 drop: five pre-order pieces lead the shop, nine allocations each, and the three
-- Infinity Starters keep their place right below them instead of leading the homepage.
--
-- Catalogue copy, images, specs and relations come from src/data/catalog.ts through
-- scripts/generate-supabase-seed.ts; this mirrors the same rows into the live database.

begin;

with seed(category_slug, slug, sku, stock_quantity, availability_override, preorder_allocation, name, tagline, description, price_cents, compare_at_price_cents, blade_type, rating, review_count, sort_order) as (
  values
  ('beyblade-x', 'cobalt-drake-4-60f', 'COBALT-DRAKE-4-60F', 0, 'preorder'::public.availability_override, 9, 'Cobalt Drake 4-60F', 'Attacco BX. Lame di cristallo.', 'Cobalt Drake 4-60F è una trottola d''attacco della linea BX: la blade trasparente dal profilo affilato concentra il peso sulle punte, il Ratchet 4-60 tiene l''assetto basso e il Bit F (Flat) la lancia in traiettorie rapide e aggressive lungo il bordo dello stadio. Richiede lanciatore e Beystadium Beyblade X (venduti separatamente).', 2000, null, 'attacco', 0, 0, 0),
  ('beyblade-x', 'mirage-clock-9-65b', 'MIRAGE-CLOCK-9-65B', 0, 'preorder'::public.availability_override, 9, 'Mirage Clock 9-65B', 'Stamina UX. Gira finché l''altro si ferma.', 'Mirage Clock 9-65B è una trottola stamina della linea UX: la blade rotonda con corona dentata distribuisce il peso sul bordo per restare in piedi a lungo, il Ratchet 9-65 alza l''assetto e il Bit B (Ball) riduce l''attrito sulla punta. Richiede lanciatore e Beystadium Beyblade X (venduti separatamente).', 1950, null, 'stamina', 0, 0, 1),
  ('beyblade-x', 'suppress-superion-0-70lp', 'SUPPRESS-SUPERION-0-70LP', 0, 'preorder'::public.availability_override, 9, 'Suppress Superion 0-70LP', 'Bilanciata BX. Tiene il centro.', 'Suppress Superion 0-70LP è una trottola bilanciata della linea BX: la blade con il leone dorato unisce massa e superfici di contatto larghe per assorbire gli urti, mentre il Ratchet 0-70 e il Bit LP (Low Point) la tengono alta sul centro dello stadio, dove l''attacco avversario perde efficacia. Lo starter include il lanciatore. Richiede un Beystadium Beyblade X (venduto separatamente).', 2500, null, 'bilanciato', 0, 0, 2),
  ('beyblade-x', 'strike-dran-4-50ff', 'STRIKE-DRAN-4-50FF', 0, 'preorder'::public.availability_override, 9, 'Strike Dran 4-50FF', 'Attacco BX. Blade interna in metallo.', 'Strike Dran 4-50FF è una trottola d''attacco della linea BX: la blade monta una lama interna in metallo che porta la massa verso il centro, il Ratchet 4-50 la tiene bassa e il Bit FF (Flat Force) la spinge in corse veloci sul bordo, pronte a colpire di taglio. Lo starter include il lanciatore. Richiede un Beystadium Beyblade X (venduto separatamente).', 2500, null, 'attacco', 0, 0, 3),
  ('beyblade-x', 'tread-croc-tq-5-50gn', 'TREAD-CROC-TQ-5-50GN', 0, 'preorder'::public.availability_override, 9, 'Tread Croc TQ 5-50GN', 'Attacco CX. Quattro pezzi da combinare.', 'Tread Croc TQ 5-50GN è una trottola d''attacco della linea CX: la blade si scompone in quattro pezzi — lock chip, main blade, assist blade e il resto dell''assetto — per costruire combinazioni su misura, con Ratchet 5-50 e Bit GN. Lo starter include il lanciatore. Richiede un Beystadium Beyblade X (venduto separatamente).', 2500, null, 'attacco', 0, 0, 4)
)
insert into public.products (
  category_id, slug, sku, name, tagline, description, price_cents,
  compare_at_price_cents, publication_status, active, stock_quantity,
  availability_override, preorder_allocation, allow_backorder, blade_type, rating, review_count, sort_order
)
select
  category.id,
  seed.slug,
  seed.sku,
  seed.name,
  seed.tagline,
  seed.description,
  seed.price_cents,
  seed.compare_at_price_cents::integer,
  'published'::public.publication_status,
  true,
  seed.stock_quantity,
  seed.availability_override,
  seed.preorder_allocation,
  -- Sold out means pre-order, never a closed sale (migration 20260917140000).
  true as allow_backorder,
  seed.blade_type::public.blade_type,
  seed.rating,
  seed.review_count,
  seed.sort_order
from seed
join public.categories as category on category.slug = seed.category_slug
on conflict (slug) do update set
  category_id = excluded.category_id,
  sku = excluded.sku,
  name = excluded.name,
  tagline = excluded.tagline,
  description = excluded.description,
  price_cents = excluded.price_cents,
  compare_at_price_cents = excluded.compare_at_price_cents,
  blade_type = excluded.blade_type,
  rating = excluded.rating,
  review_count = excluded.review_count,
  sort_order = excluded.sort_order;
with seed(product_slug, src, width, height, alt, sort_order) as (
  values
  ('cobalt-drake-4-60f', '/products/cobalt-drake-4-60f.webp', 1000, 1000, 'Confezione Beyblade X Cobalt Drake 4-60F con la trottola argentata trasparente accanto', 0),
  ('mirage-clock-9-65b', '/products/mirage-clock-9-65b.webp', 1000, 1000, 'Confezione Beyblade X Mirage Clock 9-65B con la trottola verde acqua e rosa accanto', 0),
  ('suppress-superion-0-70lp', '/products/suppress-superion-0-70lp.webp', 1000, 1000, 'Confezione Beyblade X Suppress Superion 0-70LP con trottola bianca e oro', 0),
  ('strike-dran-4-50ff', '/products/strike-dran-4-50ff.webp', 1000, 1000, 'Confezione Beyblade X Strike Dran 4-50FF con trottola blu e argento', 0),
  ('tread-croc-tq-5-50gn', '/products/tread-croc-tq-5-50gn.webp', 1000, 1000, 'Confezione Beyblade X Tread Croc TQ 5-50GN della linea CX con trottola dorata e verde', 0)
)
insert into public.product_images (product_id, src, width, height, alt, sort_order, published, is_primary)
select product.id, seed.src, seed.width, seed.height, seed.alt, seed.sort_order, true, seed.sort_order = 0
from seed
join public.products as product on product.slug = seed.product_slug
on conflict (product_id, sort_order) do update set
  src = excluded.src,
  width = excluded.width,
  height = excluded.height,
  alt = excluded.alt;
with seed(product_slug, label, value, sort_order) as (
  values
  ('cobalt-drake-4-60f', 'Tipo', 'Attacco', 0),
  ('cobalt-drake-4-60f', 'Produttore', 'Hasbro (prodotto originale)', 1),
  ('cobalt-drake-4-60f', 'Sistema', 'Beyblade X', 2),
  ('cobalt-drake-4-60f', 'Linea', 'BX (Basic Line)', 3),
  ('cobalt-drake-4-60f', 'Codice', '4-60F', 4),
  ('cobalt-drake-4-60f', 'Componenti', '1 trottola', 5),
  ('cobalt-drake-4-60f', 'Nota', 'Richiede lanciatore e Beystadium (venduti a parte)', 6),
  ('mirage-clock-9-65b', 'Tipo', 'Stamina', 0),
  ('mirage-clock-9-65b', 'Produttore', 'Hasbro (prodotto originale)', 1),
  ('mirage-clock-9-65b', 'Sistema', 'Beyblade X', 2),
  ('mirage-clock-9-65b', 'Linea', 'UX (Unique Line)', 3),
  ('mirage-clock-9-65b', 'Codice', '9-65B', 4),
  ('mirage-clock-9-65b', 'Componenti', '1 trottola', 5),
  ('mirage-clock-9-65b', 'Nota', 'Richiede lanciatore e Beystadium (venduti a parte)', 6),
  ('suppress-superion-0-70lp', 'Tipo', 'Bilanciata', 0),
  ('suppress-superion-0-70lp', 'Produttore', 'Hasbro (prodotto originale)', 1),
  ('suppress-superion-0-70lp', 'Sistema', 'Beyblade X', 2),
  ('suppress-superion-0-70lp', 'Linea', 'BX (Basic Line)', 3),
  ('suppress-superion-0-70lp', 'Codice', '0-70LP', 4),
  ('suppress-superion-0-70lp', 'Componenti', '1 trottola, 1 lanciatore', 5),
  ('suppress-superion-0-70lp', 'Nota', 'Richiede un Beystadium (venduto a parte)', 6),
  ('strike-dran-4-50ff', 'Tipo', 'Attacco', 0),
  ('strike-dran-4-50ff', 'Produttore', 'Hasbro (prodotto originale)', 1),
  ('strike-dran-4-50ff', 'Sistema', 'Beyblade X', 2),
  ('strike-dran-4-50ff', 'Linea', 'BX (Basic Line)', 3),
  ('strike-dran-4-50ff', 'Codice', '4-50FF', 4),
  ('strike-dran-4-50ff', 'Componenti', '1 trottola, 1 lanciatore', 5),
  ('strike-dran-4-50ff', 'Nota', 'Richiede un Beystadium (venduto a parte)', 6),
  ('tread-croc-tq-5-50gn', 'Tipo', 'Attacco', 0),
  ('tread-croc-tq-5-50gn', 'Produttore', 'Hasbro (prodotto originale)', 1),
  ('tread-croc-tq-5-50gn', 'Sistema', 'Beyblade X', 2),
  ('tread-croc-tq-5-50gn', 'Linea', 'CX (Custom Line)', 3),
  ('tread-croc-tq-5-50gn', 'Codice', 'TQ 5-50GN', 4),
  ('tread-croc-tq-5-50gn', 'Componenti', '1 trottola, 1 lanciatore', 5),
  ('tread-croc-tq-5-50gn', 'Nota', 'Richiede un Beystadium (venduto a parte)', 6)
)
insert into public.product_specs (product_id, label, value, sort_order)
select product.id, seed.label, seed.value, seed.sort_order
from seed join public.products as product on product.slug = seed.product_slug
on conflict (product_id, sort_order) do update set
  label = excluded.label,
  value = excluded.value;
with seed(product_slug, title, description, sort_order) as (
  values
  ('cobalt-drake-4-60f', 'Bit Flat', 'Punta piatta per movimenti rapidi e aggressivi', 0),
  ('cobalt-drake-4-60f', 'Ratchet 4-60', 'Assetto basso, pensato per l''attacco', 1),
  ('cobalt-drake-4-60f', 'Blade trasparente', 'Profilo affilato con il peso sulle punte', 2),
  ('cobalt-drake-4-60f', 'Compatibile Beyblade X', 'Blade, Ratchet e Bit intercambiabili con la serie', 3),
  ('mirage-clock-9-65b', 'Bit Ball', 'Punta sferica: poco attrito, tanta resistenza', 0),
  ('mirage-clock-9-65b', 'Peso sul bordo', 'La corona dentata tiene la rotazione stabile', 1),
  ('mirage-clock-9-65b', 'Linea UX', 'Blade dal profilo esclusivo della Unique Line', 2),
  ('mirage-clock-9-65b', 'Compatibile Beyblade X', 'Blade, Ratchet e Bit intercambiabili con la serie', 3),
  ('suppress-superion-0-70lp', 'Bit Low Point', 'Punta bassa che difende il centro dello stadio', 0),
  ('suppress-superion-0-70lp', 'Ratchet 0-70', 'Profilo alto per incassare gli urti', 1),
  ('suppress-superion-0-70lp', 'Starter completo', 'Include il lanciatore', 2),
  ('suppress-superion-0-70lp', 'Compatibile Beyblade X', 'Blade, Ratchet e Bit intercambiabili con la serie', 3),
  ('strike-dran-4-50ff', 'Lama interna in metallo', 'Massa concentrata al centro della blade', 0),
  ('strike-dran-4-50ff', 'Bit Flat Force', 'Corse rapide sul bordo per colpire di taglio', 1),
  ('strike-dran-4-50ff', 'Starter completo', 'Include il lanciatore', 2),
  ('strike-dran-4-50ff', 'Compatibile Beyblade X', 'Blade, Ratchet e Bit intercambiabili con la serie', 3),
  ('tread-croc-tq-5-50gn', 'Blade in quattro pezzi', 'Lock chip e blade scomponibili per assetti su misura', 0),
  ('tread-croc-tq-5-50gn', 'Linea CX', 'Combina i pezzi con le altre trottole Custom Line', 1),
  ('tread-croc-tq-5-50gn', 'Starter completo', 'Include il lanciatore', 2),
  ('tread-croc-tq-5-50gn', 'Compatibile Beyblade X', 'Blade, Ratchet e Bit intercambiabili con la serie', 3)
)
insert into public.product_features (product_id, title, description, sort_order)
select product.id, seed.title, seed.description, seed.sort_order
from seed join public.products as product on product.slug = seed.product_slug
on conflict (product_id, sort_order) do update set
  title = excluded.title,
  description = excluded.description;
with seed(product_slug, content, sort_order) as (
  values
  ('cobalt-drake-4-60f', '1 × Trottola Cobalt Drake 4-60F', 0),
  ('cobalt-drake-4-60f', 'Manuale', 1),
  ('mirage-clock-9-65b', '1 × Trottola Mirage Clock 9-65B', 0),
  ('mirage-clock-9-65b', 'Manuale', 1),
  ('suppress-superion-0-70lp', '1 × Trottola Suppress Superion 0-70LP', 0),
  ('suppress-superion-0-70lp', '1 × Lanciatore con ripcord', 1),
  ('suppress-superion-0-70lp', 'Manuale', 2),
  ('strike-dran-4-50ff', '1 × Trottola Strike Dran 4-50FF', 0),
  ('strike-dran-4-50ff', '1 × Lanciatore con ripcord', 1),
  ('strike-dran-4-50ff', 'Manuale', 2),
  ('tread-croc-tq-5-50gn', '1 × Trottola Tread Croc TQ 5-50GN', 0),
  ('tread-croc-tq-5-50gn', '1 × Lanciatore con ripcord', 1),
  ('tread-croc-tq-5-50gn', 'Manuale', 2)
)
insert into public.product_box_contents (product_id, content, sort_order)
select product.id, seed.content, seed.sort_order
from seed join public.products as product on product.slug = seed.product_slug
on conflict (product_id, sort_order) do update set
  content = excluded.content;
with seed(product_slug, tag) as (
  values
  ('cobalt-drake-4-60f', 'novita'),
  ('mirage-clock-9-65b', 'novita'),
  ('suppress-superion-0-70lp', 'novita'),
  ('strike-dran-4-50ff', 'novita'),
  ('tread-croc-tq-5-50gn', 'novita')
)
insert into public.product_tags (product_id, tag)
select product.id, seed.tag::public.promo_tag
from seed join public.products as product on product.slug = seed.product_slug
on conflict (product_id, tag) do nothing;
with seed(product_slug, related_slug, sort_order) as (
  values
  ('cobalt-drake-4-60f', 'strike-dran-4-50ff', 0),
  ('cobalt-drake-4-60f', 'tread-croc-tq-5-50gn', 1),
  ('cobalt-drake-4-60f', 'mirage-clock-9-65b', 2),
  ('mirage-clock-9-65b', 'suppress-superion-0-70lp', 0),
  ('mirage-clock-9-65b', 'cobalt-drake-4-60f', 1),
  ('mirage-clock-9-65b', 'shatter-horus-9-65gb', 2),
  ('suppress-superion-0-70lp', 'strike-dran-4-50ff', 0),
  ('suppress-superion-0-70lp', 'mirage-clock-9-65b', 1),
  ('suppress-superion-0-70lp', 'tread-croc-tq-5-50gn', 2),
  ('strike-dran-4-50ff', 'cobalt-drake-4-60f', 0),
  ('strike-dran-4-50ff', 'suppress-superion-0-70lp', 1),
  ('strike-dran-4-50ff', 'tread-croc-tq-5-50gn', 2),
  ('tread-croc-tq-5-50gn', 'hurricane-enlil-is-7-55t', 0),
  ('tread-croc-tq-5-50gn', 'strike-dran-4-50ff', 1),
  ('tread-croc-tq-5-50gn', 'cobalt-drake-4-60f', 2)
)
insert into public.product_relations (product_id, related_product_id, relation_type, sort_order)
select product.id, related.id, 'related'::public.product_relation_type, seed.sort_order
from seed
join public.products as product on product.slug = seed.product_slug
join public.products as related on related.slug = seed.related_slug
on conflict (product_id, related_product_id, relation_type) do update set
  sort_order = excluded.sort_order;

-- The homepage deals the newest releases first: only the new drop carries the "novita" tag now.
delete from public.product_tags
where tag = 'novita'::public.promo_tag
  and product_id in (select id from public.products where slug in ('glory-valkerion-lf', 'hurricane-enlil-is-7-55t', 'shatter-horus-9-65gb'));

-- The shop lists products in catalogue order, so the drop leads and the starters follow.
with seed(slug, sort_order) as (
  values
  ('cobalt-drake-4-60f', 0),
  ('mirage-clock-9-65b', 1),
  ('suppress-superion-0-70lp', 2),
  ('strike-dran-4-50ff', 3),
  ('tread-croc-tq-5-50gn', 4),
  ('glory-valkerion-lf', 5),
  ('hurricane-enlil-is-7-55t', 6),
  ('shatter-horus-9-65gb', 7),
  ('cobalt-dragoon-2-60c', 8),
  ('soar-phoenix-9-60gf', 9),
  ('saber-samurai-2-70l', 10),
  ('blast-pegasus-a-tr', 11),
  ('drop-attack-battle-set', 12),
  ('sneak-attack-battle-set', 13)
)
update public.products as target
set sort_order = seed.sort_order
from seed
where target.slug = seed.slug;

-- The six older pieces stop claiming a shelf they no longer have: they sell as open pre-orders,
-- which the automatic pre-order rule already supports (zero stock with allow_backorder). The
-- shelf they held is written off in the ledger so the movements still explain every number.
insert into public.inventory_movements(product_id, delta, stock_after, reason, note)
select id, -stock_quantity, 0, 'manual_adjustment'::public.inventory_reason,
  'Passaggio a pre-ordine aperto: la disponibilità dichiarata non era a magazzino'
from public.products
where slug in ('cobalt-dragoon-2-60c', 'soar-phoenix-9-60gf', 'saber-samurai-2-70l', 'blast-pegasus-a-tr',
               'drop-attack-battle-set', 'sneak-attack-battle-set')
  and stock_quantity > 0;

update public.products
set stock_quantity = 0,
    availability_override = null,
    preorder_allocation = 0,
    allow_backorder = true
where slug in ('cobalt-dragoon-2-60c', 'soar-phoenix-9-60gf', 'saber-samurai-2-70l', 'blast-pegasus-a-tr',
               'drop-attack-battle-set', 'sneak-attack-battle-set');

commit;
