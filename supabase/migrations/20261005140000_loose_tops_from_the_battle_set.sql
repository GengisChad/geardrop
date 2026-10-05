-- Impact Drake 9-60LR and Hover Wyvern 3-85N, sold loose out of the Drop Attack Battle Set.
--
-- The owner opened six sets and sold the tops by hand before they were ever listed: a
-- 9-60 ratchet and a Low Rush bit for the price of a booster is what people were asking
-- for, and 102 sets were sitting whole. They ship bagged and sealed, without a launcher
-- — the one in the set is Hasbro's proto and not worth passing on — and the product copy
-- says so rather than letting a buyer find out.
--
-- The two bundles built around them (Deck Completo, Trio Starter) need no rows: a bundle
-- in this catalogue is a storefront composite whose stock derives from its pieces.
--
-- Six pieces each, entered as a goods-in movement rather than appearing from nowhere.

begin;
select pg_advisory_xact_lock(hashtext('20261005140000_loose_tops_from_the_battle_set'));

insert into public.products (
  category_id, slug, sku, name, tagline, description, price_cents,
  publication_status, active, stock_quantity, allow_backorder, rating, review_count, sort_order
)
select
  category.id, seed.slug, seed.sku, seed.name, seed.tagline, seed.description, seed.price_cents,
  'published'::public.publication_status, true,
  0 as stock_quantity,
  false, 0, 0, seed.sort_order
from (values
  ('impact-drake-9-60lr', 'IMPACT-DRAKE-9-60LR', 'Impact Drake 9-60LR',
   'Il Low Rush al prezzo di un booster.',
   'Impact Drake 9-60LR è la trottola d''attacco del Drop Attack Battle Set, qui venduta da sola: Ratchet 9-60 e Bit LR (Low Rush), due pezzi che nelle classifiche dei tornei compaiono spesso sotto blade diverse. Arriva imbustata e sigillata, estratta dal set e senza confezione singola. Non include il lanciatore. Richiede lanciatore e Beystadium Beyblade X (venduti separatamente).',
   1300, 7),
  ('hover-wyvern-3-85n', 'HOVER-WYVERN-3-85N', 'Hover Wyvern 3-85N',
   'Difesa alta. Resta in piedi.',
   'Hover Wyvern 3-85N è la trottola da difesa del Drop Attack Battle Set, qui venduta da sola: blade Hover Wyvern, Ratchet 3-85 fra i più alti della serie e Bit N (Needle). Arriva imbustata e sigillata, estratta dal set e senza confezione singola. Non include il lanciatore. Richiede lanciatore e Beystadium Beyblade X (venduti separatamente).',
   1300, 8)
) as seed(slug, sku, name, tagline, description, price_cents, sort_order)
join public.categories as category on category.slug = 'beyblade-x'
on conflict (slug) do update set
  name = excluded.name, tagline = excluded.tagline, description = excluded.description,
  price_cents = excluded.price_cents, publication_status = excluded.publication_status,
  active = excluded.active, sort_order = excluded.sort_order;

with seed(product_slug, src, width, height, alt, sort_order) as (
  values
  ('impact-drake-9-60lr', '/products/impact-drake-9-60lr.webp', 1000, 1000, 'Trottola Beyblade X Impact Drake 9-60LR rossa e argento con il gear chip del drago azzurro', 0),
  ('hover-wyvern-3-85n', '/products/hover-wyvern-3-85n.webp', 1000, 1000, 'Trottola Beyblade X Hover Wyvern 3-85N argento con la blade verde trasparente e il gear chip del wyvern', 0)
)
insert into public.product_images (product_id, src, width, height, alt, sort_order, published, is_primary)
select product.id, seed.src, seed.width, seed.height, seed.alt, seed.sort_order, true, seed.sort_order = 0
from seed join public.products as product on product.slug = seed.product_slug
on conflict (product_id, sort_order) do update set
  src = excluded.src, width = excluded.width, height = excluded.height, alt = excluded.alt;

