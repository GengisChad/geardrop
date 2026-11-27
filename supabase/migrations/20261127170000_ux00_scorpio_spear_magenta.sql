-- 2026-11-27, the owner: two UX-00 Scorpio Spear 0-70Z Metal Coat: Magenta at 100 euro, pre-ordered
-- on Telegram only and paid with PayPal.me only ("metti pre-order due scorpion spear ma quello
-- magenta, al vendita al prezzo di 100euro", "Telegram, PayPal.me").
--
--   UX-00 Scorpio Spear 0-70Z Metal Coat: Magenta   100,00   2 pieces, Telegram pre-order
--
-- The row is a pre-order of two pieces (availability_override, preorder_allocation): the one
-- count the bot reserves from (telegram_preorder_hold). The catalogue marks the product
-- channelOnly, so no page of the shop lists it while it is a pre-order.
--
-- Catalogue copy and price live in src/data/catalog.ts. Costs stay out of this public repository.
-- A replay changes nothing: the row is only inserted once.

begin;

with seed(category_slug, slug, name, tagline, description, price_cents, sort_order) as (
  values
  ('beyblade-x', 'ux-00-scorpio-spear-0-70z-magenta', 'UX-00 Scorpio Spear 0-70Z Metal Coat: Magenta', 'Esclusiva app/eventi. Sei lame, Metal Coat Magenta.',
   'UX-00 Scorpio Spear 0-70Z è il Booster di Takara Tomy in edizione esclusiva app/eventi: la trottola Scorpio Spear in Metal Coat Magenta, con ratchet 0-70 e bit Z (Zap). La blade ha sei lame in assetto difensivo che durante l''X-Dash si trasformano in tre lame in assetto d''attacco. Booster: nella confezione c''è solo la trottola, lanciatore e stadio non sono inclusi: servono quelli Beyblade X, venduti a parte. La vernice Metal Coat può consumarsi con l''uso. Prodotto originale giapponese, confezione in giapponese.',
   10000, 45)
),
inserted as (
  insert into public.products (
    category_id, slug, sku, name, tagline, description, price_cents,
    compare_at_price_cents, publication_status, active, stock_quantity,
    availability_override, preorder_allocation, allow_backorder, blade_type, rating, review_count, sort_order
  )
  select
    category.id, seed.slug, upper(seed.slug), seed.name, seed.tagline, seed.description, seed.price_cents,
    null, 'published'::public.publication_status, true, 0,
    'preorder'::public.availability_override, 2, false, null, 0, 0, seed.sort_order
  from seed
  join public.categories as category on category.slug = seed.category_slug
  -- Only a new row: a replay must never give back pieces already pre-ordered.
  where not exists (select 1 from public.products as existing where existing.slug = seed.slug)
  returning id
)
insert into public.product_images (product_id, src, width, height, alt, sort_order, published, is_primary)
select inserted.id, '/products/ux-00-scorpio-spear-0-70z-magenta.webp', 1000, 1000, 'Trottola Takara Tomy UX-00 Scorpio Spear 0-70Z Metal Coat Magenta, edizione esclusiva app/eventi', 0, true, true
from inserted
on conflict (product_id, sort_order) do nothing;

commit;
