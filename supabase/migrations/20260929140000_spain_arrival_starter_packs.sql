-- The 2026-09-29 arrival from Spain: eight Beyblade X starter packs, 26 of each, on the shelf.
--
-- Every one is a Starter Pack (top plus ripcord launcher, Beystadium sold separately). Bit names,
-- ratchet heights and blade details come from beyblade.wiki and Fandom.
--
-- None of them carries a combat type. The owner's reason (2026-09-29): a Beyblade's type depends
-- on how it is built and played, above all in the CX line where the blade comes apart, so the shop
-- says what each part does and leaves the label off.
--
--   Sword Dran 3-60F        12,90    Helm Knight 3-80N        12,90
--   Arrow Wizard 4-80B      12,90    Scythe Incendio 4-60T    12,90
--   Courage Dran S 6-60V    12,90    Reaper Incendio T 4-70K  16,90 (the Kick bit is a staple)
--   Arc Wizard R 4-55LO     12,90    Dark Perseus B 6-80W     12,90
--
-- They lead the catalogue because they are the part of it that ships today. Catalogue copy,
-- images, specs and relations come from src/data/catalog.ts through
-- scripts/generate-supabase-seed.ts; this mirrors the same rows into the live database.

begin;

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('geardrop:spain-starters:2026-09-29', 0)
);

