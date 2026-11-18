-- 2026-11-18, the owner: "Da aggiungere al magazzino: 6 luster dragoon [...] 1 arena bx-53 [...] 2 Silver
-- wolf [...]. Luster da vendere a 39.99 euro [...] Bx-53 trova tu il prezzo migliore di vendita
-- comparando a tutti gli altri siti, silver wolf a 34.99 euro. Prendi le foto originali takara dal web."
--
--   BX-52 Luster Dragoon 6-60LC   39,99   6   Takara Tomy starter, left spin, Winder Launcher L
--   UX-08 Silver Wolf 3-80FB      34,99   2   Takara Tomy starter, stamina
--   BX-53 All-in-One Set         159,90   1   stadium, three tops, two launchers (Poste to the door)
--
-- The rows arrive with an empty shelf: the pieces enter through the supplier receipt of 18/11/2026,
-- recorded in the back office with its freight and commission, which gives every line its landed
-- cost. Costs stay out of this public repository. Until that receipt is confirmed the three read as
-- sold out with "Avvisami" (allow_backorder false), never as a pre-order.
--
-- Catalogue copy and prices live in src/data/catalog.ts; this gives the live database the rows the
-- Stripe webhook scales stock from and the admin counts. Stripe is aligned separately with
-- pnpm stripe:products --apply. The packs of the same day (duo-luster-enlil, pack-meta-luster,
-- pack-meta-phoenix) are bundles: they live in code and take their stock from their pieces.
-- A replay changes nothing: rows are only inserted once.

begin;

