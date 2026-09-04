begin;

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('geardrop:preorder-catalog:2026-09-04', 0)
);

create table if not exists private.preorder_catalog_campaigns (
  campaign_key text primary key,
  applied_at timestamptz not null default now()
);
revoke all on table private.preorder_catalog_campaigns from public, anon, authenticated, service_role;

-- The original bootstrap constrained SKUs to lower-case even though the shop's internal
-- convention is upper-case. Keep them unique case-insensitively and allow both legacy
-- and current rows without rewriting unrelated merchant data.
alter table public.products drop constraint if exists products_sku_check;
alter table public.products drop constraint if exists products_sku_nonempty_check;
alter table public.products add constraint products_sku_nonempty_check
  check (sku = btrim(sku) and sku <> '');
create unique index if not exists products_sku_case_insensitive_idx
  on public.products (lower(sku));

create temporary table preorder_catalog_seed (
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

insert into preorder_catalog_seed (
  slug, initial_allocation, category_slug, sku, name, tagline, description,
  price_cents, blade_type, sort_order
) values
  ('cobalt-dragoon-2-60c', 10, 'beyblade-x', 'COBALT-DRAGOON-2-60C', 'Cobalt Dragoon 2-60C', 'Attacco left-spin. Smash devastante.', 'Cobalt Dragoon 2-60C è una trottola d''attacco a rotazione sinistra (left-spin): quattro lame inclinate verso l''alto concentrano uno Smash Attack estremo, mentre il Ratchet 2-60 e il Bit Cyclone bilanciano velocità e stabilità. Lo starter include il lanciatore a corda left-spin dedicato.', 2550, 'attacco', 0),
  ('soar-phoenix-9-60gf', 60, 'beyblade-x', 'SOAR-PHOENIX-9-60GF', 'Soar Phoenix 9-60GF', 'Upper attack. Colpisci verso l''alto.', 'Soar Phoenix 9-60GF è una trottola d''attacco a tre lame che salgono verso l''alto per un Upper Attack capace di sollevare l''avversario, unito allo Smash che lo spinge fuori arena. Tra le blade più pesanti della serie. Lo starter include il lanciatore a corda.', 3200, 'attacco', 1),
  ('saber-samurai-2-70l', 30, 'beyblade-x', 'SABER-SAMURAI-2-70L', 'Saber Samurai 2-70L', 'Doppia lama. Colpi da katana.', 'Saber Samurai 2-70L (linea UX) è una trottola d''attacco: le due protuberanze si ritraggono a metà battaglia, passando da colpi ripetuti in stile katana a un singolo impatto "tachi" per KO improvvisi. Lo starter include il lanciatore con impugnatura (grip).', 2790, 'attacco', 2),
  ('blast-pegasus-a-tr', 30, 'beyblade-x', 'BLAST-PEGASUS-A-TR', 'Blast Pegasus A Tr', 'Attacco portatile. Clip & Rip Launcher.', 'Blast Pegasus A Tr è una trottola d''attacco a rotazione destra della linea CX, venduta con il Clip & Rip Launcher: un lanciatore portatile che si aggancia a cintura e zaino e ripone il ripcord all''interno. Richiede un Beystadium Beyblade X (venduto separatamente).', 2950, 'attacco', 3),
  ('drop-attack-battle-set', 30, 'stadi', 'DROP-ATTACK-BATTLE-SET', 'Drop Attack Battle Set', 'Stadio + 2 trottole + 2 lanciatori.', 'Il Drop Attack Battle Set include tutto per giocare: il Beystadium con X-Celerator Rail rialzato che porta le trottole in alto per farle piombare sull''avversario, due trottole (Impact Drake 9-60LR d''attacco e Hover Wyvern 3-85N di difesa) e due lanciatori a corda.', 4650, null, 4),
  ('sneak-attack-battle-set', 30, 'stadi', 'SNEAK-ATTACK-BATTLE-SET', 'Sneak Attack Battle Set', 'Stadio verde + 2 trottole + 2 lanciatori.', 'Il Sneak Attack Battle Set mette in scatola tutto per il primo scontro: il Beystadium con rail a scomparsa che devia le trottole in una nuova direzione, due trottole (Rampart Aegis GB di stamina e Cutter Shinobi LF d''attacco) e due lanciatori a corda.', 4500, null, 5);

do $$
begin
  if not exists (
    select 1 from private.preorder_catalog_campaigns
    where campaign_key = '2026-09-04-owner-preorder-catalog'
  ) and exists (
    select 1
    from public.products as product
    join preorder_catalog_seed as seed on seed.slug = product.slug
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
  compare_at_price_cents, publication_status, published_at, active,
  stock_quantity, availability_override, preorder_allocation, blade_type,
  rating, review_count, sort_order
)
select
  category.id, seed.slug, seed.sku, seed.name, seed.tagline, seed.description,
  seed.price_cents, null, 'published', now(), true, 0, 'preorder',
  seed.initial_allocation, seed.blade_type, 0, 0, seed.sort_order
from preorder_catalog_seed as seed
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
  published_at = coalesce(public.products.published_at, excluded.published_at),
  active = true,
  availability_override = 'preorder',
  preorder_allocation = case
    when exists (
      select 1 from private.preorder_catalog_campaigns
      where campaign_key = '2026-09-04-owner-preorder-catalog'
    ) then public.products.preorder_allocation
    else excluded.preorder_allocation
  end,
  blade_type = excluded.blade_type,
  rating = case
    when exists (
      select 1 from private.preorder_catalog_campaigns
      where campaign_key = '2026-09-04-owner-preorder-catalog'
    ) then public.products.rating
    else excluded.rating
  end,
  review_count = case
    when exists (
      select 1 from private.preorder_catalog_campaigns
      where campaign_key = '2026-09-04-owner-preorder-catalog'
    ) then public.products.review_count
    else excluded.review_count
  end,
  sort_order = excluded.sort_order;

update public.products
set publication_status = 'archived', active = false
where slug in (
  'stadio-beystadium-x-attack-set',
  'wizard-arrow-4-80b',
  'phoenix-wing-9-60gf',
  'shark-edge-3-60lf',
  'dran-sword-4-80db',
  'dran-buster-1-60a'
);

update public.product_images
set published = false, is_primary = false
where product_id in (select id from public.products where slug in (select slug from preorder_catalog_seed));

with image_seed(product_slug, src, alt) as (
  values
    ('cobalt-dragoon-2-60c', '/products/cobalt-dragoon-2-60c.webp', 'Confezione Beyblade X Cobalt Dragoon 2-60C con lanciatore a corda blu e trottola'),
    ('soar-phoenix-9-60gf', '/products/soar-phoenix-9-60gf.webp', 'Confezione Beyblade X Soar Phoenix 9-60GF rossa con lanciatore e trottola'),
    ('saber-samurai-2-70l', '/products/saber-samurai-2-70l.webp', 'Confezione Beyblade X Saber Samurai 2-70L viola con lanciatore a impugnatura e trottola'),
    ('blast-pegasus-a-tr', '/products/blast-pegasus-a-tr.webp', 'Beyblade X Blast Pegasus A Tr con Clip & Rip Launcher verde e trottola'),
    ('drop-attack-battle-set', '/products/drop-attack-battle-set.webp', 'Beyblade X Drop Attack Battle Set: stadio blu, due trottole e due lanciatori'),
    ('sneak-attack-battle-set', '/products/sneak-attack-battle-set.webp', 'Beyblade X Sneak Attack Battle Set: stadio verde, due trottole e due lanciatori')
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
where product_id in (select id from public.products where slug in (select slug from preorder_catalog_seed));
with detail(product_slug, label, value, sort_order) as (
  values
    ('cobalt-dragoon-2-60c','Tipo','Attacco (left-spin)',0),('cobalt-dragoon-2-60c','Sistema','Beyblade X',1),('cobalt-dragoon-2-60c','Codice','2-60C',2),('cobalt-dragoon-2-60c','Componenti','1 trottola, 1 lanciatore a corda',3),('cobalt-dragoon-2-60c','Materiale','Plastica e metallo',4),
    ('soar-phoenix-9-60gf','Tipo','Attacco',0),('soar-phoenix-9-60gf','Sistema','Beyblade X',1),('soar-phoenix-9-60gf','Codice','9-60GF',2),('soar-phoenix-9-60gf','Componenti','1 trottola, 1 lanciatore a corda',3),('soar-phoenix-9-60gf','Materiale','Plastica e metallo',4),
    ('saber-samurai-2-70l','Tipo','Attacco',0),('saber-samurai-2-70l','Sistema','Beyblade X',1),('saber-samurai-2-70l','Linea','UX (UX-09)',2),('saber-samurai-2-70l','Codice','2-70L',3),('saber-samurai-2-70l','Componenti','1 trottola, 1 lanciatore con impugnatura',4),
    ('blast-pegasus-a-tr','Tipo','Attacco',0),('blast-pegasus-a-tr','Sistema','Beyblade X',1),('blast-pegasus-a-tr','Linea','CX',2),('blast-pegasus-a-tr','Componenti','1 trottola, 1 Clip & Rip Launcher',3),('blast-pegasus-a-tr','Nota','Richiede un Beystadium (venduto a parte)',4),
    ('drop-attack-battle-set','Tipo','Kit arena',0),('drop-attack-battle-set','Sistema','Beyblade X',1),('drop-attack-battle-set','Componenti','1 stadio, 2 trottole, 2 lanciatori',2),('drop-attack-battle-set','Trottole incluse','Impact Drake 9-60LR, Hover Wyvern 3-85N',3),('drop-attack-battle-set','Materiale','Plastica e metallo',4),
    ('sneak-attack-battle-set','Tipo','Kit arena',0),('sneak-attack-battle-set','Sistema','Beyblade X',1),('sneak-attack-battle-set','Componenti','1 stadio, 2 trottole, 2 lanciatori',2),('sneak-attack-battle-set','Trottole incluse','Rampart Aegis GB, Cutter Shinobi LF',3),('sneak-attack-battle-set','Materiale','Plastica e metallo',4)
)
insert into public.product_specs(product_id,label,value,sort_order)
select product.id,detail.label,detail.value,detail.sort_order from detail
join public.products as product on product.slug=detail.product_slug;

delete from public.product_features
where product_id in (select id from public.products where slug in (select slug from preorder_catalog_seed));
with detail(product_slug, title, description, sort_order) as (
  values
    ('cobalt-dragoon-2-60c','Rotazione sinistra','Left-spin che spiazza gli assetti a rotazione destra',0),('cobalt-dragoon-2-60c','Smash estremo','Quattro lame inclinate per KO potenti',1),('cobalt-dragoon-2-60c','Starter completo','Include il lanciatore a corda dedicato',2),('cobalt-dragoon-2-60c','Compatibile Beyblade X','Blade, Ratchet e Bit intercambiabili con la serie',3),
    ('soar-phoenix-9-60gf','Upper Attack','Le tre lame sollevano l''avversario da terra',0),('soar-phoenix-9-60gf','Peso elevato','Massa che domina i confronti d''attacco',1),('soar-phoenix-9-60gf','Starter completo','Include il lanciatore a corda',2),('soar-phoenix-9-60gf','Compatibile Beyblade X','Blade, Ratchet e Bit intercambiabili con la serie',3),
    ('saber-samurai-2-70l','Gimmick a doppia modalità','Da colpi ripetuti a singolo impatto tachi',0),('saber-samurai-2-70l','Linea UX','Meccanica esclusiva della Unique Line',1),('saber-samurai-2-70l','Lanciatore grip incluso','Impugnatura per lanci potenti e stabili',2),('saber-samurai-2-70l','Compatibile Beyblade X','Blade, Ratchet e Bit intercambiabili con la serie',3),
    ('blast-pegasus-a-tr','Clip & Rip Launcher','Lanciatore portatile: si aggancia e riponi il ripcord',0),('blast-pegasus-a-tr','Linea CX','Trottola d''attacco a rotazione destra',1),('blast-pegasus-a-tr','X-Celerator','Accelera sull''X-Celerator Rail dello stadio',2),('blast-pegasus-a-tr','Compatibile Beyblade X','Blade, Ratchet e Bit intercambiabili con la serie',3),
    ('drop-attack-battle-set','X-Celerator Rail rialzato','Porta le trottole in alto per il Drop Attack',0),('drop-attack-battle-set','Set completo','Stadio, due trottole e due lanciatori pronti al gioco',1),('drop-attack-battle-set','Impact Drake + Hover Wyvern','Un assetto d''attacco e uno di difesa',2),('drop-attack-battle-set','Compatibile Beyblade X','Usa tutte le trottole e parti della serie',3),
    ('sneak-attack-battle-set','Rail a scomparsa','Devia le trottole in una nuova direzione a sorpresa',0),('sneak-attack-battle-set','Set completo','Stadio, due trottole e due lanciatori pronti al gioco',1),('sneak-attack-battle-set','Rampart Aegis + Cutter Shinobi','Un assetto di stamina e uno d''attacco',2),('sneak-attack-battle-set','Compatibile Beyblade X','Usa tutte le trottole e parti della serie',3)
)
insert into public.product_features(product_id,title,description,sort_order)
select product.id,detail.title,detail.description,detail.sort_order from detail
join public.products as product on product.slug=detail.product_slug;

delete from public.product_box_contents
where product_id in (select id from public.products where slug in (select slug from preorder_catalog_seed));
with detail(product_slug, content, sort_order) as (
  values
    ('cobalt-dragoon-2-60c','1 × Trottola Cobalt Dragoon 2-60C',0),('cobalt-dragoon-2-60c','1 × Lanciatore a corda left-spin',1),('cobalt-dragoon-2-60c','Manuale',2),
    ('soar-phoenix-9-60gf','1 × Trottola Soar Phoenix 9-60GF',0),('soar-phoenix-9-60gf','1 × Lanciatore a corda',1),('soar-phoenix-9-60gf','Manuale',2),
    ('saber-samurai-2-70l','1 × Trottola Saber Samurai 2-70L',0),('saber-samurai-2-70l','1 × Lanciatore con impugnatura',1),('saber-samurai-2-70l','1 × Winder',2),('saber-samurai-2-70l','Manuale',3),
    ('blast-pegasus-a-tr','1 × Trottola Blast Pegasus A Tr',0),('blast-pegasus-a-tr','1 × Clip & Rip Launcher',1),('blast-pegasus-a-tr','1 × Ripcord',2),('blast-pegasus-a-tr','Manuale',3),
    ('drop-attack-battle-set','1 × Beystadium Drop Attack',0),('drop-attack-battle-set','1 × Impact Drake 9-60LR',1),('drop-attack-battle-set','1 × Hover Wyvern 3-85N',2),('drop-attack-battle-set','2 × Lanciatori a corda',3),('drop-attack-battle-set','Manuale di gioco',4),
    ('sneak-attack-battle-set','1 × Beystadium Sneak Attack',0),('sneak-attack-battle-set','1 × Rampart Aegis GB',1),('sneak-attack-battle-set','1 × Cutter Shinobi LF',2),('sneak-attack-battle-set','2 × Lanciatori a corda',3),('sneak-attack-battle-set','Manuale di gioco',4)
)
insert into public.product_box_contents(product_id,content,sort_order)
select product.id,detail.content,detail.sort_order from detail
join public.products as product on product.slug=detail.product_slug;

delete from public.product_tags
where product_id in (select id from public.products where slug in (select slug from preorder_catalog_seed));
delete from public.product_relations
where product_id in (select id from public.products where slug in (select slug from preorder_catalog_seed));
with relation(product_slug, related_slug, sort_order) as (
  values
    ('cobalt-dragoon-2-60c','blast-pegasus-a-tr',0),('cobalt-dragoon-2-60c','soar-phoenix-9-60gf',1),('cobalt-dragoon-2-60c','saber-samurai-2-70l',2),
    ('soar-phoenix-9-60gf','cobalt-dragoon-2-60c',0),('soar-phoenix-9-60gf','blast-pegasus-a-tr',1),('soar-phoenix-9-60gf','saber-samurai-2-70l',2),
    ('saber-samurai-2-70l','cobalt-dragoon-2-60c',0),('saber-samurai-2-70l','soar-phoenix-9-60gf',1),('saber-samurai-2-70l','blast-pegasus-a-tr',2),
    ('blast-pegasus-a-tr','cobalt-dragoon-2-60c',0),('blast-pegasus-a-tr','soar-phoenix-9-60gf',1),('blast-pegasus-a-tr','saber-samurai-2-70l',2),
    ('drop-attack-battle-set','sneak-attack-battle-set',0),('drop-attack-battle-set','cobalt-dragoon-2-60c',1),('drop-attack-battle-set','soar-phoenix-9-60gf',2),
    ('sneak-attack-battle-set','drop-attack-battle-set',0),('sneak-attack-battle-set','cobalt-dragoon-2-60c',1),('sneak-attack-battle-set','saber-samurai-2-70l',2)
)
insert into public.product_relations(product_id,related_product_id,relation_type,sort_order)
select product.id,related.id,'related',relation.sort_order from relation
join public.products as product on product.slug=relation.product_slug
join public.products as related on related.slug=relation.related_slug;

update public.bundles set
  description='Uno stadio e le trottole ad alte prestazioni per iniziare a dominare l''arena.',
  price_cents=9900, compare_at_price_cents=10400,
  hero_product_id=(select id from public.products where slug='drop-attack-battle-set')
where slug='bundle-campione';
delete from public.bundle_items
where bundle_id=(select id from public.bundles where slug='bundle-campione');
insert into public.bundle_items(bundle_id,product_id,quantity,sort_order)
select bundle.id,product.id,1,item.sort_order
from (values ('drop-attack-battle-set',0),('cobalt-dragoon-2-60c',1),('soar-phoenix-9-60gf',2)) as item(slug,sort_order)
join public.products as product on product.slug=item.slug
join public.bundles as bundle on bundle.slug='bundle-campione';

delete from public.homepage_section_products as relation
using public.homepage_sections as section
where relation.section_id=section.id
  and section.section_key in ('featured-products','latest-drops','bestsellers','competitive-picks');
insert into public.homepage_section_products(section_id,product_id,sort_order)
select section.id,product.id,product.sort_order
from public.homepage_sections as section
cross join public.products as product
where section.section_key in ('featured-products','latest-drops','bestsellers','competitive-picks')
  and product.slug in (select slug from preorder_catalog_seed);

insert into private.preorder_catalog_campaigns(campaign_key)
values ('2026-09-04-owner-preorder-catalog')
on conflict (campaign_key) do nothing;

-- Inventory adjustments accept the display SKU in either case after the SKU convention change.
create or replace function public.adjust_inventory(
  p_sku text, p_delta integer, p_reason public.inventory_reason, p_note text default null
)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid());
  target_product public.products%rowtype;
  next_stock integer;
begin
  if not private.has_staff_role(array['owner'::public.staff_role,'admin'::public.staff_role]) then
    raise exception using errcode='42501',message='GD_INVENTORY_MANAGER_REQUIRED';
  end if;
  if p_delta is null or p_delta=0 then
    raise exception using errcode='22023',message='GD_INVALID_STOCK_DELTA';
  end if;
  if p_reason not in ('manual_adjustment'::public.inventory_reason,'return'::public.inventory_reason,'damage'::public.inventory_reason) then
    raise exception using errcode='22023',message='GD_INVALID_MANUAL_STOCK_REASON';
  end if;
  select product.* into target_product from public.products as product
  where lower(product.sku)=lower(trim(p_sku)) for update;
  if not found then raise exception using errcode='P0002',message='GD_PRODUCT_NOT_FOUND'; end if;
  next_stock:=target_product.stock_quantity+p_delta;
  if next_stock<0 then raise exception using errcode='23514',message='GD_INSUFFICIENT_STOCK'; end if;
  update public.products set stock_quantity=next_stock where id=target_product.id;
  insert into public.inventory_movements(product_id,delta,stock_after,reason,actor_user_id,note)
  values(target_product.id,p_delta,next_stock,p_reason,actor_id,nullif(trim(p_note),''));
  insert into public.audit_events(actor_user_id,action,entity_type,entity_id,before_state,after_state)
  values(actor_id,'inventory.adjusted','products',target_product.id::text,
    jsonb_build_object('sku',target_product.sku,'stock_quantity',target_product.stock_quantity),
    jsonb_build_object('sku',target_product.sku,'stock_quantity',next_stock,'delta',p_delta,'reason',p_reason,'note',nullif(trim(p_note),'')));
  return next_stock;
end;
$$;

commit;
