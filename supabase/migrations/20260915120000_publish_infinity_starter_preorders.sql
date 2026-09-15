begin;

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('geardrop:preorder-catalog:2026-09-15', 0)
);

-- Three Beyblade X Infinity Starter Packs supplied by the owner on 2026-09-15, added to the
-- reviewed preorder catalogue with the guarantees of 20260904143000: a persistent campaign
-- marker so a rerun never replenishes consumed allocation, and a hard stop on an unexpected
-- live balance. Only these three products are touched.
create temporary table infinity_starter_seed (
  slug text primary key,
  initial_allocation integer not null,
  category_slug text not null,
  sku text not null,
  name text not null,
  tagline text not null,
  description text not null,
  price_cents integer not null,
  blade_type public.blade_type,
  sort_order integer not null
) on commit drop;

insert into infinity_starter_seed (
  slug, initial_allocation, category_slug, sku, name, tagline, description,
  price_cents, blade_type, sort_order
) values
  ('glory-valkerion-lf', 8, 'beyblade-x', 'GLORY-VALKERION-LF', 'Glory Valkerion LF', 'Attacco UX. Blade e ratchet in un pezzo.', 'Glory Valkerion LF (in Giappone Glory Valkyrie) è una trottola d''attacco a rotazione destra della linea UX: la blade integra il ratchet in un unico pezzo e il Bit Low Flat (LF), a punta piatta e bassa, la spinge in movimenti rapidi e aggressivi per agganciare l''Xtreme Line e scatenare l''Xtreme Dash. Lo starter include il lanciatore. Richiede un Beystadium Beyblade X (venduto separatamente).', 3000, 'attacco', 6),
  ('hurricane-enlil-is-7-55t', 10, 'beyblade-x', 'HURRICANE-ENLIL-IS-7-55T', 'Hurricane Enlil IS 7-55T', 'Bilanciata CX. Blade Infinity scomponibile.', 'Hurricane Enlil IS 7-55T è una trottola bilanciata a rotazione destra della linea CX: la blade Infinity si scompone in lock chip, over blade, blade metallica e assist blade per costruire l''assetto su misura, con Ratchet 7-55 e Bit T. Lo starter include il lanciatore. Richiede un Beystadium Beyblade X (venduto separatamente).', 2000, 'bilanciato', 7),
  ('shatter-horus-9-65gb', 8, 'beyblade-x', 'SHATTER-HORUS-9-65GB', 'Shatter Horus 9-65GB', 'Stamina BX. Metallo oltre i ganci.', 'Shatter Horus 9-65GB è una trottola stamina della linea BX: la blade dalla forma rotonda estende il metallo oltre i ganci del lanciatore e riveste di metallo anche il bordo del gear chip, che raffigura il dio egizio Horus. Monta il Ratchet 9-65 e il Bit GB. Lo starter include il lanciatore. Richiede un Beystadium Beyblade X (venduto separatamente).', 2000, 'stamina', 8);

do $$
begin
  if not exists (
    select 1 from private.preorder_catalog_campaigns
    where campaign_key = '2026-09-15-infinity-starter-preorders'
  ) and exists (
    select 1
    from public.products as product
    join infinity_starter_seed as seed on seed.slug = product.slug
    where product.stock_quantity <> 0
      or product.preorder_allocation <> 0
      or product.availability_override is not null
  ) then
    raise exception using errcode = '55000', message = 'GD_PREORDER_CATALOG_UNEXPECTED_BALANCE';
  end if;
end;
$$;

insert into public.products (
  category_id, slug, sku, name, tagline, description, price_cents,
  compare_at_price_cents, publication_status, active,
  stock_quantity, availability_override, preorder_allocation, blade_type,
  rating, review_count, sort_order
)
select
  category.id, seed.slug, seed.sku, seed.name, seed.tagline, seed.description,
  seed.price_cents, null, 'published', true, 0, 'preorder',
  seed.initial_allocation, seed.blade_type, 0, 0, seed.sort_order
