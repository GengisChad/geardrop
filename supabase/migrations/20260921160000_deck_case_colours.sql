-- The deck case, 2026-09-21: seven colours of one accessory in "Accessori", €20 each, with no
-- stock limit. Each colour is its own product (own stock, Stripe price and order line); the shop
-- lists the family once and the product page offers the colours (src/lib/commerce/variants.ts).
-- It is printed in 3D and not a Hasbro product: the shop says so on its page and never names a
-- brand for it.
--
-- Catalogue copy, images, specs and relations come from src/data/catalog.ts through
-- scripts/generate-supabase-seed.ts; this mirrors the same rows into the live database.

begin;

with seed(category_slug, slug, sku, stock_quantity, availability_override, preorder_allocation, name, tagline, description, price_cents, compare_at_price_cents, blade_type, rating, review_count, sort_order) as (
  values
  ('accessori', 'porta-deck-giallo', 'PORTA-DECK-GIALLO', 9999, null::public.availability_override, 0, 'Porta Deck Giallo', 'Tre trottole al sicuro. Anche Expanded e Infinity.', 'Il porta deck tiene un deck completo di Beyblade X: tre scomparti, uno per trottola, ognuno con la sua chiusura a clip. Entrano anche i bey Expanded e Infinity. Stampato in 3D. Accessorio non ufficiale: non è prodotto né certificato da Hasbro.', 2000, null, null, 0, 0, 14),
  ('accessori', 'porta-deck-verde-lime', 'PORTA-DECK-VERDE-LIME', 9999, null::public.availability_override, 0, 'Porta Deck Verde lime', 'Tre trottole al sicuro. Anche Expanded e Infinity.', 'Il porta deck tiene un deck completo di Beyblade X: tre scomparti, uno per trottola, ognuno con la sua chiusura a clip. Entrano anche i bey Expanded e Infinity. Stampato in 3D. Accessorio non ufficiale: non è prodotto né certificato da Hasbro.', 2000, null, null, 0, 0, 15),
  ('accessori', 'porta-deck-azzurro', 'PORTA-DECK-AZZURRO', 9999, null::public.availability_override, 0, 'Porta Deck Azzurro', 'Tre trottole al sicuro. Anche Expanded e Infinity.', 'Il porta deck tiene un deck completo di Beyblade X: tre scomparti, uno per trottola, ognuno con la sua chiusura a clip. Entrano anche i bey Expanded e Infinity. Stampato in 3D. Accessorio non ufficiale: non è prodotto né certificato da Hasbro.', 2000, null, null, 0, 0, 16),
  ('accessori', 'porta-deck-blu', 'PORTA-DECK-BLU', 9999, null::public.availability_override, 0, 'Porta Deck Blu', 'Tre trottole al sicuro. Anche Expanded e Infinity.', 'Il porta deck tiene un deck completo di Beyblade X: tre scomparti, uno per trottola, ognuno con la sua chiusura a clip. Entrano anche i bey Expanded e Infinity. Stampato in 3D. Accessorio non ufficiale: non è prodotto né certificato da Hasbro.', 2000, null, null, 0, 0, 17),
  ('accessori', 'porta-deck-rosa', 'PORTA-DECK-ROSA', 9999, null::public.availability_override, 0, 'Porta Deck Rosa', 'Tre trottole al sicuro. Anche Expanded e Infinity.', 'Il porta deck tiene un deck completo di Beyblade X: tre scomparti, uno per trottola, ognuno con la sua chiusura a clip. Entrano anche i bey Expanded e Infinity. Stampato in 3D. Accessorio non ufficiale: non è prodotto né certificato da Hasbro.', 2000, null, null, 0, 0, 18),
  ('accessori', 'porta-deck-fucsia', 'PORTA-DECK-FUCSIA', 9999, null::public.availability_override, 0, 'Porta Deck Fucsia', 'Tre trottole al sicuro. Anche Expanded e Infinity.', 'Il porta deck tiene un deck completo di Beyblade X: tre scomparti, uno per trottola, ognuno con la sua chiusura a clip. Entrano anche i bey Expanded e Infinity. Stampato in 3D. Accessorio non ufficiale: non è prodotto né certificato da Hasbro.', 2000, null, null, 0, 0, 19),
  ('accessori', 'porta-deck-bianco', 'PORTA-DECK-BIANCO', 9999, null::public.availability_override, 0, 'Porta Deck Bianco', 'Tre trottole al sicuro. Anche Expanded e Infinity.', 'Il porta deck tiene un deck completo di Beyblade X: tre scomparti, uno per trottola, ognuno con la sua chiusura a clip. Entrano anche i bey Expanded e Infinity. Stampato in 3D. Accessorio non ufficiale: non è prodotto né certificato da Hasbro.', 2000, null, null, 0, 0, 20)
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
  ('porta-deck-giallo', '/products/porta-deck-giallo.webp', 1000, 1000, 'Porta deck giallo con la scritta Beyblade X in nero e tre scomparti a clip', 0),
  ('porta-deck-giallo', '/products/porta-deck-colori.webp', 1000, 1000, 'I sette porta deck: giallo, verde lime, azzurro, blu, rosa, fucsia e bianco', 1),
  ('porta-deck-verde-lime', '/products/porta-deck-verde-lime.webp', 1000, 1000, 'Porta deck verde lime con la scritta Beyblade X in nero e tre scomparti a clip', 0),
  ('porta-deck-verde-lime', '/products/porta-deck-colori.webp', 1000, 1000, 'I sette porta deck: giallo, verde lime, azzurro, blu, rosa, fucsia e bianco', 1),
  ('porta-deck-azzurro', '/products/porta-deck-azzurro.webp', 1000, 1000, 'Porta deck azzurro con la scritta Beyblade X in bianco e tre scomparti a clip', 0),
  ('porta-deck-azzurro', '/products/porta-deck-colori.webp', 1000, 1000, 'I sette porta deck: giallo, verde lime, azzurro, blu, rosa, fucsia e bianco', 1),
  ('porta-deck-blu', '/products/porta-deck-blu.webp', 1000, 1000, 'Porta deck blu con la scritta Beyblade X in bianco e tre scomparti a clip', 0),
  ('porta-deck-blu', '/products/porta-deck-colori.webp', 1000, 1000, 'I sette porta deck: giallo, verde lime, azzurro, blu, rosa, fucsia e bianco', 1),
  ('porta-deck-rosa', '/products/porta-deck-rosa.webp', 1000, 1000, 'Porta deck rosa con la scritta Beyblade X in bianco e tre scomparti a clip', 0),
  ('porta-deck-rosa', '/products/porta-deck-colori.webp', 1000, 1000, 'I sette porta deck: giallo, verde lime, azzurro, blu, rosa, fucsia e bianco', 1),
  ('porta-deck-fucsia', '/products/porta-deck-fucsia.webp', 1000, 1000, 'Porta deck fucsia con la scritta Beyblade X in bianco e tre scomparti a clip', 0),
  ('porta-deck-fucsia', '/products/porta-deck-colori.webp', 1000, 1000, 'I sette porta deck: giallo, verde lime, azzurro, blu, rosa, fucsia e bianco', 1),
  ('porta-deck-bianco', '/products/porta-deck-bianco.webp', 1000, 1000, 'Porta deck bianco con la scritta Beyblade X in viola e tre scomparti a clip', 0),
  ('porta-deck-bianco', '/products/porta-deck-colori.webp', 1000, 1000, 'I sette porta deck: giallo, verde lime, azzurro, blu, rosa, fucsia e bianco', 1)
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
  ('porta-deck-giallo', 'Tipo', 'Porta deck', 0),
  ('porta-deck-giallo', 'Produttore', 'Non ufficiale, non prodotto da Hasbro', 1),
  ('porta-deck-giallo', 'Compatibilità', 'Beyblade X, compresi Expanded e Infinity', 2),
  ('porta-deck-giallo', 'Scomparti', '3, uno per trottola', 3),
  ('porta-deck-giallo', 'Colore', 'Giallo', 4),
  ('porta-deck-giallo', 'Materiale', 'Plastica stampata in 3D', 5),
  ('porta-deck-giallo', 'Nota', 'Trottole non incluse', 6),
  ('porta-deck-verde-lime', 'Tipo', 'Porta deck', 0),
  ('porta-deck-verde-lime', 'Produttore', 'Non ufficiale, non prodotto da Hasbro', 1),
  ('porta-deck-verde-lime', 'Compatibilità', 'Beyblade X, compresi Expanded e Infinity', 2),
  ('porta-deck-verde-lime', 'Scomparti', '3, uno per trottola', 3),
  ('porta-deck-verde-lime', 'Colore', 'Verde lime', 4),
  ('porta-deck-verde-lime', 'Materiale', 'Plastica stampata in 3D', 5),
  ('porta-deck-verde-lime', 'Nota', 'Trottole non incluse', 6),
  ('porta-deck-azzurro', 'Tipo', 'Porta deck', 0),
  ('porta-deck-azzurro', 'Produttore', 'Non ufficiale, non prodotto da Hasbro', 1),
  ('porta-deck-azzurro', 'Compatibilità', 'Beyblade X, compresi Expanded e Infinity', 2),
  ('porta-deck-azzurro', 'Scomparti', '3, uno per trottola', 3),
  ('porta-deck-azzurro', 'Colore', 'Azzurro', 4),
  ('porta-deck-azzurro', 'Materiale', 'Plastica stampata in 3D', 5),
  ('porta-deck-azzurro', 'Nota', 'Trottole non incluse', 6),
  ('porta-deck-blu', 'Tipo', 'Porta deck', 0),
  ('porta-deck-blu', 'Produttore', 'Non ufficiale, non prodotto da Hasbro', 1),
  ('porta-deck-blu', 'Compatibilità', 'Beyblade X, compresi Expanded e Infinity', 2),
  ('porta-deck-blu', 'Scomparti', '3, uno per trottola', 3),
  ('porta-deck-blu', 'Colore', 'Blu', 4),
  ('porta-deck-blu', 'Materiale', 'Plastica stampata in 3D', 5),
  ('porta-deck-blu', 'Nota', 'Trottole non incluse', 6),
  ('porta-deck-rosa', 'Tipo', 'Porta deck', 0),
  ('porta-deck-rosa', 'Produttore', 'Non ufficiale, non prodotto da Hasbro', 1),
  ('porta-deck-rosa', 'Compatibilità', 'Beyblade X, compresi Expanded e Infinity', 2),
  ('porta-deck-rosa', 'Scomparti', '3, uno per trottola', 3),
  ('porta-deck-rosa', 'Colore', 'Rosa', 4),
  ('porta-deck-rosa', 'Materiale', 'Plastica stampata in 3D', 5),
  ('porta-deck-rosa', 'Nota', 'Trottole non incluse', 6),
  ('porta-deck-fucsia', 'Tipo', 'Porta deck', 0),
  ('porta-deck-fucsia', 'Produttore', 'Non ufficiale, non prodotto da Hasbro', 1),
  ('porta-deck-fucsia', 'Compatibilità', 'Beyblade X, compresi Expanded e Infinity', 2),
  ('porta-deck-fucsia', 'Scomparti', '3, uno per trottola', 3),
  ('porta-deck-fucsia', 'Colore', 'Fucsia', 4),
  ('porta-deck-fucsia', 'Materiale', 'Plastica stampata in 3D', 5),
  ('porta-deck-fucsia', 'Nota', 'Trottole non incluse', 6),
  ('porta-deck-bianco', 'Tipo', 'Porta deck', 0),
  ('porta-deck-bianco', 'Produttore', 'Non ufficiale, non prodotto da Hasbro', 1),
  ('porta-deck-bianco', 'Compatibilità', 'Beyblade X, compresi Expanded e Infinity', 2),
  ('porta-deck-bianco', 'Scomparti', '3, uno per trottola', 3),
  ('porta-deck-bianco', 'Colore', 'Bianco', 4),
  ('porta-deck-bianco', 'Materiale', 'Plastica stampata in 3D', 5),
  ('porta-deck-bianco', 'Nota', 'Trottole non incluse', 6)
)
insert into public.product_specs (product_id, label, value, sort_order)
select product.id, seed.label, seed.value, seed.sort_order
from seed join public.products as product on product.slug = seed.product_slug
on conflict (product_id, sort_order) do update set
  label = excluded.label,
  value = excluded.value;
