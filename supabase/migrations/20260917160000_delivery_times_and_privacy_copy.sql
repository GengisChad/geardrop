-- Replace stale delivery-time promises, add Italy-only shipping notice, list all data
-- processors in the privacy page, and remove the reference to non-existent social channels.
-- Only the managed content_pages rows that exist in the seed are touched here; legal pages
-- (termini, privacy) are kept as static text and do not have managed content_pages rows.

-- faq: add "I prodotti sono originali?" and update spedizioni cost item with Italy note.
update public.content_pages
set markdown_source = replace(
  markdown_source,
  '## Quanto costa la spedizione?',
  '## I prodotti sono originali?

Sì, tutti i prodotti in vendita su GEAR//DROP sono Beyblade X originali certificati Hasbro.

## Quanto costa la spedizione?'
)
where slug = 'faq'
  and markdown_source not like '%I prodotti sono originali?%';

update public.content_pages
set markdown_source = replace(
  markdown_source,
  'La spedizione standard è gratuita per ordini superiori a 59€. Sotto questa soglia si applica una tariffa fissa di 4,90€.',
  'La spedizione standard è gratuita per ordini superiori a 59€. Sotto questa soglia si applica una tariffa fissa di 4,90€.

Spediamo solo in Italia.'
)
where slug = 'faq'
  and markdown_source not like '%Spediamo solo in Italia%';

-- spedizioni: replace stale 14-day dispatch window with the owner-approved 1-5 day delivery.
update public.content_pages
set markdown_source = replace(
  markdown_source,
  'I prodotti disponibili partono dopo la conferma del pagamento. I pre-ordini potrebbero arrivare tra 10/15 giorni lavorativi dalla conferma dell''ordine.

I tempi di transito del corriere iniziano dalla spedizione e dipendono dal servizio e dalla destinazione.',
  'I prodotti disponibili vengono consegnati in 1-5 giorni lavorativi a seconda del corriere, dalla conferma del pagamento.

I pre-ordini potrebbero arrivare tra 10/15 giorni lavorativi dalla conferma dell''ordine.

## Destinazioni

Spediamo solo in Italia.'
)
where slug = 'spedizioni'
  and markdown_source not like '%1-5 giorni lavorativi%';

-- contatti: remove the reference to non-existent social channels.
update public.content_pages
set markdown_source = replace(
  markdown_source,
  'Per consigli su combo e assetti, la community è il posto giusto: ci trovi sui canali social.',
  'Per consigli su combo e assetti scrivici a infogeardrop@gmail.com: rispondiamo volentieri.'
)
where slug = 'contatti'
  and markdown_source like '%canali social%';