with seed(category_slug, slug, sku, stock_quantity, availability_override, preorder_allocation, name, tagline, description, price_cents, compare_at_price_cents, blade_type, rating, review_count, sort_order) as (
  values
  ('beyblade-x', 'sword-dran-3-60f', 'SWORD-DRAN-3-60F', 26, null::public.availability_override, 0, 'Sword Dran 3-60F', 'Tre lame che colpiscono dal basso.', 'Sword Dran 3-60F è la trottola che ha aperto la linea BX: la blade a tre lati porta tre lame inclinate verso l''alto attorno al chip del drago, il Ratchet 3-60 la tiene bassa a 6,0 mm e il Bit F (Flat), a punta piatta, la lancia lungo il bordo fino ad agganciare l''Xtreme Line e scatenare l''Xtreme Dash. Velocissima, ma la punta piatta consuma stamina in fretta. Lo starter include il lanciatore. Richiede un Beystadium Beyblade X (venduto separatamente).', 1290, null, null, 0, 0, 0),
  ('beyblade-x', 'helm-knight-3-80n', 'HELM-KNIGHT-3-80N', 26, null::public.availability_override, 0, 'Helm Knight 3-80N', 'Sei punti che incassano l''urto.', 'Helm Knight 3-80N è una trottola della linea BX: la blade rotonda distribuisce l''urto su sei punti di contatto attorno al chip del cavaliere, invece di concentrarlo su una lama sola. Il Ratchet 3-80 la porta a 8,0 mm e il Bit N (Needle), a punta conica aguzza, la inchioda al centro dello stadio, dove l''attacco avversario perde efficacia. Lo starter include il lanciatore. Richiede un Beystadium Beyblade X (venduto separatamente).', 1290, null, null, 0, 0, 1),
  ('beyblade-x', 'arrow-wizard-4-80b', 'ARROW-WIZARD-4-80B', 26, null::public.availability_override, 0, 'Arrow Wizard 4-80B', 'Punta a sfera. Gira e non si ferma.', 'Arrow Wizard 4-80B è una trottola della linea BX: la blade rotonda attorno al chip del mago spinge il peso verso l''esterno, così la rotazione si mantiene a lungo. Il Ratchet 4-80 la tiene alta a 8,0 mm e il Bit B (Ball), una punta a sfera liscia, riduce l''attrito e le fa descrivere cerchi larghi e controllati invece di sbandare. Lo starter include il lanciatore. Richiede un Beystadium Beyblade X (venduto separatamente).', 1290, null, null, 0, 0, 2),
  ('beyblade-x', 'scythe-incendio-4-60t', 'SCYTHE-INCENDIO-4-60T', 26, null::public.availability_override, 0, 'Scythe Incendio 4-60T', 'Quattro lame che respingono.', 'Scythe Incendio 4-60T è una trottola della linea BX: la blade rotonda monta quattro lame attorno al chip del teschio infuocato e restituisce molto rinculo a chi la colpisce. Il Ratchet 4-60 la tiene bassa a 6,0 mm e il Bit T (Taper), una punta piatta e stretta con lo spigolo rialzato, le dà un secondo punto d''appoggio: si muove come una Flat ma conserva più stamina. Lo starter include il lanciatore. Richiede un Beystadium Beyblade X (venduto separatamente).', 1290, null, null, 0, 0, 3),
  ('beyblade-x', 'courage-dran-s-6-60v', 'COURAGE-DRAN-S-6-60V', 26, null::public.availability_override, 0, 'Courage Dran S 6-60V', 'Tre lame lisce per l''Upper Attack.', 'Courage Dran S 6-60V è una trottola della linea CX, dove la blade si scompone in lock chip, main blade e assist blade. La main blade Brave porta tre lame lisce inclinate che sollevano l''avversario con un Upper Attack, sostenute dall''assist blade Slash. Il Ratchet 6-60 la tiene bassa a 6,0 mm e il Bit V (Vortex), una punta piatta con spirali rivolte a destra, la rende rapida e aggressiva. Lo starter include il lanciatore. Richiede un Beystadium Beyblade X (venduto separatamente).', 1290, null, null, 0, 0, 4),
  ('beyblade-x', 'reaper-incendio-t-4-70k', 'REAPER-INCENDIO-T-4-70K', 26, null::public.availability_override, 0, 'Reaper Incendio T 4-70K', 'Due assetti in una trottola.', 'Reaper Incendio T 4-70K è una trottola della linea CX e cambia carattere a seconda di come la monti: l''assist blade Turn è in due pezzi e il suo anello esterno si ribalta, con le punte in alto per un assetto d''attacco a colpi rapidi, oppure in basso per deviare gli urti e durare. Sopra, quattro lame sottili attorno al chip del teschio; sotto, il Ratchet 4-70 a 7,0 mm e il Bit K (Kick), una punta piatta a superficie esagonale che attacca sul lancio e poi si stabilizza. Il Kick è tra i bit più visti ai tavoli dei tornei. Lo starter include il lanciatore. Richiede un Beystadium Beyblade X (venduto separatamente).', 1690, null, null, 0, 0, 5),
  ('beyblade-x', 'arc-wizard-r-4-55lo', 'ARC-WIZARD-R-4-55LO', 26, null::public.availability_override, 0, 'Arc Wizard R 4-55LO', 'L''assetto più basso della serie.', 'Arc Wizard R 4-55LO è una trottola della linea CX: la main blade Arc sfrutta la forza centrifuga e l''assist blade Round le fa da supporto aerodinamico. Il Ratchet 4-55 è il più basso del gruppo, 5,5 mm, e il Bit LO (Low Orb) monta una sfera piccola, circa un millimetro sotto una Ball normale: si sposta poco e resta piantata al centro, dove consuma meno rotazione. Lo starter include il lanciatore. Richiede un Beystadium Beyblade X (venduto separatamente).', 1290, null, null, 0, 0, 6),
  ('beyblade-x', 'dark-perseus-b-6-80w', 'DARK-PERSEUS-B-6-80W', 26, null::public.availability_override, 0, 'Dark Perseus B 6-80W', 'Assorbe l''urto e resta in piedi.', 'Dark Perseus B 6-80W è una trottola della linea CX: la blade a onde smorza i colpi e l''assist blade Bumper ne assorbe l''urto invece di rimbalzare. Il Ratchet 6-80 la porta a 8,0 mm e il Bit W (Wedge) è una punta conica bassa e sottile con dieci denti anziché dodici: l''Xtreme Dash è meno esplosivo, ma consuma meno rotazione. Lo starter include il lanciatore. Richiede un Beystadium Beyblade X (venduto separatamente).', 1290, null, null, 0, 0, 7)
)
insert into public.products (
  category_id, slug, sku, name, tagline, description, price_cents,
  compare_at_price_cents, publication_status, active, stock_quantity,
  availability_override, preorder_allocation, allow_backorder, blade_type, rating, review_count, sort_order
)
select
  category.id, seed.slug, seed.sku, seed.name, seed.tagline, seed.description, seed.price_cents,
  seed.compare_at_price_cents::integer, 'published'::public.publication_status, true,
  -- The product arrives empty and the intake below fills it, so the 26 pieces enter the ledger
  -- as a movement instead of appearing from nowhere. seed.stock_quantity is the same 26 and is
  -- read there; taking it here would leave the goods-in unexplained.
  0 as stock_quantity,
  seed.availability_override, seed.preorder_allocation,
  -- Sold out means pre-order, never a closed sale (migration 20260917140000).
  true as allow_backorder,
  seed.blade_type::public.blade_type, seed.rating, seed.review_count, seed.sort_order
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
  sort_order = excluded.sort_order;

