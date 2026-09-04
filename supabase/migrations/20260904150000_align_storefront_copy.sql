begin;

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('geardrop:truthful-storefront-copy:2026-09-04', 0)
);

-- Replace only the exact CMS values shipped by the old bootstrap. Any reviewed admin
-- edit makes the predicate false and remains untouched.
update public.homepage_sections
set description = 'Catalogo Beyblade X in pre-ordine, con disponibilità indicate e assistenza prima della conferma.',
    updated_at = now()
where section_key = 'hero'
  and description = 'Prodotti originali, drop esclusivi e una community di appassionati. Massima performance, ogni battaglia.';

update public.homepage_sections
set title = 'Pre-ordini con disponibilità indicate e spedizione entro 14 giorni dalla conferma.',
    updated_at = now()
where section_key = 'trust'
  and title = 'Prodotti originali. Spedizione veloce. Resi semplici.';

update public.homepage_sections
set title = 'Catalogo Beyblade X',
    cta_label = 'Esplora il catalogo',
    cta_href = '/negozio',
    updated_at = now()
where section_key = 'latest-drops'
  and title = 'Ultimi drop'
  and cta_label = 'Scopri i nuovi arrivi'
  and cta_href = '/negozio?sort=novita';

update public.homepage_sections
set title = 'Pre-ordini aperti',
    updated_at = now()
where section_key = 'bestsellers'
  and title = 'Più venduti';

update public.homepage_sections
set title = 'Esplora il catalogo',
    cta_label = 'Vedi Beyblade X',
    updated_at = now()
where section_key = 'competitive-picks'
  and title = 'Scelti per il competitivo'
  and cta_label = 'Guida alle combo';

-- Keep the reusable section types and bundle records, but do not publish the two
-- unsupported seeded presentations. Custom admin-authored sections do not match.
update public.homepage_sections as section
set publication_status = 'draft',
    published_at = null,
    active = false,
    updated_at = now()
where section.section_key in ('champion-bundle', 'club')
  and (
    (
      section.section_key = 'champion-bundle'
      and section.section_type = 'bundle'
      and section.eyebrow is null
      and section.title = 'Bundle campione'
      and section.subtitle is null
      and section.description is null
      and section.desktop_media_asset_id is null
      and section.mobile_media_asset_id is null
      and section.cta_label is null
      and section.cta_href is null
      and section.publication_status = 'published'
      and section.published_at = section.created_at
      and section.starts_at is null
      and section.ends_at is null
      and section.active = true
      and section.sort_order = 7
      and (
        select count(*)
        from public.homepage_section_bundles as relation
        where relation.section_id = section.id
      ) = 1
      and exists (
        select 1
        from public.homepage_section_bundles as relation
        join public.bundles as bundle on bundle.id = relation.bundle_id
        where relation.section_id = section.id
          and relation.sort_order = 0
          and bundle.slug = 'bundle-campione'
      )
      and not exists (
        select 1 from public.homepage_section_products as relation
        where relation.section_id = section.id
      )
      and not exists (
        select 1 from public.homepage_section_categories as relation
        where relation.section_id = section.id
      )
    )
    or
    (
      section.section_key = 'club'
      and section.section_type = 'club'
      and section.eyebrow is null
      and section.title = 'GEAR//DROP Club'
      and section.subtitle = 'Entra nel club. Sblocca vantaggi esclusivi.'
      and section.description is null
      and section.desktop_media_asset_id is null
      and section.mobile_media_asset_id is null
      and section.cta_label = 'Scopri di più'
      and section.cta_href = '/account'
      and section.publication_status = 'published'
      and section.published_at = section.created_at
      and section.starts_at is null
      and section.ends_at is null
      and section.active = true
      and section.sort_order = 9
      and not exists (
        select 1 from public.homepage_section_products as relation
        where relation.section_id = section.id
      )
      and not exists (
        select 1 from public.homepage_section_categories as relation
        where relation.section_id = section.id
      )
      and not exists (
        select 1 from public.homepage_section_bundles as relation
        where relation.section_id = section.id
      )
    )
  );

-- Update only the known stale sentences inside the known seeded information pages.
update public.content_pages
set markdown_source = replace(
      replace(
        markdown_source,
        '## I prodotti sono originali?',
        '## Cosa include il catalogo?'
      ),
      'Sì. Vendiamo esclusivamente prodotti ufficiali Beyblade X. Nessuna replica, nessun articolo non autorizzato.',
      'Il catalogo raccoglie trottole, set e accessori Beyblade X con descrizioni e disponibilità indicate per ciascun prodotto.'
    ),
    updated_at = now()
where slug = 'faq'
  and position('## I prodotti sono originali?' in markdown_source) > 0
  and position('Sì. Vendiamo esclusivamente prodotti ufficiali Beyblade X. Nessuna replica, nessun articolo non autorizzato.' in markdown_source) > 0;

update public.content_pages
set markdown_source = replace(
      replace(
        markdown_source,
        'Il prodotto è già ordinato e sta per entrare in magazzino. Puoi acquistarlo subito: lo spediamo appena disponibile.',
        'La disponibilità è in aggiornamento. Contattaci prima dell''ordine per conoscere lo stato corrente.'
      ),
      'Il prodotto non è ancora uscito. Ordinandolo ora ti assicuri una unità del primo stock e lo spediamo il giorno dell''uscita.',
      'Il prodotto è prenotabile entro l''allocazione indicata. GEAR//DROP affida il pacco al corriere entro 14 giorni dalla conferma dell''ordine.'
    ),
    updated_at = now()
