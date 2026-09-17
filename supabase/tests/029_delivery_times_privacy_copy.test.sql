begin;
select plan(6);

-- 1. faq gains the authenticity FAQ entry
select ok(
  (select markdown_source from public.content_pages where slug = 'faq') like '%I prodotti sono originali?%',
  'faq page mentions product authenticity');

-- 2. faq states shipping is Italy-only
select ok(
  (select markdown_source from public.content_pages where slug = 'faq') like '%Spediamo solo in Italia%',
  'faq page mentions Italy-only shipping');

-- 3. spedizioni shows 1-5 giorni delivery window, not the old 14-day promise
select ok(
  (select markdown_source from public.content_pages where slug = 'spedizioni') like '%1-5 giorni lavorativi%',
  'spedizioni page states 1-5 working day delivery');

select ok(
  (select markdown_source from public.content_pages where slug = 'spedizioni') not like '%entro 14 giorni dalla conferma%',
  'spedizioni page does not show the old 14-day dispatch promise');

-- 4. spedizioni explicitly restricts to Italy
select ok(
  (select markdown_source from public.content_pages where slug = 'spedizioni') like '%Spediamo solo in Italia%',
  'spedizioni page states Italy-only shipping');

-- 5. contatti does not refer to non-existent social channels
select ok(
  (select markdown_source from public.content_pages where slug = 'contatti') not like '%canali social%',
  'contatti page does not reference social channels');

select * from finish();
rollback;