with seed(product_slug, src, width, height, alt, sort_order) as (
  values
  ('sword-dran-3-60f', '/products/sword-dran-3-60f.webp', 1000, 1000, 'Confezione Beyblade X Sword Dran 3-60F con trottola blu e lanciatore', 0),
  ('helm-knight-3-80n', '/products/helm-knight-3-80n.webp', 1000, 1000, 'Confezione Beyblade X Helm Knight 3-80N con trottola verde e lanciatore', 0),
  ('arrow-wizard-4-80b', '/products/arrow-wizard-4-80b.webp', 1000, 1000, 'Confezione Beyblade X Arrow Wizard 4-80B con trottola dorata e lanciatore', 0),
  ('scythe-incendio-4-60t', '/products/scythe-incendio-4-60t.webp', 1000, 1000, 'Confezione Beyblade X Scythe Incendio 4-60T con trottola rossa e argento e lanciatore', 0),
  ('courage-dran-s-6-60v', '/products/courage-dran-s-6-60v.webp', 1000, 1000, 'Confezione Beyblade X Courage Dran S 6-60V con trottola blu e lanciatore', 0),
  ('reaper-incendio-t-4-70k', '/products/reaper-incendio-t-4-70k.webp', 1000, 1000, 'Confezione Beyblade X Reaper Incendio T 4-70K con trottola rossa e lanciatore', 0),
  ('arc-wizard-r-4-55lo', '/products/arc-wizard-r-4-55lo.webp', 1000, 1000, 'Confezione Beyblade X Arc Wizard R 4-55LO con trottola giallo lime e lanciatore', 0),
  ('dark-perseus-b-6-80w', '/products/dark-perseus-b-6-80w.webp', 1000, 1000, 'Confezione Beyblade X Dark Perseus B 6-80W con trottola viola e lanciatore', 0)
)
insert into public.product_images (product_id, src, width, height, alt, sort_order, published, is_primary)
select product.id, seed.src, seed.width, seed.height, seed.alt, seed.sort_order, true, seed.sort_order = 0
from seed join public.products as product on product.slug = seed.product_slug
on conflict (product_id, sort_order) do update set
  src = excluded.src, width = excluded.width, height = excluded.height, alt = excluded.alt,
  published = excluded.published, is_primary = excluded.is_primary;

