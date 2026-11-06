-- 2026-11-06, the owner: new Takara Tomy pieces that arrived on the shop's own shelf. The shop bought
-- them, so they are not on consignment: they ship from here with InPost like the Hasbro pieces, and
-- no partner line or email comes out of them. Under the Takara Tomy section of the shop.
--
--   BX-48 Random Booster Vol. 9                   36,99    6
--   CX-18 Random Booster Brachio Whip Select      30,00   20
--   Custom Grip (BX-30, BX-41, BX-42)             25,99   15, not counted per edition
--   Long Winder Launcher (Evangelion or plain)    20,00    6
--   String Launcher (assorted colours)            16,99    9
--   Winder Launcher (assorted colours)            12,99   33
--
-- An empty shelf is sold out, with "Avvisami": no pre-order at zero (allow_backorder false).
--
-- Catalogue copy and prices live in src/data/catalog.ts; this gives the live database the rows the
-- Stripe webhook scales stock from and the admin counts. Stripe is aligned separately with
-- pnpm stripe:products --apply. They sort after the deck cases (up to 32 on the live database).
-- A replay changes nothing: new rows are only inserted once.

begin;

with seed(category_slug, slug, name, tagline, description, price_cents, stock_quantity, sort_order) as (
  values
  ('beyblade-x', 'bx-48-random-booster-vol-9', 'BX-48 Random Booster Vol. 9', 'Cinque Metal Coat tornate dalle esclusive. Una a sorpresa.',
   'BX-48 è la Random Booster Vol. 9 di Takara Tomy, la Limited Revival: cinque trottole nate come esclusive di eventi, app e B4 Store, tornate in versione Metal Coat con un assetto rivisto. In ogni scatola ce n''è una sola, a caso e sigillata: non si sceglie. Sono Cobalt Dragoon 9-80F nera, Shark Edge 4-70E blu, Mammoth Tusk 7-60S nera, Hells Scythe 3-85GB oro e Dran Buster 2-80Q rossa. Cobalt Dragoon gira a sinistra e chiede un lanciatore L. Il lanciatore non è incluso. Richiede lanciatore e Beystadium Beyblade X (venduti a parte). Prodotto originale giapponese, confezione in giapponese.',
   3699, 6, 33),
  ('beyblade-x', 'cx-18-random-booster-brachio-whip', 'CX-18 Random Booster Brachio Whip Select', 'Uno di tre colori, a sorpresa.',
   'CX-18 è la Random Booster di Takara Tomy dedicata a Brachio Whip OW5-70Nr, trottola della Custom Line con Expand Blade che Takara Tomy classifica stamina: blade spessa e rotonda con il peso verso l''esterno, e Bit Nr (Narrow) per perdere meno rotazione. In ogni scatola ce n''è una sola, sigillata: la trottola è sempre questa, a caso è solo il colore (viola, oro o nera), che non si sceglie. Rotazione destra. Il lanciatore non è incluso. Richiede lanciatore e Beystadium Beyblade X (venduti a parte). Prodotto originale giapponese, confezione in giapponese con etichetta in cinese.',
   3000, 20, 34),
  ('accessori', 'custom-grip-takara-tomy', 'Custom Grip Takara Tomy', 'Si monta sul lanciatore. Tre colori, stesso prezzo.',
   'La Custom Grip è l''impugnatura originale Takara Tomy che si monta sul lanciatore (venduto a parte): più comoda da tenere, per un lancio più stabile, e si monta sia per destri sia per mancini. Tre versioni, stesso prezzo: BX-30 rossa con i pannelli intercambiabili, BX-41 gunmetal e BX-42 blu in gomma, con quattro tipi di pannelli in gomma per regolare la presa. Vuoi un colore preciso? Scrivilo nelle note dell''ordine o via email dopo l''acquisto: se è rimasto è tuo, altrimenti ti scriviamo prima di spedire. Senza indicazioni spediamo quello che c''è. Lanciatore, trottola e Beystadium non inclusi. Prodotto originale giapponese, confezione in giapponese con etichetta in cinese.',
   2599, 15, 35),
  ('lanciatori', 'long-winder-launcher-takara-tomy', 'Long Winder Launcher Takara Tomy', 'La winder lunga. Anche con la stampa Evangelion.',
   'Il lanciatore Takara Tomy con la Long Winder, più lunga della winder classica: la infili, la tiri e la trottola parte. Ci sono due versioni, secondo disponibilità e non a scelta: la stampa speciale con il logo NERV dell''Evangelion Deck Set (CX-00), nera con la winder rossa, oppure in colore normale, come il verde in foto. Arriva in busta, senza scatola. Per trottole a rotazione destra. Trottola e Beystadium non inclusi.',
   2000, 6, 36),
  ('lanciatori', 'string-launcher-takara-tomy', 'String Launcher Takara Tomy', 'Tiri la corda e parte. Colore assortito.',
   'Lo String Launcher è il lanciatore a corda lunga di Takara Tomy: si tira la corda e la trottola parte. Viene dagli starter giapponesi, come il blu scuro di UX-20 e l''azzurro L di BX-34 in foto. Ci sono sia destri (right) sia sinistri (L), che lanciano solo le trottole a rotazione sinistra: scrivi quale vuoi nelle note dell''ordine o via email dopo l''acquisto. Se non è rimasto ti scriviamo prima di spedire; senza indicazioni spediamo il destro. Il colore è assortito e non si sceglie. Arriva in busta, senza scatola. Trottola e Beystadium non inclusi.',
   1699, 9, 37),
  ('lanciatori', 'winder-launcher-takara-tomy', 'Winder Launcher Takara Tomy', 'Il lanciatore degli starter giapponesi. Colore assortito.',
   'Il Winder Launcher è il lanciatore degli starter Takara Tomy: infili la winder, la striscia dentata, e la tiri per far partire la trottola. Winder di lunghezza classica. Ci sono sia destri (right) sia sinistri (L), che lanciano solo le trottole a rotazione sinistra: scrivi quale vuoi nelle note dell''ordine o via email dopo l''acquisto. Se non è rimasto ti scriviamo prima di spedire; senza indicazioni spediamo il destro. Il colore è assortito e non si sceglie: ne abbiamo di diversi (in foto alcuni) e spediamo quello che c''è. Arriva in busta, senza scatola. Trottola e Beystadium non inclusi.',
   1299, 33, 38)
),
photos(product_slug, src, alt, photo_order) as (
  values
  ('bx-48-random-booster-vol-9', '/products/bx-48-random-booster-vol-9.webp', 'Confezione Takara Tomy Beyblade X BX-48 Random Booster Vol. 9 con le cinque trottole Metal Coat', 0),
  ('bx-48-random-booster-vol-9', '/products/bx-48-random-booster-vol-9-bx48_02.webp', 'Cobalt Dragoon 9-80F Metal Coat nera', 1),
  ('bx-48-random-booster-vol-9', '/products/bx-48-random-booster-vol-9-bx48_04.webp', 'Shark Edge 4-70E Metal Coat blu', 2),
  ('bx-48-random-booster-vol-9', '/products/bx-48-random-booster-vol-9-bx48_03.webp', 'Mammoth Tusk 7-60S Metal Coat nera', 3),
  ('bx-48-random-booster-vol-9', '/products/bx-48-random-booster-vol-9-bx48_05.webp', 'Hells Scythe 3-85GB Metal Coat oro', 4),
  ('bx-48-random-booster-vol-9', '/products/bx-48-random-booster-vol-9-bx48_06.webp', 'Dran Buster 2-80Q Metal Coat rossa', 5),
  ('cx-18-random-booster-brachio-whip', '/products/cx-18-random-booster-brachio-whip.webp', 'Confezione Takara Tomy Beyblade X CX-18 Random Booster Brachio Whip Select con le tre trottole: viola, oro e nera', 0),
  ('cx-18-random-booster-brachio-whip', '/products/cx-18-random-booster-brachio-whip-cx18_01.webp', 'Brachio Whip OW5-70Nr viola, vista di lato', 1),
  ('cx-18-random-booster-brachio-whip', '/products/cx-18-random-booster-brachio-whip-cx18_03.webp', 'Brachio Whip OW5-70Nr oro', 2),
  ('cx-18-random-booster-brachio-whip', '/products/cx-18-random-booster-brachio-whip-cx18_04.webp', 'Brachio Whip OW5-70Nr nera', 3),
  ('custom-grip-takara-tomy', '/products/custom-grip-takara-tomy.webp', 'Tre Custom Grip Takara Tomy Beyblade X: BX-41 gunmetal, BX-42 blu e BX-30 rossa', 0),
  ('custom-grip-takara-tomy', '/products/custom-grip-takara-tomy-bx30.webp', 'Custom Grip BX-30 rossa e nera', 1),
  ('custom-grip-takara-tomy', '/products/custom-grip-takara-tomy-bx42.webp', 'Rubber Custom Grip BX-42 blu con pannelli trasparenti', 2),
  ('custom-grip-takara-tomy', '/products/custom-grip-takara-tomy-bx41.webp', 'Rubber Custom Grip BX-41 gunmetal con pannelli rossi', 3),
  ('custom-grip-takara-tomy', '/products/custom-grip-takara-tomy-bx41_01.webp', 'La Rubber Custom Grip BX-41 con i suoi pannelli smontati', 4),
  ('long-winder-launcher-takara-tomy', '/products/long-winder-launcher-takara-tomy.webp', 'Due lanciatori Takara Tomy Beyblade X con Long Winder: verde acqua, e nero con il logo NERV di Evangelion e la winder rossa', 0),
  ('string-launcher-takara-tomy', '/products/string-launcher-takara-tomy.webp', 'Due String Launcher Takara Tomy Beyblade X: blu scuro con puntini oro, e azzurro nella versione L', 0),
  ('winder-launcher-takara-tomy', '/products/winder-launcher-takara-tomy.webp', 'Tre Winder Launcher Takara Tomy Beyblade X in colori diversi: bianco e blu, rosso, nero e verde', 0)
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
    null, 0, false, null, 0, 0, seed.sort_order
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
  select inserted.id, 'novita'::public.promo_tag
  from inserted
  on conflict (product_id, tag) do nothing
  returning product_id
)
insert into public.inventory_movements (product_id, delta, stock_after, reason, note)
select inserted.id, inserted.stock_quantity, inserted.stock_quantity, 'initial'::public.inventory_reason,
  'Carico merce Takara Tomy del 06/11/2026'
from inserted;

commit;
