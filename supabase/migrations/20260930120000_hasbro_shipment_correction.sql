-- 2026-09-30: Hasbro shipped a different assortment from the one the shop had counted on.
--
--   * Four UX pieces arrive: Hammer Incendio 3-70H, Shadow Shinobi 1-80MN and Wand Wizard 1-60R
--     as starter packs at 14,90, and Buster Dran 5-70DB as a booster at 12,90 — that one holds
--     the top alone, with no launcher, which its page states three times over.
--   * Seven starter packs never came and go back to being open pre-orders.
--   * Reaper Incendio T 4-70K is archived: the shop cannot get it at all. Two buyers had paid for
--     one and the owner refunded both in Stripe.
--   * Shatter Horus and Hurricane Enlil come in at 39 each and fall to 12,50, Cobalt Dragoon at 56
--     and 23,00, Glory Valkerion at 26 and 25,00. The old prices were set when the same goods cost
--     three times as much.
--
-- Blast Pegasus, Saber Samurai and the two stadiums are untouched: the owner holds those.
-- Catalogue copy comes from src/data/catalog.ts through scripts/generate-supabase-seed.ts.

begin;

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('geardrop:hasbro-shipment:2026-09-30', 0)
);

with seed(category_slug, slug, sku, stock_quantity, availability_override, preorder_allocation, name, tagline, description, price_cents, compare_at_price_cents, blade_type, rating, review_count, sort_order) as (
  values
  ('beyblade-x', 'buster-dran-5-70db', 'BUSTER-DRAN-5-70DB', 26, null::public.availability_override, 0, 'Buster Dran 5-70DB', 'Un punto solo. O passa, o niente.', 'Buster Dran 5-70DB è la più estrema della linea UX: la blade ovale concentra tutta la massa su un unico contatto a punta di spada e svuota il lato opposto. Ratchet 5-70 a 7,0 mm e Bit DB (Disk Ball). Questa è la versione booster: contiene la sola trottola, senza lanciatore. Richiede lanciatore e Beystadium Beyblade X (venduti separatamente).', 1290, null, null, 0, 0, 0),
  ('beyblade-x', 'hammer-incendio-3-70h', 'HAMMER-INCENDIO-3-70H', 26, null::public.availability_override, 0, 'Hammer Incendio 3-70H', 'Tre martelli. Colpisce dall''alto.', 'Hammer Incendio 3-70H è costruita attorno a tre grandi lame rialzate che lavorano come martelli: il peso sta sul bordo e i colpi arrivano dall''alto. Ratchet 3-70 a 7,0 mm, che resiste allo scoppio meglio degli assetti bassi, e Bit H (Hexa). Lo starter include il lanciatore. Richiede un Beystadium Beyblade X (venduto separatamente).', 1490, null, null, 0, 0, 1),
  ('beyblade-x', 'shadow-shinobi-1-80mn', 'SHADOW-SHINOBI-1-80MN', 26, null::public.availability_override, 0, 'Shadow Shinobi 1-80MN', 'Para, devia, resta in piedi.', 'Shadow Shinobi 1-80MN è fatta per incassare: tre lame lisce che deviano il colpo invece di rimbalzarlo, contatti in metallo nella parte alta, ed è tra le più leggere della serie. Ratchet 1-80 alto a 8,0 mm e Bit MN (Metal Needle). Lo starter include il lanciatore. Richiede un Beystadium Beyblade X (venduto separatamente).', 1490, null, null, 0, 0, 2),
  ('beyblade-x', 'wand-wizard-1-60r', 'WAND-WIZARD-1-60R', 26, null::public.availability_override, 0, 'Wand Wizard 1-60R', 'La blade più larga della serie.', 'Wand Wizard 1-60R monta la blade dal diametro più grande della linea UX, larga e circolare con cinque intagli sul perimetro, qui montata bassa e aggressiva. Ratchet 1-60 a 6,0 mm e Bit R (Rush). Lo starter include il lanciatore. Richiede un Beystadium Beyblade X (venduto separatamente).', 1490, null, null, 0, 0, 3)
)
insert into public.products (
  category_id, slug, sku, name, tagline, description, price_cents,
  compare_at_price_cents, publication_status, active, stock_quantity,
  availability_override, preorder_allocation, allow_backorder, blade_type, rating, review_count, sort_order
)
select
  category.id, seed.slug, seed.sku, seed.name, seed.tagline, seed.description, seed.price_cents,
  seed.compare_at_price_cents::integer, 'published'::public.publication_status, true,
  -- Empty on arrival; the intake below fills it and writes the goods-in to the ledger.
  0 as stock_quantity,
  seed.availability_override, seed.preorder_allocation, true as allow_backorder,
  seed.blade_type::public.blade_type, seed.rating, seed.review_count, seed.sort_order
