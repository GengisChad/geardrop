-- GEAR//DROP initial catalog seed (design §13).
--
-- Mapped deterministically from src/data/catalog.ts + src/data/assets.ts.
--
-- PRODUCTION-SAFE DEFAULTS: every stock_quantity is 0 and checkout is disabled. The
-- source catalog carries availability *labels* but no real numeric inventory, so no
-- stock is invented here. The operator loads real quantities and flips
-- store_settings.checkout_enabled = true through a reviewed update before selling.
--
-- SKU is derived as upper(slug) since the source catalog has no separate SKU.

begin;

-- --- Store configuration ---------------------------------------------------
insert into public.store_settings (id, checkout_enabled, max_quantity_per_line, default_currency)
values (1, false, 10, 'EUR')
on conflict (id) do nothing;

-- --- Shipping methods ------------------------------------------------------
-- Standard becomes free over €59 (FREE_SHIPPING_THRESHOLD). Express is a flat rate
-- (490 base + 690 surcharge from the checkout mockups) and never free.
insert into public.shipping_methods (code, label, delivery_hint, price_cents, free_shipping_threshold_cents, active, sort_order) values
  ('standard', 'Standard', 'Consegna in 24/48h',            490,  5900, true, 0),
  ('express',  'Express',  'Consegna il giorno successivo', 1180, null, true, 1)
on conflict (code) do nothing;

-- --- Categories ------------------------------------------------------------
insert into public.categories (slug, name, tagline, description, active, sort_order) values
  ('beyblade-x', 'Beyblade X', 'Scatena la tua energia. Domina lo stadio.',
   'Tutta la collezione di trottole Beyblade X: attacco, difesa, stamina e bilanciate, pronte per ogni scontro.', true, 0),
  ('lanciatori', 'Lanciatori', 'Potenza e controllo nelle tue mani.',
   'Lanciatori a corda e accessori di lancio per colpi precisi e ripetibili.', true, 1),
  ('stadi', 'Stadi', 'Arene per battaglie epiche.',
   'Stadi e set arena ufficiali Beyblade X, studiati per urti estremi e KO spettacolari.', true, 2),
  ('accessori', 'Accessori', 'Personalizza. Migliora. Vinci.',
   'Attrezzi, custodie e ricambi per tenere il tuo arsenale sempre pronto.', true, 3)
on conflict (slug) do nothing;

-- --- Products --------------------------------------------------------------
insert into public.products
  (category_id, slug, sku, name, tagline, description, price_cents, currency,
   publication_status, active, stock_status, stock_quantity, blade_type, rating, review_count)