with seed(product_slug, label, value, sort_order) as (
  values
  ('sword-dran-3-60f', 'Produttore', 'Hasbro (prodotto originale)', 0),
  ('sword-dran-3-60f', 'Sistema', 'Beyblade X', 1),
  ('sword-dran-3-60f', 'Linea', 'BX (Basic Line)', 2),
  ('sword-dran-3-60f', 'Codice', '3-60F', 3),
  ('sword-dran-3-60f', 'Componenti', '1 trottola, 1 lanciatore con ripcord', 4),
  ('sword-dran-3-60f', 'Nota', 'Richiede un Beystadium (venduto a parte)', 5),
  ('helm-knight-3-80n', 'Produttore', 'Hasbro (prodotto originale)', 0),
  ('helm-knight-3-80n', 'Sistema', 'Beyblade X', 1),
  ('helm-knight-3-80n', 'Linea', 'BX (Basic Line)', 2),
  ('helm-knight-3-80n', 'Codice', '3-80N', 3),
  ('helm-knight-3-80n', 'Componenti', '1 trottola, 1 lanciatore con ripcord', 4),
  ('helm-knight-3-80n', 'Nota', 'Richiede un Beystadium (venduto a parte)', 5),
  ('arrow-wizard-4-80b', 'Produttore', 'Hasbro (prodotto originale)', 0),
  ('arrow-wizard-4-80b', 'Sistema', 'Beyblade X', 1),
  ('arrow-wizard-4-80b', 'Linea', 'BX (Basic Line)', 2),
  ('arrow-wizard-4-80b', 'Codice', '4-80B', 3),
  ('arrow-wizard-4-80b', 'Componenti', '1 trottola, 1 lanciatore con ripcord', 4),
  ('arrow-wizard-4-80b', 'Nota', 'Richiede un Beystadium (venduto a parte)', 5),
  ('scythe-incendio-4-60t', 'Produttore', 'Hasbro (prodotto originale)', 0),
  ('scythe-incendio-4-60t', 'Sistema', 'Beyblade X', 1),
  ('scythe-incendio-4-60t', 'Linea', 'BX (Basic Line)', 2),
  ('scythe-incendio-4-60t', 'Codice', '4-60T', 3),
  ('scythe-incendio-4-60t', 'Componenti', '1 trottola, 1 lanciatore con ripcord', 4),
  ('scythe-incendio-4-60t', 'Nota', 'Richiede un Beystadium (venduto a parte)', 5),
  ('courage-dran-s-6-60v', 'Produttore', 'Hasbro (prodotto originale)', 0),
  ('courage-dran-s-6-60v', 'Sistema', 'Beyblade X', 1),
  ('courage-dran-s-6-60v', 'Linea', 'CX (Custom Line)', 2),
  ('courage-dran-s-6-60v', 'Codice', '6-60V', 3),
  ('courage-dran-s-6-60v', 'Componenti', '1 trottola, 1 lanciatore con ripcord', 4),
  ('courage-dran-s-6-60v', 'Nota', 'Richiede un Beystadium (venduto a parte)', 5),
  ('reaper-incendio-t-4-70k', 'Produttore', 'Hasbro (prodotto originale)', 0),
  ('reaper-incendio-t-4-70k', 'Sistema', 'Beyblade X', 1),
  ('reaper-incendio-t-4-70k', 'Linea', 'CX (Custom Line)', 2),
  ('reaper-incendio-t-4-70k', 'Codice', '4-70K', 3),
  ('reaper-incendio-t-4-70k', 'Componenti', '1 trottola, 1 lanciatore con ripcord', 4),
  ('reaper-incendio-t-4-70k', 'Nota', 'Richiede un Beystadium (venduto a parte)', 5),
  ('arc-wizard-r-4-55lo', 'Produttore', 'Hasbro (prodotto originale)', 0),
  ('arc-wizard-r-4-55lo', 'Sistema', 'Beyblade X', 1),
  ('arc-wizard-r-4-55lo', 'Linea', 'CX (Custom Line)', 2),
  ('arc-wizard-r-4-55lo', 'Codice', '4-55LO', 3),
  ('arc-wizard-r-4-55lo', 'Componenti', '1 trottola, 1 lanciatore con ripcord', 4),
  ('arc-wizard-r-4-55lo', 'Nota', 'Richiede un Beystadium (venduto a parte)', 5),
  ('dark-perseus-b-6-80w', 'Produttore', 'Hasbro (prodotto originale)', 0),
  ('dark-perseus-b-6-80w', 'Sistema', 'Beyblade X', 1),
  ('dark-perseus-b-6-80w', 'Linea', 'CX (Custom Line)', 2),
  ('dark-perseus-b-6-80w', 'Codice', '6-80W', 3),
  ('dark-perseus-b-6-80w', 'Componenti', '1 trottola, 1 lanciatore con ripcord', 4),
  ('dark-perseus-b-6-80w', 'Nota', 'Richiede un Beystadium (venduto a parte)', 5)
)
insert into public.product_specs (product_id, label, value, sort_order)
select product.id, seed.label, seed.value, seed.sort_order
from seed join public.products as product on product.slug = seed.product_slug
on conflict (product_id, sort_order) do update set label = excluded.label, value = excluded.value;

