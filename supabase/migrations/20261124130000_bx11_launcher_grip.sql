-- 2026-11-24, the owner: "era da cambiare CUSTOM-GRIP-TAKARA-TOMY in bx-11 che sarebbe il grip
-- classico nero". The listing that sold three Custom Grip editions out of one lot (BX-30, BX-41,
-- BX-42) now sells Takara Tomy's black BX-11 Launcher Grip.
--
-- The slug stays custom-grip-takara-tomy: it is the page's address and the key the shop's stock
-- read, the Stripe product (gd_custom_grip_takara_tomy) and the orders match on. The row takes the
-- catalogue's new copy (src/data/catalog.ts), Takara Tomy's renders and the barcode printed on the
-- BX-11 box (JAN 4904810910787, from Takara Tomy's lineup/bx11.html). The SKU becomes BX-11 unless
-- the back office already changed it. The price is 23,99, two euros under the Custom Grip's 25,99
-- (owner, the same day), with no struck-through figure: the BX-11 never sold at 25,99. The stock is
-- left alone. Stripe's product name and price follow with pnpm stripe:products --apply.
--
-- A replay writes the same values again.

begin;

with grip as (
  select id from public.products
  where slug = 'custom-grip-takara-tomy'
    and organization_id = (select id from public.organizations where slug = 'geardrop')
)
update public.products as product
set name = 'BX-11 Launcher Grip Takara Tomy',
    tagline = 'Il grip nero classico. Si monta sul lanciatore.',
    description = 'Il Launcher Grip BX-11 è l''impugnatura originale Takara Tomy, nera, che si monta sul lanciatore Beyblade X (venduto a parte): ha una forma comoda da impugnare e rende il lancio più stabile. Nella confezione c''è anche il suo pannello con il logo Beyblade X. Lanciatore, trottola e Beystadium non inclusi. Prodotto originale giapponese, confezione in giapponese.',
    sku = case when product.sku = 'CUSTOM-GRIP-TAKARA-TOMY' then 'BX-11' else product.sku end,
    price_cents = 2399,
    compare_at_price_cents = null,
    gtin = case
      when exists (select 1 from public.products as other where other.gtin = '4904810910787' and other.id <> product.id) then product.gtin
      else '4904810910787'
    end
from grip
where product.id = grip.id;

-- The Custom Grip photos go; a photo uploaded to the media library stays where it is.
delete from public.product_images
where product_id in (select id from public.products where slug = 'custom-grip-takara-tomy' and organization_id = (select id from public.organizations where slug = 'geardrop'))
  and media_asset_id is null;

with photos(src, alt, photo_order) as (
  values
  ('/products/custom-grip-takara-tomy.webp', 'Launcher Grip BX-11 Takara Tomy Beyblade X nero, con il logo Beyblade X', 0),
  ('/products/custom-grip-takara-tomy-bx11_05.webp', 'Il Launcher Grip BX-11 con il suo pannello smontato', 1),
  ('/products/custom-grip-takara-tomy-bx11_02.webp', 'Il Launcher Grip BX-11 visto da sotto, con l''aggancio al lanciatore', 2)
)
insert into public.product_images (product_id, src, width, height, alt, sort_order, published, is_primary)
select product.id, photos.src, 1000, 1000, photos.alt, photos.photo_order, true,
  photos.photo_order = 0
    and not exists (select 1 from public.product_images as image where image.product_id = product.id and image.is_primary)
from photos
join public.products as product on product.id in (select id from public.products where slug = 'custom-grip-takara-tomy' and organization_id = (select id from public.organizations where slug = 'geardrop'))
-- A place still held by a media-library photo keeps it.
on conflict (product_id, sort_order) do nothing;

-- Specs, features and box contents of the BX-11, as the catalogue lists them.
delete from public.product_specs where product_id in (select id from public.products where slug = 'custom-grip-takara-tomy' and organization_id = (select id from public.organizations where slug = 'geardrop'));
delete from public.product_features where product_id in (select id from public.products where slug = 'custom-grip-takara-tomy' and organization_id = (select id from public.organizations where slug = 'geardrop'));
delete from public.product_box_contents where product_id in (select id from public.products where slug = 'custom-grip-takara-tomy' and organization_id = (select id from public.organizations where slug = 'geardrop'));

insert into public.product_specs (product_id, label, value, sort_order)
select product.id, spec.label, spec.value, spec.sort_order
from (values
  ('Produttore', 'Takara Tomy (prodotto originale giapponese)', 0),
  ('Sistema', 'Beyblade X', 1),
  ('Tipo', 'Impugnatura per lanciatore', 2),
  ('Modello', 'BX-11 Launcher Grip', 3),
  ('Colore', 'Nero', 4),
  ('Confezione', 'In giapponese', 5),
  ('Nota', 'Lanciatore non incluso', 6)
) as spec(label, value, sort_order)
join public.products as product on product.id in (select id from public.products where slug = 'custom-grip-takara-tomy' and organization_id = (select id from public.organizations where slug = 'geardrop'));

insert into public.product_features (product_id, title, description, sort_order)
select product.id, feature.title, feature.description, feature.sort_order
from (values
  ('Lancio più stabile', 'La forma è più comoda da impugnare', 0),
  ('Il grip classico', 'Nero, con il pannello Beyblade X', 1),
  ('Da sapere prima di comprare', 'Il lanciatore non è incluso: il grip si monta su uno che hai già', 2)
) as feature(title, description, sort_order)
join public.products as product on product.id in (select id from public.products where slug = 'custom-grip-takara-tomy' and organization_id = (select id from public.organizations where slug = 'geardrop'));

insert into public.product_box_contents (product_id, content, sort_order)
select product.id, box.content, box.sort_order
from (values
  ('1 × Launcher Grip BX-11', 0),
  ('1 × Pannello del grip', 1)
) as box(content, sort_order)
join public.products as product on product.id in (select id from public.products where slug = 'custom-grip-takara-tomy' and organization_id = (select id from public.organizations where slug = 'geardrop'));

commit;