with seed(product_slug, title, description, sort_order) as (
  values
  ('porta-deck-giallo', 'Un deck completo', 'Tre scomparti, uno per ogni trottola', 0),
  ('porta-deck-giallo', 'Anche Expanded e Infinity', 'Compatibile con i bey Expanded e Infinity', 1),
  ('porta-deck-giallo', 'Chiusura a clip', 'Ogni scomparto si chiude con la sua clip', 2),
  ('porta-deck-giallo', 'Sette colori', 'Giallo, verde lime, azzurro, blu, rosa, fucsia e bianco', 3),
  ('porta-deck-verde-lime', 'Un deck completo', 'Tre scomparti, uno per ogni trottola', 0),
  ('porta-deck-verde-lime', 'Anche Expanded e Infinity', 'Compatibile con i bey Expanded e Infinity', 1),
  ('porta-deck-verde-lime', 'Chiusura a clip', 'Ogni scomparto si chiude con la sua clip', 2),
  ('porta-deck-verde-lime', 'Sette colori', 'Giallo, verde lime, azzurro, blu, rosa, fucsia e bianco', 3),
  ('porta-deck-azzurro', 'Un deck completo', 'Tre scomparti, uno per ogni trottola', 0),
  ('porta-deck-azzurro', 'Anche Expanded e Infinity', 'Compatibile con i bey Expanded e Infinity', 1),
  ('porta-deck-azzurro', 'Chiusura a clip', 'Ogni scomparto si chiude con la sua clip', 2),
  ('porta-deck-azzurro', 'Sette colori', 'Giallo, verde lime, azzurro, blu, rosa, fucsia e bianco', 3),
  ('porta-deck-blu', 'Un deck completo', 'Tre scomparti, uno per ogni trottola', 0),
  ('porta-deck-blu', 'Anche Expanded e Infinity', 'Compatibile con i bey Expanded e Infinity', 1),
  ('porta-deck-blu', 'Chiusura a clip', 'Ogni scomparto si chiude con la sua clip', 2),
  ('porta-deck-blu', 'Sette colori', 'Giallo, verde lime, azzurro, blu, rosa, fucsia e bianco', 3),
  ('porta-deck-rosa', 'Un deck completo', 'Tre scomparti, uno per ogni trottola', 0),
  ('porta-deck-rosa', 'Anche Expanded e Infinity', 'Compatibile con i bey Expanded e Infinity', 1),
  ('porta-deck-rosa', 'Chiusura a clip', 'Ogni scomparto si chiude con la sua clip', 2),
  ('porta-deck-rosa', 'Sette colori', 'Giallo, verde lime, azzurro, blu, rosa, fucsia e bianco', 3),
  ('porta-deck-fucsia', 'Un deck completo', 'Tre scomparti, uno per ogni trottola', 0),
  ('porta-deck-fucsia', 'Anche Expanded e Infinity', 'Compatibile con i bey Expanded e Infinity', 1),
  ('porta-deck-fucsia', 'Chiusura a clip', 'Ogni scomparto si chiude con la sua clip', 2),
  ('porta-deck-fucsia', 'Sette colori', 'Giallo, verde lime, azzurro, blu, rosa, fucsia e bianco', 3),
  ('porta-deck-bianco', 'Un deck completo', 'Tre scomparti, uno per ogni trottola', 0),
  ('porta-deck-bianco', 'Anche Expanded e Infinity', 'Compatibile con i bey Expanded e Infinity', 1),
  ('porta-deck-bianco', 'Chiusura a clip', 'Ogni scomparto si chiude con la sua clip', 2),
  ('porta-deck-bianco', 'Sette colori', 'Giallo, verde lime, azzurro, blu, rosa, fucsia e bianco', 3)
)
insert into public.product_features (product_id, title, description, sort_order)
select product.id, seed.title, seed.description, seed.sort_order
from seed join public.products as product on product.slug = seed.product_slug
on conflict (product_id, sort_order) do update set
  title = excluded.title,
  description = excluded.description;