values
  ((select id from public.categories where slug = 'stadi'),
   'stadio-beystadium-x-attack-set', 'STADIO-BEYSTADIUM-X-ATTACK-SET',
   'Stadio Beystadium X Attack Set', 'Arena, 2 trottole e 2 lanciatori inclusi.',
   'Lo Stadium X Attack Set è l''arena definitiva per chi ama l''azione senza compromessi. La sua forma esclusiva guida le trottole verso il centro, aumentando la frequenza degli urti e le possibilità di KO spettacolari. Il set include 2 trottole ufficiali Beyblade X e 2 lanciatori di precisione, per sfide epiche subito pronte all''azione.',
   4999, 'EUR', 'published', true, 'disponibile', 0, null, 4.8, 237),

  ((select id from public.categories where slug = 'beyblade-x'),
   'wizard-arrow-4-80b', 'WIZARD-ARROW-4-80B',
   'Wizard Arrow 4-80B', 'Equilibrio perfetto tra velocità e impatto.',
   'Wizard Arrow 4-80B unisce una linea aggressiva a un assetto stabile: accelera in curva e mantiene la traiettoria anche dopo gli urti più duri. Una scelta solida per chi costruisce combo d''attacco affidabili.',
   2499, 'EUR', 'published', true, 'disponibile', 0, 'attacco', 4.5, 1230),

  ((select id from public.categories where slug = 'beyblade-x'),
   'cobalt-dragoon-2-60c', 'COBALT-DRAGOON-2-60C',
   'Cobalt Dragoon 2-60C Starter Pack', 'Potenza esplosiva. Colpisci senza pietà.',
   'Cobalt Dragoon 2-60C combina un design aggressivo con prestazioni bilanciate per offrire attacchi devastanti e stabilità costante. Ideale per blader che vogliono imporsi in ogni scontro. Lo starter pack include il lanciatore a corda.',
   3499, 'EUR', 'published', true, 'in-arrivo', 0, 'attacco', 4.5, 987),

  ((select id from public.categories where slug = 'beyblade-x'),
   'phoenix-wing-9-60gf', 'PHOENIX-WING-9-60GF',
   'Phoenix Wing 9-60GF', 'Resistenza e controllo in ogni scontro.',
   'Phoenix Wing 9-60GF è costruita per durare: assorbe gli urti e restituisce rotazione, logorando gli avversari fino all''ultimo giro. La scelta di chi vince ai punti.',
   2499, 'EUR', 'published', true, 'esaurito', 0, 'bilanciato', 4.5, 845),

  ((select id from public.categories where slug = 'beyblade-x'),
   'shark-edge-3-60lf', 'SHARK-EDGE-3-60LF',
   'Shark Edge 3-60LF', 'Difesa solida. Resisti fino alla fine.',
   'Shark Edge 3-60LF è pensata per incassare: profilo basso, baricentro compatto e un bordo che devia gli attacchi invece di subirli. Chi prova a spingerti fuori se ne pentirà.',
   2499, 'EUR', 'published', true, 'disponibile', 0, 'difesa', 4.5, 612),

  ((select id from public.categories where slug = 'beyblade-x'),
   'dran-sword-4-80db', 'DRAN-SWORD-4-80DB',
   'Dran Sword 4-80DB', 'Stamina infinita. Non fermarti mai.',
   'Dran Sword 4-80DB gira, e gira ancora. Dispersione minima e assetto pulito per portare il duello alla distanza e chiuderlo quando gli altri si sono già fermati.',
   2499, 'EUR', 'published', true, 'in-arrivo', 0, 'stamina', 4.5, 543),

  ((select id from public.categories where slug = 'beyblade-x'),
   'dran-buster-1-60a', 'DRAN-BUSTER-1-60A',
   'Dran Buster 1-60A', 'Impatto puro. Chiudi il match al primo colpo.',
   'Dran Buster 1-60A concentra tutta la massa dove serve: sull''urto. Costruita per chi non vuole aspettare i punti e preferisce chiudere con un KO.',
   2499, 'EUR', 'published', true, 'disponibile', 0, 'attacco', 4.5, 112),

  ((select id from public.categories where slug = 'stadi'),
   'sneak-attack-battle-set', 'SNEAK-ATTACK-BATTLE-SET',
   'Sneak Attack Battle Set', 'Il set completo per iniziare a vincere.',
   'Sneak Attack Battle Set mette in scatola tutto quello che serve per il primo scontro: arena, trottole e lanciatori. Ordina ora, spediamo appena disponibile.',
   6499, 'EUR', 'published', true, 'pre-ordine', 0, null, 4.6, 58)
on conflict (slug) do nothing;

-- --- Product tags ----------------------------------------------------------
insert into public.product_tags (product_id, tag)
select p.id, v.tag
from (values
  ('stadio-beystadium-x-attack-set', 'novita'),
  ('sneak-attack-battle-set',        'limited')
) as v(slug, tag)
join public.products p on p.slug = v.slug
on conflict do nothing;

-- --- Product images --------------------------------------------------------
insert into public.product_images (product_id, path, width, height, alt, sort_order, published)
select p.id, v.path, v.width, v.height, v.alt, v.sort_order, true
from (values
  ('stadio-beystadium-x-attack-set', '/products/stadio-beystadium-x-attack-set-1.png', 530, 472, 'Stadio Beystadium X Attack Set con arena verde, due trottole e due lanciatori', 0),
  ('wizard-arrow-4-80b',             '/products/wizard-arrow-4-80b-1.png',             213, 195, 'Trottola Wizard Arrow 4-80B nera e oro', 0),
  ('cobalt-dragoon-2-60c',           '/products/cobalt-dragoon-2-60c-1.png',           430, 459, 'Confezione Cobalt Dragoon 2-60C con lanciatore blu e trottola', 0),
  ('cobalt-dragoon-2-60c',           '/products/cobalt-dragoon-2-60c-2.png',           261, 171, 'Lanciatore blu e trottola Cobalt Dragoon 2-60C', 1),
  ('phoenix-wing-9-60gf',            '/products/phoenix-wing-9-60gf-1.png',            189, 167, 'Trottola Phoenix Wing 9-60GF rossa e oro', 0),
  ('shark-edge-3-60lf',              '/products/shark-edge-3-60lf-1.png',              194, 155, 'Trottola Shark Edge 3-60LF argento e teal', 0),
  ('dran-sword-4-80db',              '/products/dran-sword-4-80db-1.png',              191, 151, 'Trottola Dran Sword 4-80DB bianca e viola con lanciatore', 0),
  ('dran-buster-1-60a',              '/products/dran-buster-1-60a-1.png',              176, 165, 'Trottola Dran Buster 1-60A rossa e argento', 0),
  ('sneak-attack-battle-set',        '/products/sneak-attack-battle-set-1.png',        172, 168, 'Confezione Sneak Attack Battle Set', 0)
) as v(slug, path, width, height, alt, sort_order)
join public.products p on p.slug = v.slug;