from seed
join public.categories as category on category.slug = seed.category_slug
on conflict (slug) do update set
  category_id = excluded.category_id, sku = excluded.sku, name = excluded.name,
  tagline = excluded.tagline, description = excluded.description, price_cents = excluded.price_cents,
  compare_at_price_cents = excluded.compare_at_price_cents, blade_type = excluded.blade_type,
  sort_order = excluded.sort_order;

with seed(product_slug, src, width, height, alt, sort_order) as (
  values
  ('buster-dran-5-70db', '/products/buster-dran-5-70db.webp', 1000, 1000, 'Confezione Beyblade X Buster Dran 5-70DB con trottola gialla e argento', 0),
  ('hammer-incendio-3-70h', '/products/hammer-incendio-3-70h.webp', 1000, 1000, 'Confezione Beyblade X Hammer Incendio 3-70H con trottola rossa e argento e lanciatore', 0),
  ('shadow-shinobi-1-80mn', '/products/shadow-shinobi-1-80mn.webp', 1000, 1000, 'Confezione Beyblade X Shadow Shinobi 1-80MN con trottola viola e verde acqua e lanciatore', 0),
  ('wand-wizard-1-60r', '/products/wand-wizard-1-60r.webp', 1000, 1000, 'Confezione Beyblade X Wand Wizard 1-60R con trottola verde e lanciatore', 0)
)
insert into public.product_images (product_id, src, width, height, alt, sort_order, published, is_primary)
select product.id, seed.src, seed.width, seed.height, seed.alt, seed.sort_order, true, seed.sort_order = 0
from seed join public.products as product on product.slug = seed.product_slug
on conflict (product_id, sort_order) do update set
  src = excluded.src, width = excluded.width, height = excluded.height, alt = excluded.alt,
  published = excluded.published, is_primary = excluded.is_primary;