with seed(category_slug, slug, name, tagline, description, price_cents, blade, sort_order) as (
  values
  ('beyblade-x', 'bx-52-luster-dragoon-6-60lc', 'BX-52 Luster Dragoon 6-60LC', 'Attacco left-spin pesante. Lanciatore L incluso.',
   'BX-52 è lo starter Takara Tomy di Luster Dragoon 6-60LC, trottola d''attacco a rotazione sinistra (left-spin) della linea BX, con Expand Blade. Il metallo arriva fino al centro della blade, che resta rigida e colpisce forte anche dal basso; il peso è spostato da un lato, come vuole Takara Tomy, e le due lame grandi sollevano l''avversario e lo spingono via. Ratchet 6-60, basso, con sei denti di due tipi alternati, e Bit LC (Low Cyclone), 1 mm più basso del Bit Cyclone per far presa sullo stadio quando gira a sinistra. Nella scatola c''è il Winder Launcher L viola con la Long Winder, più lunga della winder normale: si lancia subito. Richiede un Beystadium Beyblade X (venduto a parte). Prodotto originale giapponese, confezione in giapponese.',
   3999, 'attacco', 40),
  ('beyblade-x', 'ux-08-silver-wolf-3-80fb', 'UX-08 Silver Wolf 3-80FB', 'Stamina UX con anello libero e Free Ball.',
   'UX-08 è lo starter Takara Tomy di Silver Wolf 3-80FB, trottola stamina a rotazione destra della linea UX (Unique Line). Sotto la blade c''è un anello libero che gira per conto suo: lascia scorrere il colpo dell''avversario e la trottola perde meno rotazione. Ratchet 3-80, alto, con tre denti, e Bit FB (Free Ball): la punta a sfera, sottile, gira libera rispetto al ratchet e consuma poco. Nella scatola c''è il Winder Launcher nero e argento: si lancia subito. In occidente Hasbro la vende come Sterling Wolf. Richiede un Beystadium Beyblade X (venduto a parte). Prodotto originale giapponese, confezione in giapponese.',
   3499, 'stamina', 41),
  ('stadi', 'bx-53-all-in-one-set', 'BX-53 All-in-One Set', 'Stadio, tre trottole e due lanciatori. Si gioca subito.',
   'BX-53 è l''All-in-One Set di Takara Tomy: tutto per cominciare, in una scatola. Dentro ci sono un Beystadium con l''Xtreme Line e la cupola trasparente, tre trottole di tipo diverso e due lanciatori. Aero Pegasus 3-70A in Double Metal Coat blu e ciano (UX, attacco), con tre lame grandi e il Bit A (Accel) per l''Xtreme Dash; Wizard Arrow 4-80B versione 2.0 (BX, stamina), con due grandi lame circolari e il peso verso l''esterno; Knight Shield 3-80N versione 2.0 (BX, difesa), con sei lame che assorbono l''urto e il Bit N (Needle). Le due versioni 2.0 sono quelle aggiornate da Takara Tomy. Tutte e tre girano a destra. I lanciatori sono un Winder Launcher blu e ciano e uno String Launcher giallo. La vernice Metal Coat può consumarsi con l''uso. Prodotto originale giapponese, confezione in giapponese.',
   15990, null, 42)
),
photos(product_slug, src, alt, photo_order) as (
  values
  ('bx-52-luster-dragoon-6-60lc', '/products/bx-52-luster-dragoon-6-60lc.webp', 'Trottola Takara Tomy Beyblade X Luster Dragoon 6-60LC argento e viola con il Winder Launcher L viola e la Long Winder', 0),
  ('bx-52-luster-dragoon-6-60lc', '/products/bx-52-luster-dragoon-6-60lc-bx52_01.webp', 'Luster Dragoon vista dall''alto, con il gear chip del drago', 1),
  ('bx-52-luster-dragoon-6-60lc', '/products/bx-52-luster-dragoon-6-60lc-bx52_02.webp', 'Luster Dragoon vista di tre quarti: le due lame grandi', 2),
  ('bx-52-luster-dragoon-6-60lc', '/products/bx-52-luster-dragoon-6-60lc-bx52_05.webp', 'Winder Launcher L viola con la Long Winder blu', 3),
  ('ux-08-silver-wolf-3-80fb', '/products/ux-08-silver-wolf-3-80fb.webp', 'Trottola Takara Tomy Beyblade X Silver Wolf 3-80FB argento e verde acqua con il Winder Launcher nero', 0),
  ('ux-08-silver-wolf-3-80fb', '/products/ux-08-silver-wolf-3-80fb-ux08_01.webp', 'Silver Wolf vista dall''alto, con il gear chip del lupo', 1),
  ('ux-08-silver-wolf-3-80fb', '/products/ux-08-silver-wolf-3-80fb-ux08_02.webp', 'Silver Wolf vista di tre quarti', 2),
  ('ux-08-silver-wolf-3-80fb', '/products/ux-08-silver-wolf-3-80fb-ux08_05.webp', 'Winder Launcher nero e argento', 3),
  ('bx-53-all-in-one-set', '/products/bx-53-all-in-one-set.webp', 'Contenuto del Takara Tomy Beyblade X BX-53 All-in-One Set: stadio con cupola trasparente, tre trottole e due lanciatori', 0),
  ('bx-53-all-in-one-set', '/products/bx-53-all-in-one-set-bx53_01.webp', 'Aero Pegasus 3-70A Double Metal Coat blu e ciano', 1),
  ('bx-53-all-in-one-set', '/products/bx-53-all-in-one-set-bx53_02.webp', 'Wizard Arrow 4-80B versione 2.0, gialla e argento', 2),
  ('bx-53-all-in-one-set', '/products/bx-53-all-in-one-set-bx53_03.webp', 'Knight Shield 3-80N versione 2.0, verde e argento', 3),
  ('bx-53-all-in-one-set', '/products/bx-53-all-in-one-set-bx53_18.webp', 'Il Beystadium del set con l''Xtreme Line verde e la cupola trasparente', 4),
  ('bx-53-all-in-one-set', '/products/bx-53-all-in-one-set-bx53_16.webp', 'Winder Launcher blu e ciano', 5),
  ('bx-53-all-in-one-set', '/products/bx-53-all-in-one-set-bx53_17.webp', 'String Launcher giallo', 6)
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
    null, 0, false, seed.blade::public.blade_type, 0, 0, seed.sort_order
  from seed
  join public.categories as category on category.slug = seed.category_slug
  -- Only new rows: a replay must never reset a count the shop has already sold from. Not an
  -- ON CONFLICT: the live database keys the slug per organisation (the back-office tables), so
  -- no single-column conflict target exists in both schemas.
  where not exists (select 1 from public.products as existing where existing.slug = seed.slug)
  returning id, slug
),
images as (
  insert into public.product_images (product_id, src, width, height, alt, sort_order, published, is_primary)
  select inserted.id, photos.src, 1000, 1000, photos.alt, photos.photo_order, true, photos.photo_order = 0
  from inserted
  join photos on photos.product_slug = inserted.slug
  on conflict (product_id, sort_order) do nothing
  returning product_id
)
insert into public.product_tags (product_id, tag)
select inserted.id, 'novita'::public.promo_tag
from inserted
on conflict (product_id, tag) do nothing;

commit;