-- --- Product specs ---------------------------------------------------------
insert into public.product_specs (product_id, label, value, sort_order)
select p.id, v.label, v.value, v.sort_order
from (values
  ('stadio-beystadium-x-attack-set', 'Tipo', 'Kit arena', 0),
  ('stadio-beystadium-x-attack-set', 'Sistema', 'Beyblade X', 1),
  ('stadio-beystadium-x-attack-set', 'Componenti', '1 stadio, 2 trottole, 2 lanciatori', 2),
  ('stadio-beystadium-x-attack-set', 'Materiale', 'Plastica e metallo', 3),
  ('wizard-arrow-4-80b', 'Tipo', 'Attacco', 0),
  ('wizard-arrow-4-80b', 'Sistema', 'Beyblade X', 1),
  ('wizard-arrow-4-80b', 'Componenti', '1 Top', 2),
  ('wizard-arrow-4-80b', 'Materiale', 'Plastica e metallo', 3),
  ('cobalt-dragoon-2-60c', 'Tipo', 'Attacco', 0),
  ('cobalt-dragoon-2-60c', 'Sistema', 'Beyblade X', 1),
  ('cobalt-dragoon-2-60c', 'Componenti', '1 Top, 1 Lancia a corda', 2),
  ('cobalt-dragoon-2-60c', 'Materiale', 'Plastica e metallo', 3),
  ('phoenix-wing-9-60gf', 'Tipo', 'Bilanciato', 0),
  ('phoenix-wing-9-60gf', 'Sistema', 'Beyblade X', 1),
  ('phoenix-wing-9-60gf', 'Componenti', '1 Top', 2),
  ('phoenix-wing-9-60gf', 'Materiale', 'Plastica e metallo', 3),
  ('shark-edge-3-60lf', 'Tipo', 'Difesa', 0),
  ('shark-edge-3-60lf', 'Sistema', 'Beyblade X', 1),
  ('shark-edge-3-60lf', 'Componenti', '1 Top', 2),
  ('shark-edge-3-60lf', 'Materiale', 'Plastica e metallo', 3),
  ('dran-sword-4-80db', 'Tipo', 'Stamina', 0),
  ('dran-sword-4-80db', 'Sistema', 'Beyblade X', 1),
  ('dran-sword-4-80db', 'Componenti', '1 Top, 1 Lancia a corda', 2),
  ('dran-sword-4-80db', 'Materiale', 'Plastica e metallo', 3),
  ('dran-buster-1-60a', 'Tipo', 'Attacco', 0),
  ('dran-buster-1-60a', 'Sistema', 'Beyblade X', 1),
  ('dran-buster-1-60a', 'Componenti', '1 Top', 2),
  ('dran-buster-1-60a', 'Materiale', 'Plastica e metallo', 3),
  ('sneak-attack-battle-set', 'Tipo', 'Kit arena', 0),
  ('sneak-attack-battle-set', 'Sistema', 'Beyblade X', 1),
  ('sneak-attack-battle-set', 'Componenti', '1 stadio, 2 trottole, 2 lanciatori', 2),
  ('sneak-attack-battle-set', 'Materiale', 'Plastica e metallo', 3)
) as v(slug, label, value, sort_order)
join public.products p on p.slug = v.slug;

