-- 2026-11-26, the owner: three Takara Tomy BX-09 Beybattle Pass at 80 euro, pre-ordered on Telegram
-- only and paid with PayPal.me only ("Bx-09 solo paypal.me").
--
--   BX-09 Beybattle Pass   80,00   3 pieces, Telegram pre-order
--
-- The row is a pre-order of three pieces (availability_override, preorder_allocation): the one
-- count the bot reserves from (telegram_preorder_hold). The catalogue marks the product
-- channelOnly, so no page of the shop lists it while it is a pre-order.
--
-- Catalogue copy and price live in src/data/catalog.ts. Costs stay out of this public repository.
-- A replay changes nothing: the row is only inserted once.

begin;

with seed(category_slug, slug, name, tagline, description, price_cents, sort_order) as (
  values
  ('accessori', 'bx-09-beybattle-pass', 'BX-09 Beybattle Pass', 'Misura la forza del tuo lancio e la registra.',
   'BX-09 è il Beybattle Pass di Takara Tomy: uno strumento che misura e registra la potenza del lancio. Collegato all''app dedicata di Takara Tomy, trasforma i dati dei tuoi lanci in Bey Point, i punti dell''app. Per usarlo servono una trottola, un lanciatore e uno stadio Beyblade X, venduti a parte: nella confezione non ci sono, come non ci sono il launcher grip e lo smartphone. Funziona con 2 pile alcaline AAA, non incluse. L''app è di Takara Tomy: prima di acquistare controlla che sia disponibile per il tuo telefono. Prodotto originale giapponese, confezione e istruzioni in giapponese.',
   8000, 44)
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
    'preorder'::public.availability_override, 3, false, null, 0, 0, seed.sort_order
  from seed
  join public.categories as category on category.slug = seed.category_slug
  -- Only a new row: a replay must never give back pieces already pre-ordered.
  where not exists (select 1 from public.products as existing where existing.slug = seed.slug)
  returning id
)
insert into public.product_images (product_id, src, width, height, alt, sort_order, published, is_primary)
select inserted.id, '/products/bx-09-beybattle-pass.webp', 1000, 1000, 'Beybattle Pass BX-09 Takara Tomy Beyblade X, nero e bianco con il logo Beyblade X', 0, true, true
from inserted
on conflict (product_id, sort_order) do nothing;

commit;