with seed(product_slug, label, value, sort_order) as (
  values
  ('buster-dran-5-70db', 'Produttore', 'Hasbro (prodotto originale)', 0),
  ('buster-dran-5-70db', 'Sistema', 'Beyblade X', 1),
  ('buster-dran-5-70db', 'Linea', 'UX (Unique Line)', 2),
  ('buster-dran-5-70db', 'Codice', '5-70DB', 3),
  ('buster-dran-5-70db', 'Componenti', '1 trottola', 4),
  ('buster-dran-5-70db', 'Nota', 'Richiede lanciatore e Beystadium (venduti a parte)', 5),
  ('hammer-incendio-3-70h', 'Produttore', 'Hasbro (prodotto originale)', 0),
  ('hammer-incendio-3-70h', 'Sistema', 'Beyblade X', 1),
  ('hammer-incendio-3-70h', 'Linea', 'UX (Unique Line)', 2),
  ('hammer-incendio-3-70h', 'Codice', '3-70H', 3),
  ('hammer-incendio-3-70h', 'Componenti', '1 trottola, 1 lanciatore con ripcord', 4),
  ('hammer-incendio-3-70h', 'Nota', 'Richiede un Beystadium (venduto a parte)', 5),
  ('shadow-shinobi-1-80mn', 'Produttore', 'Hasbro (prodotto originale)', 0),
  ('shadow-shinobi-1-80mn', 'Sistema', 'Beyblade X', 1),
  ('shadow-shinobi-1-80mn', 'Linea', 'UX (Unique Line)', 2),
  ('shadow-shinobi-1-80mn', 'Codice', '1-80MN', 3),
  ('shadow-shinobi-1-80mn', 'Componenti', '1 trottola, 1 lanciatore con ripcord', 4),
  ('shadow-shinobi-1-80mn', 'Nota', 'Richiede un Beystadium (venduto a parte)', 5),
  ('wand-wizard-1-60r', 'Produttore', 'Hasbro (prodotto originale)', 0),
  ('wand-wizard-1-60r', 'Sistema', 'Beyblade X', 1),
  ('wand-wizard-1-60r', 'Linea', 'UX (Unique Line)', 2),
  ('wand-wizard-1-60r', 'Codice', '1-60R', 3),
  ('wand-wizard-1-60r', 'Componenti', '1 trottola, 1 lanciatore con ripcord', 4),
  ('wand-wizard-1-60r', 'Nota', 'Richiede un Beystadium (venduto a parte)', 5)
)
insert into public.product_specs (product_id, label, value, sort_order)
select product.id, seed.label, seed.value, seed.sort_order
from seed join public.products as product on product.slug = seed.product_slug
on conflict (product_id, sort_order) do update set label = excluded.label, value = excluded.value;

with seed(product_slug, title, description, sort_order) as (
  values
  ('buster-dran-5-70db', 'Un solo punto d''urto', 'Tutta la massa su un contatto a punta di spada', 0),
  ('buster-dran-5-70db', 'Bit Disk Ball', 'Appoggio a disco: tiene il centro senza fermarsi', 1),
  ('buster-dran-5-70db', 'Ratchet 5-70', 'Assetto medio a 7,0 mm', 2),
  ('buster-dran-5-70db', 'Solo la trottola', 'Versione booster: il lanciatore non è incluso', 3),
  ('hammer-incendio-3-70h', 'Tre lame a martello', 'Il peso sul bordo per colpire dall''alto', 0),
  ('hammer-incendio-3-70h', 'Bit Hexa', 'Si raddrizza da sola e tiene l''assetto', 1),
  ('hammer-incendio-3-70h', 'Ratchet 3-70', 'Assetto medio a 7,0 mm', 2),
  ('hammer-incendio-3-70h', 'Starter completo', 'Trottola e lanciatore con ripcord inclusi', 3),
  ('shadow-shinobi-1-80mn', 'Tre lame lisce', 'Deviano il colpo invece di rimbalzarlo', 0),
  ('shadow-shinobi-1-80mn', 'Bit Metal Needle', 'Attrito minimo, rotazione lunghissima', 1),
  ('shadow-shinobi-1-80mn', 'Ratchet 1-80', 'Assetto alto a 8,0 mm', 2),
  ('shadow-shinobi-1-80mn', 'Da sapere prima di comprare', 'La punta in metallo può segnare il fondo dello stadio, e nei tornei WBO è ammessa solo con la Ranked Clause', 3),
  ('wand-wizard-1-60r', 'La blade più larga', 'Diametro maggiore di ogni altra della serie', 0),
  ('wand-wizard-1-60r', 'Bit Rush', 'Scatti frequenti, poca rotazione persa', 1),
  ('wand-wizard-1-60r', 'Ratchet 1-60', 'Assetto basso a 6,0 mm', 2),
  ('wand-wizard-1-60r', 'Da sapere prima di comprare', 'La blade Wizard Rod è fuori dai formati ufficiali 1on1 dal 2025, ammessa nel 3on3', 3)
)
insert into public.product_features (product_id, title, description, sort_order)
select product.id, seed.title, seed.description, seed.sort_order
from seed join public.products as product on product.slug = seed.product_slug
on conflict (product_id, sort_order) do update set title = excluded.title, description = excluded.description;