with seed(product_slug, title, description, sort_order) as (
  values
  ('sword-dran-3-60f', 'Bit Flat', 'Punta piatta: corre sul bordo e aggancia l''Xtreme Line', 0),
  ('sword-dran-3-60f', 'Ratchet 3-60', 'Assetto basso a 6,0 mm', 1),
  ('sword-dran-3-60f', 'Tre lame in salita', 'Colpiscono l''avversario dal basso verso l''alto', 2),
  ('sword-dran-3-60f', 'Starter completo', 'Trottola e lanciatore con ripcord inclusi', 3),
  ('helm-knight-3-80n', 'Bit Needle', 'Punta aguzza: resta ferma al centro dello stadio', 0),
  ('helm-knight-3-80n', 'Sei punti di contatto', 'L''urto si distribuisce invece di concentrarsi', 1),
  ('helm-knight-3-80n', 'Ratchet 3-80', 'Assetto alto a 8,0 mm', 2),
  ('helm-knight-3-80n', 'Starter completo', 'Trottola e lanciatore con ripcord inclusi', 3),
  ('arrow-wizard-4-80b', 'Bit Ball', 'Punta a sfera: poco attrito, rotazione che dura', 0),
  ('arrow-wizard-4-80b', 'Peso sul bordo', 'La forza centrifuga mantiene la rotazione', 1),
  ('arrow-wizard-4-80b', 'Ratchet 4-80', 'Assetto alto a 8,0 mm', 2),
  ('arrow-wizard-4-80b', 'Starter completo', 'Trottola e lanciatore con ripcord inclusi', 3),
  ('scythe-incendio-4-60t', 'Bit Taper', 'Punta stretta con spigolo rialzato: mobile ma più resistente di una Flat', 0),
  ('scythe-incendio-4-60t', 'Quattro lame', 'Molto rinculo su chi la colpisce', 1),
  ('scythe-incendio-4-60t', 'Ratchet 4-60', 'Assetto basso a 6,0 mm', 2),
  ('scythe-incendio-4-60t', 'Starter completo', 'Trottola e lanciatore con ripcord inclusi', 3),
  ('courage-dran-s-6-60v', 'Bit Vortex', 'Punta piatta a spirale: rapida e aggressiva', 0),
  ('courage-dran-s-6-60v', 'Blade in tre pezzi', 'Lock chip, main blade Brave e assist blade Slash', 1),
  ('courage-dran-s-6-60v', 'Upper Attack', 'Le tre lame inclinate sollevano l''avversario', 2),
  ('courage-dran-s-6-60v', 'Starter completo', 'Trottola e lanciatore con ripcord inclusi', 3),
  ('reaper-incendio-t-4-70k', 'Bit Kick', 'Attacca sul lancio, poi si stabilizza: molto usato nei tornei', 0),
  ('reaper-incendio-t-4-70k', 'Assist blade Turn', 'Si ribalta: assetto d''attacco o di resistenza', 1),
  ('reaper-incendio-t-4-70k', 'Ratchet 4-70', 'Assetto medio a 7,0 mm', 2),
  ('reaper-incendio-t-4-70k', 'Starter completo', 'Trottola e lanciatore con ripcord inclusi', 3),
  ('arc-wizard-r-4-55lo', 'Bit Low Orb', 'Sfera bassa: si muove poco e tiene il centro', 0),
  ('arc-wizard-r-4-55lo', 'Blade in tre pezzi', 'Lock chip, main blade Arc e assist blade Round', 1),
  ('arc-wizard-r-4-55lo', 'Ratchet 4-55', 'L''assetto più basso della serie, 5,5 mm', 2),
  ('arc-wizard-r-4-55lo', 'Starter completo', 'Trottola e lanciatore con ripcord inclusi', 3),
  ('dark-perseus-b-6-80w', 'Bit Wedge', 'Punta conica bassa: dash meno esplosivo, meno stamina persa', 0),
  ('dark-perseus-b-6-80w', 'Blade a onde', 'Smorza i colpi invece di rimbalzare', 1),
  ('dark-perseus-b-6-80w', 'Assist blade Bumper', 'Assorbe l''urto dell''impatto', 2),
  ('dark-perseus-b-6-80w', 'Starter completo', 'Trottola e lanciatore con ripcord inclusi', 3)
)
insert into public.product_features (product_id, title, description, sort_order)
select product.id, seed.title, seed.description, seed.sort_order
from seed join public.products as product on product.slug = seed.product_slug
on conflict (product_id, sort_order) do update set title = excluded.title, description = excluded.description;

