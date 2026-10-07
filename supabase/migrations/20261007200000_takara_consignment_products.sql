-- 2026-10-07, the owner: the first Takara Tomy pieces, on consignment from our partner
-- (NerdPoint), two of each. He keeps them in his warehouse and ships them himself, so they sell
-- from his count and simply sell out: no pre-order at zero (allow_backorder false).
--
-- Catalogue copy, brand, commission and prices live in src/data/catalog.ts; this gives the live
-- database the rows the Stripe webhook scales stock from and the admin counts. Stripe is aligned
-- separately with pnpm stripe:products --apply.

begin;

with seed(category_slug, slug, name, tagline, description, price_cents, blade_type, sort_order) as (
  values
  ('beyblade-x', 'cx-00-evangelion-deck-set', 'CX-00 Evangelion Deck Set', 'Tre trottole Evangelion per i 30 anni della serie.',
   'Il CX-00 Evangelion Deck Set è l''edizione Takara Tomy per i 30 anni di Evangelion: tre trottole Beyblade X ispirate alle Unità 00, 01 e 02 (EvaArc, EvaBrave ed EvaBrush), due lanciatori Winder e il box porta trottole EVA HANGAR. Prodotto originale giapponese, confezione in giapponese. Spedito dal nostro partner.',
   13500, null, 27),
  ('beyblade-x', 'ux-00-glory-valkyrie-lf', 'UX-00 Glory Valkyrie LF', 'B4 Limited, Metal Coat blu.',
   'UX-00 Glory Valkyrie LF è l''edizione limitata B4 (Beyblade Battle Base) di Takara Tomy, con la blade in Metal Coat blu e il Bit Low Flat (LF) a punta piatta e bassa per un attacco rapido. Lo starter include il lanciatore a corda. Prodotto originale giapponese, confezione in giapponese. Spedito dal nostro partner.',
   20500, 'attacco', 28),
  ('beyblade-x', 'cx-00-tigarage-ft3-60t', 'CX-00 Tigarage FT3-60T', 'B4 Limited, collaborazione Ultraman Tiga.',
   'CX-00 Tigarage FT3-60T è l''edizione limitata B4 (Beyblade Battle Base) di Takara Tomy nata dalla collaborazione con Ultraman Tiga. Lo starter include il lanciatore e gli adesivi della collaborazione. Prodotto originale giapponese, confezione in giapponese. Spedito dal nostro partner.',
   10399, null, 29)
)
insert into public.products (
  category_id, slug, sku, name, tagline, description, price_cents,
  compare_at_price_cents, publication_status, active, stock_quantity,
  availability_override, preorder_allocation, allow_backorder, blade_type, rating, review_count, sort_order
)
select
  category.id, seed.slug, upper(seed.slug), seed.name, seed.tagline, seed.description, seed.price_cents,
  null, 'published'::public.publication_status, true, 2,
  null, 0, false, seed.blade_type::public.blade_type, 0, 0, seed.sort_order
from seed
join public.categories as category on category.slug = seed.category_slug
-- Only new rows: a replay must never reset a count the shop has already sold from.
on conflict (slug) do nothing;

with seed(product_slug, src, alt) as (
  values
  ('cx-00-evangelion-deck-set', '/products/cx-00-evangelion-deck-set.webp', 'Confezione Takara Tomy Beyblade X CX-00 Evangelion Deck Set con tre trottole e i personaggi di Evangelion'),
  ('ux-00-glory-valkyrie-lf', '/products/ux-00-glory-valkyrie-lf.webp', 'Confezione Takara Tomy Beyblade X UX-00 Glory Valkyrie LF B4 Limited con trottola blu metallizzata'),
  ('cx-00-tigarage-ft3-60t', '/products/cx-00-tigarage-ft3-60t.webp', 'Confezione Takara Tomy Beyblade X CX-00 Tigarage FT3-60T B4 Limited con Ultraman Tiga')
)
insert into public.product_images (product_id, src, width, height, alt, sort_order, published, is_primary)
select product.id, seed.src, 1000, 1000, seed.alt, 0, true, true
from seed
join public.products as product on product.slug = seed.product_slug
on conflict (product_id, sort_order) do nothing;

commit;