with seed(product_slug, content, sort_order) as (
  values
  ('buster-dran-5-70db', '1 × Trottola Buster Dran 5-70DB', 0),
  ('buster-dran-5-70db', 'Manuale', 1),
  ('hammer-incendio-3-70h', '1 × Trottola Hammer Incendio 3-70H', 0),
  ('hammer-incendio-3-70h', '1 × Lanciatore con ripcord', 1),
  ('hammer-incendio-3-70h', 'Manuale', 2),
  ('shadow-shinobi-1-80mn', '1 × Trottola Shadow Shinobi 1-80MN', 0),
  ('shadow-shinobi-1-80mn', '1 × Lanciatore con ripcord', 1),
  ('shadow-shinobi-1-80mn', 'Manuale', 2),
  ('wand-wizard-1-60r', '1 × Trottola Wand Wizard 1-60R', 0),
  ('wand-wizard-1-60r', '1 × Lanciatore con ripcord', 1),
  ('wand-wizard-1-60r', 'Manuale', 2)
)
insert into public.product_box_contents (product_id, content, sort_order)
select product.id, seed.content, seed.sort_order
from seed join public.products as product on product.slug = seed.product_slug
on conflict (product_id, sort_order) do update set content = excluded.content;

with seed(product_slug, related_slug, sort_order) as (
  values
  ('buster-dran-5-70db', 'hammer-incendio-3-70h', 0),
  ('buster-dran-5-70db', 'wand-wizard-1-60r', 1),
  ('buster-dran-5-70db', 'shadow-shinobi-1-80mn', 2),
  ('hammer-incendio-3-70h', 'buster-dran-5-70db', 0),
  ('shadow-shinobi-1-80mn', 'buster-dran-5-70db', 2),
  ('wand-wizard-1-60r', 'buster-dran-5-70db', 0),
  ('hammer-incendio-3-70h', 'shadow-shinobi-1-80mn', 1),
  ('hammer-incendio-3-70h', 'wand-wizard-1-60r', 2),
  ('shadow-shinobi-1-80mn', 'hammer-incendio-3-70h', 0),
  ('wand-wizard-1-60r', 'hammer-incendio-3-70h', 2),
  ('shadow-shinobi-1-80mn', 'dark-perseus-b-6-80w', 1),
  ('wand-wizard-1-60r', 'arrow-wizard-4-80b', 1)
)
insert into public.product_relations (product_id, related_product_id, relation_type, sort_order)
select product.id, related.id, 'related'::public.product_relation_type, seed.sort_order
from seed
join public.products as product on product.slug = seed.product_slug
join public.products as related on related.slug = seed.related_slug
on conflict (product_id, related_product_id, relation_type) do update set sort_order = excluded.sort_order;

-- What arrived enters the ledger and adds to whatever was already on the shelf.
create temporary table hasbro_intake on commit drop as
select product.id, seed.received, product.stock_quantity + seed.received as stock_after
from (values
  ('buster-dran-5-70db', 26),
  ('hammer-incendio-3-70h', 26),
  ('shadow-shinobi-1-80mn', 26),
  ('wand-wizard-1-60r', 26),
  ('shatter-horus-9-65gb', 39),
  ('hurricane-enlil-is-7-55t', 39),
  ('cobalt-dragoon-2-60c', 56),
  ('glory-valkerion-lf', 26)
) as seed(slug, received)
join public.products as product on product.slug = seed.slug
-- Replay guard: the ledger, not the shelf. Shatter Horus and Hurricane Enlil already held pieces
-- and the new ones add to them, so "is the shelf empty" would have skipped exactly those two.
where not exists (
  select 1 from public.inventory_movements as movement
  where movement.product_id = product.id and movement.note = 'Carico Hasbro del 30/09/2026'
);