from infinity_starter_seed as seed
join public.categories as category on category.slug = seed.category_slug
on conflict (slug) do update set
  category_id = excluded.category_id,
  sku = excluded.sku,
  name = excluded.name,
  tagline = excluded.tagline,
  description = excluded.description,
  price_cents = excluded.price_cents,
  compare_at_price_cents = excluded.compare_at_price_cents,
  publication_status = excluded.publication_status,
  active = true,
  availability_override = 'preorder',
  preorder_allocation = case
    when exists (
      select 1 from private.preorder_catalog_campaigns
      where campaign_key = '2026-09-15-infinity-starter-preorders'
    ) then public.products.preorder_allocation
    else excluded.preorder_allocation
  end,
  blade_type = excluded.blade_type,
  rating = case
    when exists (
      select 1 from private.preorder_catalog_campaigns
      where campaign_key = '2026-09-15-infinity-starter-preorders'
    ) then public.products.rating
    else excluded.rating
  end,
  review_count = case
    when exists (
      select 1 from private.preorder_catalog_campaigns
      where campaign_key = '2026-09-15-infinity-starter-preorders'
    ) then public.products.review_count
    else excluded.review_count
  end,
  sort_order = excluded.sort_order;

update public.product_images
set published = false, is_primary = false
where product_id in (select id from public.products where slug in (select slug from infinity_starter_seed));

with image_seed(product_slug, src, alt) as (
  values
    ('glory-valkerion-lf', '/products/glory-valkerion-lf.webp', 'Confezione Beyblade X Glory Valkerion LF bianca e oro con lanciatore e trottola'),
    ('hurricane-enlil-is-7-55t', '/products/hurricane-enlil-is-7-55t.webp', 'Confezione Beyblade X Hurricane Enlil IS 7-55T con lanciatore e trottola azzurra'),
    ('shatter-horus-9-65gb', '/products/shatter-horus-9-65gb.webp', 'Confezione Beyblade X Shatter Horus 9-65GB con lanciatore e trottola argento e rossa')
)
insert into public.product_images (
  product_id, src, width, height, alt, sort_order, published, is_primary
)
select product.id, image_seed.src, 1000, 1000, image_seed.alt, 0, true, true
from image_seed join public.products as product on product.slug = image_seed.product_slug
on conflict (product_id, sort_order) do update set
  src = excluded.src, width = excluded.width, height = excluded.height,
  alt = excluded.alt, published = true, is_primary = true;

delete from public.product_specs
where product_id in (select id from public.products where slug in (select slug from infinity_starter_seed));
with detail(product_slug, label, value, sort_order) as (
  values
    ('glory-valkerion-lf','Tipo','Attacco',0),('glory-valkerion-lf','Sistema','Beyblade X',1),('glory-valkerion-lf','Linea','UX (Infinity Starter Pack)',2),('glory-valkerion-lf','Codice','LF',3),('glory-valkerion-lf','Componenti','1 trottola, 1 lanciatore',4),
    ('hurricane-enlil-is-7-55t','Tipo','Bilanciata',0),('hurricane-enlil-is-7-55t','Sistema','Beyblade X',1),('hurricane-enlil-is-7-55t','Linea','CX (Infinity Starter Pack)',2),('hurricane-enlil-is-7-55t','Codice','IS 7-55T',3),('hurricane-enlil-is-7-55t','Componenti','1 trottola, 1 lanciatore',4),
    ('shatter-horus-9-65gb','Tipo','Stamina',0),('shatter-horus-9-65gb','Sistema','Beyblade X',1),('shatter-horus-9-65gb','Linea','BX (Infinity Starter Pack)',2),('shatter-horus-9-65gb','Codice','9-65GB',3),('shatter-horus-9-65gb','Componenti','1 trottola, 1 lanciatore',4)
)
insert into public.product_specs(product_id,label,value,sort_order)
select product.id,detail.label,detail.value,detail.sort_order from detail
join public.products as product on product.slug=detail.product_slug;