where slug = 'faq'
  and position('Il prodotto è già ordinato e sta per entrare in magazzino. Puoi acquistarlo subito: lo spediamo appena disponibile.' in markdown_source) > 0
  and position('Il prodotto non è ancora uscito. Ordinandolo ora ti assicuri una unità del primo stock e lo spediamo il giorno dell''uscita.' in markdown_source) > 0;

update public.content_pages
set markdown_source = replace(
      replace(
        replace(
          replace(
            replace(
              markdown_source,
              'Gli ordini confermati entro le 14:00 nei giorni lavorativi partono in giornata.',
              'Per i pre-ordini, GEAR//DROP affida il pacco al corriere entro 14 giorni dalla conferma dell''ordine.'
            ),
            'La consegna standard avviene in 24/48h in tutta Italia. Nelle isole e nelle zone disagiate può servire un giorno in più.',
            'I tempi di transito del corriere iniziano dalla spedizione e dipendono dal servizio e dalla destinazione.'
          ),
          'Sotto la soglia, la spedizione standard costa 4,90€. L''opzione Express è disponibile in checkout con un supplemento di 6,90€.',
          'Sotto la soglia, la spedizione standard costa 4,90€. Le opzioni disponibili sono mostrate prima della conferma.'
        ),
        'Ricevi il codice di tracciamento via email appena il pacco lascia il magazzino.',
        'Le informazioni di tracciamento vengono comunicate quando il pacco viene affidato al corriere.'
      ),
      'Se il tuo ordine contiene un pre-ordine, spediamo tutto insieme alla data di uscita. Se preferisci ricevere prima il resto, effettua due ordini separati.',
      'Gli articoli dello stesso ordine vengono gestiti insieme. Per esigenze diverse, chiedi assistenza prima della conferma.'
    ),
    updated_at = now()
where slug = 'spedizioni'
  and position('Gli ordini confermati entro le 14:00 nei giorni lavorativi partono in giornata.' in markdown_source) > 0
  and position('La consegna standard avviene in 24/48h in tutta Italia. Nelle isole e nelle zone disagiate può servire un giorno in più.' in markdown_source) > 0;

update public.content_pages
set excerpt = 'GEAR//DROP è un progetto indipendente dedicato al catalogo Beyblade X.',
    seo_description = 'GEAR//DROP è un progetto indipendente dedicato al catalogo Beyblade X.',
    markdown_source = replace(
      replace(
      replace(
        replace(
          replace(
            replace(
              replace(
                replace(
                  markdown_source,
                  '## Nati nello stadio. Cresciuti nella community.',
                  '## Pensato per il catalogo. Costruito per scegliere.'
                ),
                'GEAR//DROP è uno store indipendente costruito da blader per blader. Un posto dove trovare i pezzi giusti, sapere davvero cosa stai comprando e riceverlo in fretta.',
                'GEAR//DROP è un progetto indipendente dedicato a un catalogo Beyblade X chiaro, con disponibilità indicate e assistenza prima dell''ordine.'
              ),
              '### Solo prodotti originali',
              '### Catalogo leggibile'
            ),
            'Vendiamo esclusivamente Beyblade X ufficiali. Nessuna replica: quello che compri è quello che porti in torneo.',
            'Raccogliamo le informazioni essenziali su trottole, set e accessori Beyblade X in un catalogo chiaro.'
          ),
          '### Drop, non scaffali',
          '### Disponibilità esplicita'
        ),
        'Ogni settimana entrano nuovi pezzi. Quando un drop finisce, finisce: preferiamo dirlo che fingere disponibilità.',
        'Ogni pagina mostra la disponibilità corrente del pre-ordine, senza trasformarla in una promessa di consegna immediata.'
      ),
      'Siamo nati dalla community italiana di Beyblade X e continuiamo a farne parte, dentro e fuori dallo stadio.',
      'L''ordine viene gestito con assistenza e senza addebito online finché il servizio di pagamento non è attivo.'
      ),
      '### Community prima di tutto',
      '### Assistenza prima dell''ordine'
    ),
    updated_at = now()
where slug = 'chi-siamo'
  and excerpt = 'GEAR//DROP è uno store indipendente costruito da blader per blader.'
  and seo_description = 'GEAR//DROP è il punto di riferimento italiano per Beyblade X: prodotti originali, spedizione veloce, community.';

update public.site_settings
set default_seo_description = 'Catalogo Beyblade X in pre-ordine: trottole, lanciatori, stadi e accessori con disponibilità indicate.'
where singleton
  and default_seo_description = 'Trottole, lanciatori, stadi e accessori Beyblade X. Prodotti originali, spedizione veloce in tutta Italia, drop settimanali.';

-- Placeholder legal rows are never published. Reviewed text has no marker and is left
-- byte-for-byte unchanged.
update public.content_pages
set publication_status = 'draft',
    published_at = null,
    active = false,
    updated_at = now()
where slug in ('termini', 'privacy')
  and position('Testo segnaposto. Questa pagina non è stata redatta né revisionata da un legale' in markdown_source) > 0;

commit;