with seed(product_slug, content, sort_order) as (
  values
  ('sword-dran-3-60f', '1 × Trottola Sword Dran 3-60F', 0),
  ('sword-dran-3-60f', '1 × Lanciatore con ripcord', 1),
  ('sword-dran-3-60f', 'Manuale', 2),
  ('helm-knight-3-80n', '1 × Trottola Helm Knight 3-80N', 0),
  ('helm-knight-3-80n', '1 × Lanciatore con ripcord', 1),
  ('helm-knight-3-80n', 'Manuale', 2),
  ('arrow-wizard-4-80b', '1 × Trottola Arrow Wizard 4-80B', 0),
  ('arrow-wizard-4-80b', '1 × Lanciatore con ripcord', 1),
  ('arrow-wizard-4-80b', 'Manuale', 2),
  ('scythe-incendio-4-60t', '1 × Trottola Scythe Incendio 4-60T', 0),
  ('scythe-incendio-4-60t', '1 × Lanciatore con ripcord', 1),
  ('scythe-incendio-4-60t', 'Manuale', 2),
  ('courage-dran-s-6-60v', '1 × Trottola Courage Dran S 6-60V', 0),
  ('courage-dran-s-6-60v', '1 × Lanciatore con ripcord', 1),
  ('courage-dran-s-6-60v', 'Manuale', 2),
  ('reaper-incendio-t-4-70k', '1 × Trottola Reaper Incendio T 4-70K', 0),
  ('reaper-incendio-t-4-70k', '1 × Lanciatore con ripcord', 1),
  ('reaper-incendio-t-4-70k', 'Manuale', 2),
  ('arc-wizard-r-4-55lo', '1 × Trottola Arc Wizard R 4-55LO', 0),
  ('arc-wizard-r-4-55lo', '1 × Lanciatore con ripcord', 1),
  ('arc-wizard-r-4-55lo', 'Manuale', 2),
  ('dark-perseus-b-6-80w', '1 × Trottola Dark Perseus B 6-80W', 0),
  ('dark-perseus-b-6-80w', '1 × Lanciatore con ripcord', 1),
  ('dark-perseus-b-6-80w', 'Manuale', 2)
)
insert into public.product_box_contents (product_id, content, sort_order)
select product.id, seed.content, seed.sort_order
from seed join public.products as product on product.slug = seed.product_slug
on conflict (product_id, sort_order) do update set content = excluded.content;