delete from public.product_features
where product_id in (select id from public.products where slug in (select slug from infinity_starter_seed));
with detail(product_slug, title, description, sort_order) as (
  values
    ('glory-valkerion-lf','Ratchet integrato','Blade e ratchet stampati in un unico pezzo',0),('glory-valkerion-lf','Bit Low Flat','Punta piatta e bassa per un attacco rapido',1),('glory-valkerion-lf','Xtreme Dash','Aggancia l''Xtreme Line dello stadio e accelera',2),('glory-valkerion-lf','Starter completo','Include il lanciatore',3),
    ('hurricane-enlil-is-7-55t','Blade Infinity scomponibile','Lock chip, over blade, blade metallica e assist blade',0),('hurricane-enlil-is-7-55t','Assetto bilanciato','Equilibrio tra attacco, difesa e resistenza',1),('hurricane-enlil-is-7-55t','Starter completo','Include il lanciatore',2),('hurricane-enlil-is-7-55t','Compatibile Beyblade X','Blade, Ratchet e Bit intercambiabili con la serie',3),
    ('shatter-horus-9-65gb','Metallo esteso','Il metallo supera i ganci del lanciatore',0),('shatter-horus-9-65gb','Forma rotonda','Profilo tondo pensato per la resistenza',1),('shatter-horus-9-65gb','Starter completo','Include il lanciatore',2),('shatter-horus-9-65gb','Compatibile Beyblade X','Blade, Ratchet e Bit intercambiabili con la serie',3)
)
insert into public.product_features(product_id,title,description,sort_order)
select product.id,detail.title,detail.description,detail.sort_order from detail
join public.products as product on product.slug=detail.product_slug;

delete from public.product_box_contents
where product_id in (select id from public.products where slug in (select slug from infinity_starter_seed));
with detail(product_slug, content, sort_order) as (
  values
    ('glory-valkerion-lf','1 × Trottola Glory Valkerion LF',0),('glory-valkerion-lf','1 × Lanciatore con ripcord',1),('glory-valkerion-lf','Manuale',2),
    ('hurricane-enlil-is-7-55t','1 × Trottola Hurricane Enlil IS 7-55T',0),('hurricane-enlil-is-7-55t','1 × Lanciatore con ripcord',1),('hurricane-enlil-is-7-55t','Manuale',2),
    ('shatter-horus-9-65gb','1 × Trottola Shatter Horus 9-65GB',0),('shatter-horus-9-65gb','1 × Lanciatore con ripcord',1),('shatter-horus-9-65gb','Manuale',2)
)
insert into public.product_box_contents(product_id,content,sort_order)
select product.id,detail.content,detail.sort_order from detail
join public.products as product on product.slug=detail.product_slug;

delete from public.product_relations
where product_id in (select id from public.products where slug in (select slug from infinity_starter_seed));
with relation(product_slug, related_slug, sort_order) as (
  values
    ('glory-valkerion-lf','cobalt-dragoon-2-60c',0),('glory-valkerion-lf','soar-phoenix-9-60gf',1),('glory-valkerion-lf','blast-pegasus-a-tr',2),
    ('hurricane-enlil-is-7-55t','shatter-horus-9-65gb',0),('hurricane-enlil-is-7-55t','glory-valkerion-lf',1),('hurricane-enlil-is-7-55t','blast-pegasus-a-tr',2),
    ('shatter-horus-9-65gb','hurricane-enlil-is-7-55t',0),('shatter-horus-9-65gb','glory-valkerion-lf',1),('shatter-horus-9-65gb','saber-samurai-2-70l',2)
)
insert into public.product_relations(product_id,related_product_id,relation_type,sort_order)
select product.id,related.id,'related',relation.sort_order from relation
join public.products as product on product.slug=relation.product_slug
join public.products as related on related.slug=relation.related_slug;

insert into private.preorder_catalog_campaigns(campaign_key)
values ('2026-09-15-infinity-starter-preorders')
on conflict (campaign_key) do nothing;

commit;