update public.products as product
set stock_quantity = intake.stock_after, availability_override = null, preorder_allocation = 0
from hasbro_intake as intake
where intake.id = product.id;

insert into public.inventory_movements (product_id, delta, stock_after, reason, note)
select intake.id, intake.received, intake.stock_after, 'manual_adjustment'::public.inventory_reason,
  'Carico Hasbro del 30/09/2026'
from hasbro_intake as intake;

-- Prices the owner set the same day, on goods that now cost a fraction of what they did.
update public.products as target
set price_cents = seed.price_cents
from (values
  ('glory-valkerion-lf', 2500),
  ('shatter-horus-9-65gb', 1250),
  ('hurricane-enlil-is-7-55t', 1250),
  ('cobalt-dragoon-2-60c', 2300)
) as seed(slug, price_cents)
where target.slug = seed.slug;

-- The seven that never arrived go back to selling as open pre-orders: no shelf, no allocation,
-- allow_backorder carrying the sale (migration 20260917140000). Their unsold stock is written
-- off so the ledger still explains every number.
create temporary table hasbro_shortfall on commit drop as
select id, stock_quantity from public.products
where slug in ('sword-dran-3-60f', 'helm-knight-3-80n', 'arrow-wizard-4-80b', 'scythe-incendio-4-60t', 'courage-dran-s-6-60v', 'arc-wizard-r-4-55lo', 'dark-perseus-b-6-80w') and stock_quantity > 0;

insert into public.inventory_movements (product_id, delta, stock_after, reason, note)
select id, -stock_quantity, 0, 'manual_adjustment'::public.inventory_reason,
  'Mai arrivati con la spedizione Hasbro del 30/09/2026: tornano in pre-ordine'
from hasbro_shortfall;

update public.products
set stock_quantity = 0, availability_override = null, preorder_allocation = 0
where id in (select id from hasbro_shortfall);

-- Reaper Incendio leaves the shop. Archived rather than deleted: two orders reference it, and
-- an order must always be able to name what it sold.
update public.products
set publication_status = 'archived'::public.publication_status, active = false, stock_quantity = 0,
    availability_override = null, preorder_allocation = 0, allow_backorder = false
where slug = 'reaper-incendio-t-4-70k';

-- The shop lists products in catalogue order.
with seed(slug, sort_order) as (
  values
  ('buster-dran-5-70db', 0),
  ('hammer-incendio-3-70h', 1),
  ('shadow-shinobi-1-80mn', 2),
  ('wand-wizard-1-60r', 3),
  ('sword-dran-3-60f', 4),
  ('helm-knight-3-80n', 5),
  ('arrow-wizard-4-80b', 6),
  ('scythe-incendio-4-60t', 7),
  ('courage-dran-s-6-60v', 8),
  ('arc-wizard-r-4-55lo', 9),
  ('dark-perseus-b-6-80w', 10),
  ('cobalt-drake-4-60f', 11),
  ('mirage-clock-9-65b', 12),
  ('suppress-superion-0-70lp', 13),
  ('strike-dran-4-50ff', 14),
  ('tread-croc-tq-5-50gn', 15),
  ('glory-valkerion-lf', 16),
  ('hurricane-enlil-is-7-55t', 17),
  ('shatter-horus-9-65gb', 18),
  ('cobalt-dragoon-2-60c', 19),
  ('soar-phoenix-9-60gf', 20),
  ('saber-samurai-2-70l', 21),
  ('blast-pegasus-a-tr', 22),
  ('drop-attack-battle-set', 23),
  ('sneak-attack-battle-set', 24),
  ('porta-deck-giallo', 25),
  ('porta-deck-verde-lime', 26),
  ('porta-deck-azzurro', 27),
  ('porta-deck-blu', 28),
  ('porta-deck-rosa', 29),
  ('porta-deck-fucsia', 30),
  ('porta-deck-bianco', 31)
)
update public.products as target
set sort_order = seed.sort_order
from seed
where target.slug = seed.slug;

commit;
