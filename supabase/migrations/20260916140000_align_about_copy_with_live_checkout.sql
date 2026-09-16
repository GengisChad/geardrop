begin;

-- The catalogue is sold from stock and paid online through Stripe, so two "Chi siamo" pillars
-- no longer tell the truth: one still describes pre-orders, the other says nothing is charged
-- online. Each sentence is replaced only where the reviewed text is still present, so an edit
-- made in the admin since then is left untouched.
update public.content_pages
set markdown_source = replace(
      replace(
        markdown_source,
        'Ogni pagina mostra la disponibilità corrente del pre-ordine, senza trasformarla in una promessa di consegna immediata.',
        'Ogni scheda indica la disponibilità e i pezzi rimasti, senza promesse che non possiamo mantenere.'
      ),
      'L''ordine viene gestito con assistenza e senza addebito online finché il servizio di pagamento non è attivo.',
      'Hai un dubbio su un pezzo prima di ordinare? Scrivici e ti rispondiamo noi. Il pagamento avviene in sicurezza su Stripe.'
    ),
    updated_at = now()
where slug = 'chi-siamo'
  and (
    position('Ogni pagina mostra la disponibilità corrente del pre-ordine' in markdown_source) > 0
    or position('senza addebito online finché il servizio di pagamento non è attivo' in markdown_source) > 0
  );

commit;