with seed(product_slug, content, sort_order) as (
  values
  ('porta-deck-giallo', '1 × Porta Deck Giallo (trottole non incluse)', 0),
  ('porta-deck-verde-lime', '1 × Porta Deck Verde lime (trottole non incluse)', 0),
  ('porta-deck-azzurro', '1 × Porta Deck Azzurro (trottole non incluse)', 0),
  ('porta-deck-blu', '1 × Porta Deck Blu (trottole non incluse)', 0),
  ('porta-deck-rosa', '1 × Porta Deck Rosa (trottole non incluse)', 0),
  ('porta-deck-fucsia', '1 × Porta Deck Fucsia (trottole non incluse)', 0),
  ('porta-deck-bianco', '1 × Porta Deck Bianco (trottole non incluse)', 0)
)
insert into public.product_box_contents (product_id, content, sort_order)
select product.id, seed.content, seed.sort_order
from seed join public.products as product on product.slug = seed.product_slug
on conflict (product_id, sort_order) do update set
  content = excluded.content;
with seed(product_slug, related_slug, sort_order) as (
  values
  ('porta-deck-giallo', 'hurricane-enlil-is-7-55t', 0),
  ('porta-deck-giallo', 'tread-croc-tq-5-50gn', 1),
  ('porta-deck-giallo', 'cobalt-drake-4-60f', 2),
  ('porta-deck-verde-lime', 'hurricane-enlil-is-7-55t', 0),
  ('porta-deck-verde-lime', 'tread-croc-tq-5-50gn', 1),
  ('porta-deck-verde-lime', 'cobalt-drake-4-60f', 2),
  ('porta-deck-azzurro', 'hurricane-enlil-is-7-55t', 0),
  ('porta-deck-azzurro', 'tread-croc-tq-5-50gn', 1),
  ('porta-deck-azzurro', 'cobalt-drake-4-60f', 2),
  ('porta-deck-blu', 'hurricane-enlil-is-7-55t', 0),
  ('porta-deck-blu', 'tread-croc-tq-5-50gn', 1),
  ('porta-deck-blu', 'cobalt-drake-4-60f', 2),
  ('porta-deck-rosa', 'hurricane-enlil-is-7-55t', 0),
  ('porta-deck-rosa', 'tread-croc-tq-5-50gn', 1),
  ('porta-deck-rosa', 'cobalt-drake-4-60f', 2),
  ('porta-deck-fucsia', 'hurricane-enlil-is-7-55t', 0),
  ('porta-deck-fucsia', 'tread-croc-tq-5-50gn', 1),
  ('porta-deck-fucsia', 'cobalt-drake-4-60f', 2),
  ('porta-deck-bianco', 'hurricane-enlil-is-7-55t', 0),
  ('porta-deck-bianco', 'tread-croc-tq-5-50gn', 1),
  ('porta-deck-bianco', 'cobalt-drake-4-60f', 2)
)
insert into public.product_relations (product_id, related_product_id, relation_type, sort_order)
select product.id, related.id, 'related'::public.product_relation_type, seed.sort_order
from seed
join public.products as product on product.slug = seed.product_slug
join public.products as related on related.slug = seed.related_slug
on conflict (product_id, related_product_id, relation_type) do update set
  sort_order = excluded.sort_order;

-- "No limit" is a counter high enough never to run out (UNLIMITED_STOCK); the ledger explains it.
insert into public.inventory_movements (product_id, delta, stock_after, reason, note)
select product.id, product.stock_quantity, product.stock_quantity, 'initial'::public.inventory_reason,
  'Porta deck senza limite di scorte: contatore alto, il negozio non mostra il numero'
from public.products as product
where product.slug in ('porta-deck-giallo', 'porta-deck-verde-lime', 'porta-deck-azzurro', 'porta-deck-blu', 'porta-deck-rosa', 'porta-deck-fucsia', 'porta-deck-bianco')
  and product.stock_quantity > 0
  and not exists (select 1 from public.inventory_movements as movement where movement.product_id = product.id);

-- The shop now also sells a compatible accessory, so the home trust line names what is original.
-- An owner who already rewrote it keeps their words.
update public.homepage_sections
set title = 'Trottole, lanciatori e stadi Hasbro originali. Consegna in 1-5 giorni lavorativi, spedizione solo in Italia.'
where section_key = 'trust'
  and title = 'Prodotti Hasbro originali. Consegna in 1-5 giorni lavorativi, spedizione solo in Italia.';

commit;
