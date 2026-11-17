-- 2026-11-13, the owner: "leva gli string right, sono rimasti solo left. Metti due Fenici rosse senza
-- launcher, quindi solo bey con ratchet e punta (tipo Wyvern e Impact Drake), al prezzo di 12.99 euro.
-- Mettine 2 per ora disponibili [...] e mettile come promo."
--
--   Soar Phoenix 9-60GF solo trottola   12,99    2   new, tag "offerta", no compare-at
--   String Launcher L Takara Tomy       16,99    -   only the left-spin ones are left: name and copy
--
-- An empty shelf is sold out, with "Avvisami": no pre-order at zero (allow_backorder false).
--
-- Catalogue copy and prices live in src/data/catalog.ts; this gives the live database the rows the
-- Stripe webhook scales stock from and the admin counts. Stripe is aligned separately with
-- pnpm stripe:products --apply. The Phoenix sorts after the Takara Tomy pieces (up to 38 on the live
-- database). A replay changes nothing: the new row is only inserted once, and the String Launcher
-- update writes the same words again. Its stock is left alone: the shelf holds what the shop counts.

begin;

with seed(category_slug, slug, name, tagline, description, price_cents, stock_quantity, sort_order) as (
  values
  ('beyblade-x', 'soar-phoenix-9-60gf-solo-trottola', 'Soar Phoenix 9-60GF solo trottola', 'La Phoenix rossa, senza lanciatore.',
   'Soar Phoenix 9-60GF è la trottola d''attacco rossa dello starter Hasbro, qui venduta da sola: tre lame che salgono verso l''alto per un Upper Attack capace di sollevare l''avversario, una delle blade più pesanti della serie, con Ratchet 9-60 e Bit GF (Gear Flat). Solo la trottola con ratchet e bit montati: il lanciatore non è incluso. Arriva in busta, senza scatola. Richiede lanciatore e Beystadium Beyblade X (venduti separatamente).',
   1299, 2, 39)
),
photos(product_slug, src, alt, photo_order) as (
  values
  ('soar-phoenix-9-60gf-solo-trottola', '/products/soar-phoenix-9-60gf-solo-trottola.webp', 'Trottola Beyblade X Soar Phoenix 9-60GF rossa e giallo-verde trasparente con il gear chip della fenice', 0)
),
inserted as (
  insert into public.products (
    category_id, slug, sku, name, tagline, description, price_cents,
    compare_at_price_cents, publication_status, active, stock_quantity,
    availability_override, preorder_allocation, allow_backorder, blade_type, rating, review_count, sort_order
  )
  select
    category.id, seed.slug, upper(seed.slug), seed.name, seed.tagline, seed.description, seed.price_cents,
    null, 'published'::public.publication_status, true, seed.stock_quantity,
    null, 0, false, 'attacco'::public.blade_type, 0, 0, seed.sort_order
  from seed
  join public.categories as category on category.slug = seed.category_slug
  -- Only new rows: a replay must never reset a count the shop has already sold from. Not an
  -- ON CONFLICT: the live database keys the slug per organisation (the back-office tables), so
  -- no single-column conflict target exists in both schemas.
  where not exists (select 1 from public.products as existing where existing.slug = seed.slug)
  returning id, slug, stock_quantity
),
images as (
  insert into public.product_images (product_id, src, width, height, alt, sort_order, published, is_primary)
  select inserted.id, photos.src, 1000, 1000, photos.alt, photos.photo_order, true, photos.photo_order = 0
  from inserted
  join photos on photos.product_slug = inserted.slug
  on conflict (product_id, sort_order) do nothing
  returning product_id
),
tags as (
  insert into public.product_tags (product_id, tag)
  select inserted.id, 'offerta'::public.promo_tag
  from inserted
  on conflict (product_id, tag) do nothing
  returning product_id
)
insert into public.inventory_movements (product_id, delta, stock_after, reason, note)
select inserted.id, inserted.stock_quantity, inserted.stock_quantity, 'initial'::public.inventory_reason,
  'Carico di 2 Soar Phoenix senza lanciatore del 13/11/2026'
from inserted;

update public.products
set name = 'String Launcher L Takara Tomy',
  tagline = 'Solo sinistro (L), per le trottole left-spin.',
  description = 'Lo String Launcher L è il lanciatore a corda lunga di Takara Tomy per le trottole a rotazione sinistra (left-spin), come Cobalt Dragoon: si tira la corda e la trottola parte. Sono rimasti solo i sinistri (L), come l''azzurro di BX-34 in foto: le trottole a rotazione destra non le lancia. Il colore è assortito e non si sceglie. Viene dagli starter giapponesi e arriva in busta, senza scatola. Trottola e Beystadium non inclusi.'
where slug = 'string-launcher-takara-tomy';

update public.product_images
set alt = 'String Launcher L Takara Tomy Beyblade X azzurro, per trottole a rotazione sinistra'
where is_primary
  and product_id in (select id from public.products where slug = 'string-launcher-takara-tomy');

commit;