-- --- Product features ------------------------------------------------------
insert into public.product_features (product_id, title, description, sort_order)
select p.id, v.title, v.description, v.sort_order
from (values
  ('stadio-beystadium-x-attack-set', 'Stadio X Attack', 'Design ottimizzato per scontri intensi e KO spettacolari', 0),
  ('stadio-beystadium-x-attack-set', 'Include 2 trottole', 'Pronte all''azione con ottime performance', 1),
  ('stadio-beystadium-x-attack-set', '2 lanciatori inclusi', 'Lanci potenti e precisi per dominare l''arena', 2),
  ('stadio-beystadium-x-attack-set', 'Compatibile Beyblade X', 'Usa tutte le trottole e accessori della serie Beyblade X', 3),
  ('stadio-beystadium-x-attack-set', 'Perfetto per sfide epiche', 'Ideale per duelli 1 contro 1 tra amici e collezionisti', 4),
  ('wizard-arrow-4-80b', 'Assetto d''attacco', 'Massimizza l''aggressività su ogni traiettoria', 0),
  ('wizard-arrow-4-80b', 'Blade 4-80B', 'Bilanciamento tra velocità di rotazione e impatto', 1),
  ('wizard-arrow-4-80b', 'Compatibile Beyblade X', 'Si monta con tutte le parti della serie', 2),
  ('cobalt-dragoon-2-60c', 'Starter pack completo', 'Trottola e lanciatore pronti all''uso', 0),
  ('cobalt-dragoon-2-60c', 'Rotazioni stabili', 'Attacchi rapidi senza perdere il controllo', 1),
  ('cobalt-dragoon-2-60c', 'Compatibile Beyblade X', 'Usa tutte le parti e gli accessori della serie', 2),
  ('phoenix-wing-9-60gf', 'Assetto bilanciato', 'Versatilità totale su attacco e difesa', 0),
  ('phoenix-wing-9-60gf', 'Blade 9-60GF', 'Resistenza agli urti e rotazione prolungata', 1),
  ('phoenix-wing-9-60gf', 'Compatibile Beyblade X', 'Si monta con tutte le parti della serie', 2),
  ('shark-edge-3-60lf', 'Assetto difensivo', 'Resistenza e controllo sotto pressione', 0),
  ('shark-edge-3-60lf', 'Blade 3-60LF', 'Profilo basso che devia gli impatti', 1),
  ('shark-edge-3-60lf', 'Compatibile Beyblade X', 'Si monta con tutte le parti della serie', 2),
  ('dran-sword-4-80db', 'Assetto stamina', 'Durata senza pari sulla lunga distanza', 0),
  ('dran-sword-4-80db', 'Blade 4-80DB', 'Rotazione pulita e dispersione minima', 1),
  ('dran-sword-4-80db', 'Compatibile Beyblade X', 'Si monta con tutte le parti della serie', 2),
  ('dran-buster-1-60a', 'Assetto d''attacco', 'Massa concentrata sull''impatto', 0),
  ('dran-buster-1-60a', 'Blade 1-60A', 'Colpo secco, pensato per il KO', 1),
  ('dran-buster-1-60a', 'Compatibile Beyblade X', 'Si monta con tutte le parti della serie', 2),
  ('sneak-attack-battle-set', 'Set completo', 'Arena, trottole e lanciatori in un''unica confezione', 0),
  ('sneak-attack-battle-set', 'Pronto al gioco', 'Tutto quello che serve per il primo duello', 1),
  ('sneak-attack-battle-set', 'Compatibile Beyblade X', 'Usa tutte le trottole della serie', 2)
) as v(slug, title, description, sort_order)
join public.products p on p.slug = v.slug;

-- --- Product box contents --------------------------------------------------
insert into public.product_box_contents (product_id, content, sort_order)
select p.id, v.content, v.sort_order
from (values
  ('stadio-beystadium-x-attack-set', '1 × Stadio Beystadium X', 0),
  ('stadio-beystadium-x-attack-set', '2 × Trottole Beyblade X', 1),
  ('stadio-beystadium-x-attack-set', '2 × Lanciatori a corda', 2),
  ('stadio-beystadium-x-attack-set', 'Manuale di gioco', 3),
  ('wizard-arrow-4-80b', '1 × Trottola Wizard Arrow 4-80B', 0),
  ('wizard-arrow-4-80b', 'Manuale', 1),
  ('cobalt-dragoon-2-60c', '1 × Trottola Cobalt Dragoon 2-60C', 0),
  ('cobalt-dragoon-2-60c', '1 × Lanciatore a corda', 1),
  ('cobalt-dragoon-2-60c', 'Manuale', 2),
  ('phoenix-wing-9-60gf', '1 × Trottola Phoenix Wing 9-60GF', 0),
  ('phoenix-wing-9-60gf', 'Manuale', 1),
  ('shark-edge-3-60lf', '1 × Trottola Shark Edge 3-60LF', 0),
  ('shark-edge-3-60lf', 'Manuale', 1),
  ('dran-sword-4-80db', '1 × Trottola Dran Sword 4-80DB', 0),
  ('dran-sword-4-80db', '1 × Lanciatore', 1),
  ('dran-sword-4-80db', 'Manuale', 2),
  ('dran-buster-1-60a', '1 × Trottola Dran Buster 1-60A', 0),
  ('dran-buster-1-60a', 'Manuale', 1),
  ('sneak-attack-battle-set', '1 × Stadio', 0),
  ('sneak-attack-battle-set', '2 × Trottole Beyblade X', 1),
  ('sneak-attack-battle-set', '2 × Lanciatori', 2),
  ('sneak-attack-battle-set', 'Manuale di gioco', 3)
) as v(slug, content, sort_order)
join public.products p on p.slug = v.slug;

