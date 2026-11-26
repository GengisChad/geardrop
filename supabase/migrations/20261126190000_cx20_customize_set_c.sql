-- 2026-11-26, the owner: "arrivano 20 cx-20. mettili sul sito con avvisami e solo 8 in pre order per
-- telegram", to resell at 140 euro, paid on the site's checkout.
--
--   CX-20 Customize Set C   140,00   8 pieces set aside for the Telegram pre-order
--
-- The row is a pre-order of eight pieces (availability_override, preorder_allocation): that is what
-- the cart opened by the channel's post sells from, and the one count the bot reads. The shop's own
-- pages show the product sold out with "Avvisami" while the catalogue marks it
-- channelOnly: "avvisami" (src/lib/commerce/channel-only.ts), so nobody orders it from the shop.
-- When the twenty pieces arrive the owner loads what is left as stock and drops the pre-order: the
-- product then sells like any other.
--
-- Catalogue copy and price live in src/data/catalog.ts. Costs stay out of this public repository.
-- Stripe is aligned separately with pnpm stripe:products --apply. A replay changes nothing: the row
-- is only inserted once.

begin;

with seed(category_slug, slug, name, tagline, description, price_cents, sort_order) as (
  values
  ('beyblade-x', 'cx-20-customize-set-c', 'CX-20 Customize Set C', 'Quattro blade, tre ratchet, sei bit: 72 combinazioni.',
   'CX-20 è il Customize Set C di Takara Tomy: un set di parti per costruire e cambiare le tue trottole. Dentro ci sono quattro blade, tre ratchet e sei bit, per 72 combinazioni. La trottola del set è Phoenix Force WHM-65MT, bilanciata, della linea CX con Expand Blade: ha metallo nella blade, nel ratchet M-65 e nel Bit MT (Metal Taper), quindi è molto pesante, per colpire forte e incassare. La sua blade si smonta in lock chip Phoenix, metal blade Force, over blade W (Weight) e assist blade H (Heavy). Le altre tre blade sono Shark Scale (UX, attacco), con due lame grandi per colpire dal basso; Wizard Rod in Metal Coat blu (UX, stamina), larga e con il peso verso l''esterno; Hells Scythe versione 2.0 (BX, bilanciata), con quattro lame, nella versione aggiornata da Takara Tomy. I ratchet sono M-65, 8-80 e 1-70. I bit sono MT (Metal Taper), UF (Under Flat), K (Kick), LR (Low Rush), LO (Low Orb) e HN (High Needle). Tutte e quattro le blade girano a destra. Lanciatore e stadio non sono inclusi: servono quelli Beyblade X, venduti a parte. La vernice Metal Coat può consumarsi con l''uso. Prodotto originale giapponese, confezione in giapponese.',
   14000, 43)
),
photos(product_slug, src, alt, photo_order) as (
  values
  ('cx-20-customize-set-c', '/products/cx-20-customize-set-c.webp', 'Contenuto del Takara Tomy Beyblade X CX-20 Customize Set C: quattro blade, tre ratchet e sei bit', 0),
  ('cx-20-customize-set-c', '/products/cx-20-customize-set-c-cx20_01.webp', 'Phoenix Force WHM-65MT Metal Coat rossa, montata, vista di tre quarti', 1),
  ('cx-20-customize-set-c', '/products/cx-20-customize-set-c-cx20_10.webp', 'Blade Shark Scale, argento e arancione', 2),
  ('cx-20-customize-set-c', '/products/cx-20-customize-set-c-cx20_11.webp', 'Blade Wizard Rod Metal Coat blu', 3),
  ('cx-20-customize-set-c', '/products/cx-20-customize-set-c-cx20_12.webp', 'Blade Hells Scythe versione 2.0, argento e rossa', 4),
  ('cx-20-customize-set-c', '/products/cx-20-customize-set-c-cx20_08.webp', 'Ratchet M-65 rosso, con la parte in metallo', 5),
  ('cx-20-customize-set-c', '/products/cx-20-customize-set-c-cx20_09.webp', 'Bit MT (Metal Taper) rosso, con la punta in metallo', 6)
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
    'preorder'::public.availability_override, 8, false, null, 0, 0, seed.sort_order
  from seed
  join public.categories as category on category.slug = seed.category_slug
  -- Only a new row: a replay must never give back pieces already pre-ordered. Not an ON CONFLICT:
  -- the live database keys the slug per organisation, so no single-column conflict target exists
  -- in both schemas.
  where not exists (select 1 from public.products as existing where existing.slug = seed.slug)
  returning id, slug
)
insert into public.product_images (product_id, src, width, height, alt, sort_order, published, is_primary)
select inserted.id, photos.src, 1000, 1000, photos.alt, photos.photo_order, true, photos.photo_order = 0
from inserted
join photos on photos.product_slug = inserted.slug
on conflict (product_id, sort_order) do nothing;

commit;