with seed(product_slug, related_slug, sort_order) as (
  values
  ('sword-dran-3-60f', 'helm-knight-3-80n', 0),
  ('sword-dran-3-60f', 'courage-dran-s-6-60v', 1),
  ('sword-dran-3-60f', 'scythe-incendio-4-60t', 2),
  ('helm-knight-3-80n', 'arrow-wizard-4-80b', 0),
  ('helm-knight-3-80n', 'dark-perseus-b-6-80w', 1),
  ('helm-knight-3-80n', 'sword-dran-3-60f', 2),
  ('arrow-wizard-4-80b', 'arc-wizard-r-4-55lo', 0),
  ('arrow-wizard-4-80b', 'helm-knight-3-80n', 1),
  ('arrow-wizard-4-80b', 'scythe-incendio-4-60t', 2),
  ('scythe-incendio-4-60t', 'reaper-incendio-t-4-70k', 0),
  ('scythe-incendio-4-60t', 'sword-dran-3-60f', 1),
  ('scythe-incendio-4-60t', 'arrow-wizard-4-80b', 2),
  ('courage-dran-s-6-60v', 'reaper-incendio-t-4-70k', 0),
  ('courage-dran-s-6-60v', 'sword-dran-3-60f', 1),
  ('courage-dran-s-6-60v', 'arc-wizard-r-4-55lo', 2),
  ('reaper-incendio-t-4-70k', 'courage-dran-s-6-60v', 0),
  ('reaper-incendio-t-4-70k', 'scythe-incendio-4-60t', 1),
  ('reaper-incendio-t-4-70k', 'dark-perseus-b-6-80w', 2),
  ('arc-wizard-r-4-55lo', 'arrow-wizard-4-80b', 0),
  ('arc-wizard-r-4-55lo', 'dark-perseus-b-6-80w', 1),
  ('arc-wizard-r-4-55lo', 'courage-dran-s-6-60v', 2),
  ('dark-perseus-b-6-80w', 'helm-knight-3-80n', 0),
  ('dark-perseus-b-6-80w', 'arc-wizard-r-4-55lo', 1),
  ('dark-perseus-b-6-80w', 'reaper-incendio-t-4-70k', 2)
)
insert into public.product_relations (product_id, related_product_id, relation_type, sort_order)
select product.id, related.id, 'related'::public.product_relation_type, seed.sort_order
from seed
join public.products as product on product.slug = seed.product_slug
join public.products as related on related.slug = seed.related_slug
on conflict (product_id, related_product_id, relation_type) do update set sort_order = excluded.sort_order;

-- The shop lists products in catalogue order: the eight that ship today lead it.
with seed(slug, sort_order) as (
  values
  ('sword-dran-3-60f', 0),
  ('helm-knight-3-80n', 1),
  ('arrow-wizard-4-80b', 2),
  ('scythe-incendio-4-60t', 3),
  ('courage-dran-s-6-60v', 4),
  ('reaper-incendio-t-4-70k', 5),
  ('arc-wizard-r-4-55lo', 6),
  ('dark-perseus-b-6-80w', 7),
  ('cobalt-drake-4-60f', 8),
  ('mirage-clock-9-65b', 9),
  ('suppress-superion-0-70lp', 10),
  ('strike-dran-4-50ff', 11),
  ('tread-croc-tq-5-50gn', 12),
  ('glory-valkerion-lf', 13),
  ('hurricane-enlil-is-7-55t', 14),
  ('shatter-horus-9-65gb', 15),
  ('cobalt-dragoon-2-60c', 16),
  ('soar-phoenix-9-60gf', 17),
  ('saber-samurai-2-70l', 18),
  ('blast-pegasus-a-tr', 19),
  ('drop-attack-battle-set', 20),
  ('sneak-attack-battle-set', 21),
  ('porta-deck-giallo', 22),
  ('porta-deck-verde-lime', 23),
  ('porta-deck-azzurro', 24),
  ('porta-deck-blu', 25),
  ('porta-deck-rosa', 26),
  ('porta-deck-fucsia', 27),
  ('porta-deck-bianco', 28)
)
update public.products as target
set sort_order = seed.sort_order
from seed
where target.slug = seed.slug;

-- The shelf each one arrived with, recorded in the ledger like any other goods-in. Only a
-- product that has no stock yet is filled, so a replay cannot inflate a shelf the shop has
-- already sold from.
create temporary table starter_intake on commit drop as
select product.id, 26 as received, product.stock_quantity + 26 as stock_after
from public.products as product
where product.slug in ('sword-dran-3-60f', 'helm-knight-3-80n', 'arrow-wizard-4-80b', 'scythe-incendio-4-60t', 'courage-dran-s-6-60v', 'reaper-incendio-t-4-70k', 'arc-wizard-r-4-55lo', 'dark-perseus-b-6-80w')
  and product.stock_quantity <= 0;

update public.products as product
set stock_quantity = intake.stock_after
from starter_intake as intake
where intake.id = product.id;

insert into public.inventory_movements (product_id, delta, stock_after, reason, note)
select intake.id, intake.received, intake.stock_after, 'manual_adjustment'::public.inventory_reason,
  'Carico merce dalla Spagna del 29/09/2026'
from starter_intake as intake;

commit;