with seed(product_slug, label, value, sort_order) as (
  values
  ('impact-drake-9-60lr', 'Produttore', 'Hasbro (prodotto originale)', 0),
  ('impact-drake-9-60lr', 'Sistema', 'Beyblade X', 1),
  ('impact-drake-9-60lr', 'Codice', '9-60LR', 2),
  ('impact-drake-9-60lr', 'Componenti', '1 trottola', 3),
  ('impact-drake-9-60lr', 'Confezione', 'Imbustata e sigillata, estratta dal Battle Set', 4),
  ('impact-drake-9-60lr', 'Nota', 'Richiede lanciatore e Beystadium (venduti a parte)', 5),
  ('hover-wyvern-3-85n', 'Produttore', 'Hasbro (prodotto originale)', 0),
  ('hover-wyvern-3-85n', 'Sistema', 'Beyblade X', 1),
  ('hover-wyvern-3-85n', 'Codice', '3-85N', 2),
  ('hover-wyvern-3-85n', 'Componenti', '1 trottola', 3),
  ('hover-wyvern-3-85n', 'Confezione', 'Imbustata e sigillata, estratta dal Battle Set', 4),
  ('hover-wyvern-3-85n', 'Nota', 'Richiede lanciatore e Beystadium (venduti a parte)', 5)
)
insert into public.product_specs (product_id, label, value, sort_order)
select product.id, seed.label, seed.value, seed.sort_order
from seed join public.products as product on product.slug = seed.product_slug
on conflict (product_id, sort_order) do update set label = excluded.label, value = excluded.value;

with seed(product_slug, title, description, sort_order) as (
  values
  ('impact-drake-9-60lr', 'Ratchet 9-60', 'Assetto basso a 6,0 mm, nove punti di contatto', 0),
  ('impact-drake-9-60lr', 'Bit Low Rush', 'Punta bassa che scatta e riprende quota', 1),
  ('impact-drake-9-60lr', 'Solo la trottola', 'Il lanciatore non è incluso', 2),
  ('impact-drake-9-60lr', 'Da sapere prima di comprare', 'Estratta dal Drop Attack Battle Set: imbustata e sigillata, senza la sua confezione', 3),
  ('hover-wyvern-3-85n', 'Ratchet 3-85', 'Fra gli assetti più alti: tiene la trottola lontana dai colpi', 0),
  ('hover-wyvern-3-85n', 'Bit Needle', 'Punta sottile, attrito minimo', 1),
  ('hover-wyvern-3-85n', 'Solo la trottola', 'Il lanciatore non è incluso', 2),
  ('hover-wyvern-3-85n', 'Da sapere prima di comprare', 'Estratta dal Drop Attack Battle Set: imbustata e sigillata, senza la sua confezione', 3)
)
insert into public.product_features (product_id, title, description, sort_order)
select product.id, seed.title, seed.description, seed.sort_order
from seed join public.products as product on product.slug = seed.product_slug
on conflict (product_id, sort_order) do update set title = excluded.title, description = excluded.description;

with seed(product_slug, content, sort_order) as (
  values
  ('impact-drake-9-60lr', '1 × Trottola Impact Drake 9-60LR imbustata', 0),
  ('hover-wyvern-3-85n', '1 × Trottola Hover Wyvern 3-85N imbustata', 0)
)
insert into public.product_box_contents (product_id, content, sort_order)
select product.id, seed.content, seed.sort_order
from seed join public.products as product on product.slug = seed.product_slug
on conflict (product_id, sort_order) do update set content = excluded.content;

-- Six of each, from the six Battle Sets already opened. Through the ledger, so the stock
-- has a reason rather than a number someone typed. stock_after is the running total the
-- table records for every movement; here the product starts at zero, so it is the delta.
insert into public.inventory_movements (product_id, delta, stock_after, reason, note)
select product.id, 6, product.stock_quantity + 6, 'initial'::public.inventory_reason,
       'Sei Drop Attack Battle Set aperti: le due trottole passano a vendita singola'
from public.products as product
where product.slug in ('impact-drake-9-60lr', 'hover-wyvern-3-85n')
  and not exists (
    select 1 from public.inventory_movements as movement
    where movement.product_id = product.id
  );

update public.products as product
set stock_quantity = (
  select coalesce(sum(movement.delta), 0)
  from public.inventory_movements as movement
  where movement.product_id = product.id
)
where product.slug in ('impact-drake-9-60lr', 'hover-wyvern-3-85n');

commit;