-- --- Product relations -----------------------------------------------------
insert into public.product_relations (product_id, related_product_id, sort_order)
select p.id, r.id, v.sort_order
from (values
  ('stadio-beystadium-x-attack-set', 'wizard-arrow-4-80b', 0),
  ('stadio-beystadium-x-attack-set', 'cobalt-dragoon-2-60c', 1),
  ('stadio-beystadium-x-attack-set', 'phoenix-wing-9-60gf', 2),
  ('stadio-beystadium-x-attack-set', 'shark-edge-3-60lf', 3),
  ('wizard-arrow-4-80b', 'cobalt-dragoon-2-60c', 0),
  ('wizard-arrow-4-80b', 'dran-buster-1-60a', 1),
  ('wizard-arrow-4-80b', 'shark-edge-3-60lf', 2),
  ('wizard-arrow-4-80b', 'phoenix-wing-9-60gf', 3),
  ('cobalt-dragoon-2-60c', 'wizard-arrow-4-80b', 0),
  ('cobalt-dragoon-2-60c', 'phoenix-wing-9-60gf', 1),
  ('cobalt-dragoon-2-60c', 'shark-edge-3-60lf', 2),
  ('cobalt-dragoon-2-60c', 'dran-sword-4-80db', 3),
  ('phoenix-wing-9-60gf', 'dran-sword-4-80db', 0),
  ('phoenix-wing-9-60gf', 'shark-edge-3-60lf', 1),
  ('phoenix-wing-9-60gf', 'wizard-arrow-4-80b', 2),
  ('phoenix-wing-9-60gf', 'dran-buster-1-60a', 3),
  ('shark-edge-3-60lf', 'dran-buster-1-60a', 0),
  ('shark-edge-3-60lf', 'phoenix-wing-9-60gf', 1),
  ('shark-edge-3-60lf', 'wizard-arrow-4-80b', 2),
  ('shark-edge-3-60lf', 'cobalt-dragoon-2-60c', 3),
  ('dran-sword-4-80db', 'phoenix-wing-9-60gf', 0),
  ('dran-sword-4-80db', 'cobalt-dragoon-2-60c', 1),
  ('dran-sword-4-80db', 'shark-edge-3-60lf', 2),
  ('dran-sword-4-80db', 'dran-buster-1-60a', 3),
  ('dran-buster-1-60a', 'wizard-arrow-4-80b', 0),
  ('dran-buster-1-60a', 'shark-edge-3-60lf', 1),
  ('dran-buster-1-60a', 'cobalt-dragoon-2-60c', 2),
  ('dran-buster-1-60a', 'dran-sword-4-80db', 3),
  ('sneak-attack-battle-set', 'stadio-beystadium-x-attack-set', 0),
  ('sneak-attack-battle-set', 'wizard-arrow-4-80b', 1),
  ('sneak-attack-battle-set', 'cobalt-dragoon-2-60c', 2),
  ('sneak-attack-battle-set', 'dran-buster-1-60a', 3)
) as v(slug, related_slug, sort_order)
join public.products p on p.slug = v.slug
join public.products r on r.slug = v.related_slug
on conflict do nothing;

-- --- Bundle ----------------------------------------------------------------
insert into public.bundles
  (slug, eyebrow, title_line_1, title_line_2, description, price_cents, compare_at_price_cents,
   hero_product_id, publication_status, active)
values
  ('bundle-campione', 'Bundle campione', 'Scatena il', 'tuo potenziale.',
   'Arena, 2 trottole ad alte prestazioni e 2 lanciatori. Tutto ciò che ti serve per dominare.',
   7999, 9996,
   (select id from public.products where slug = 'stadio-beystadium-x-attack-set'),
   'published', true)
on conflict (slug) do nothing;

insert into public.bundle_items (bundle_id, product_id, quantity, sort_order)
select b.id, p.id, 1, v.sort_order
from (values
  ('stadio-beystadium-x-attack-set', 0),
  ('wizard-arrow-4-80b', 1),
  ('dran-buster-1-60a', 2)
) as v(slug, sort_order)
join public.bundles b on b.slug = 'bundle-campione'
join public.products p on p.slug = v.slug
on conflict do nothing;

commit;
