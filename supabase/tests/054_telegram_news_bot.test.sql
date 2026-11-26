-- Il bot Telegram delle news tiene memoria e bozze in due tabelle che solo la chiave del server
-- raggiunge: nessuno, nemmeno un account dello staff, legge dal browser cosa sta per essere annunciato.
begin;
select plan(14);

select ok(not has_table_privilege('anon', 'public.telegram_news_drafts', 'SELECT'), 'a guest cannot read the drafts');
select ok(not has_table_privilege('authenticated', 'public.telegram_news_drafts', 'SELECT'), 'a signed-in account cannot read the drafts');
select ok(not has_table_privilege('authenticated', 'public.telegram_news_drafts', 'UPDATE'), 'a signed-in account cannot publish a draft by hand');
select ok(not has_table_privilege('anon', 'public.telegram_news_memory', 'SELECT'), 'a guest cannot read the memory');
select ok(not has_table_privilege('authenticated', 'public.telegram_news_memory', 'INSERT'), 'a signed-in account cannot write the memory');
select ok(has_table_privilege('service_role', 'public.telegram_news_drafts', 'SELECT, INSERT, UPDATE'), 'the server reads and writes the drafts');
select ok(has_table_privilege('service_role', 'public.telegram_news_memory', 'SELECT, INSERT, UPDATE'), 'the server reads and writes the memory');
select ok(not has_table_privilege('service_role', 'public.telegram_news_drafts', 'DELETE'), 'not even the server deletes a draft: what was proposed stays on record');

select is_empty(
  $$select policyname from pg_catalog.pg_policies where schemaname = 'public' and tablename in ('telegram_news_drafts', 'telegram_news_memory')$$,
  'no policy opens either table to the API roles'
);

-- The same news found twice is one draft ---------------------------------------------------------
insert into public.telegram_news_drafts (event_key, kind, payload)
values ('new:soar-phoenix-9-60gf', 'new_product', '{"kind":"new_product","slugs":["soar-phoenix-9-60gf"]}');
select is(
  (select status from public.telegram_news_drafts where event_key = 'new:soar-phoenix-9-60gf'),
  'draft',
  'a piece of news starts as a draft'
);
select throws_ok(
  $$insert into public.telegram_news_drafts (event_key, kind, payload) values ('new:soar-phoenix-9-60gf', 'new_product', '{}')$$,
  '23505', null,
  'the same event cannot be drafted twice'
);
select throws_ok(
  $$insert into public.telegram_news_drafts (event_key, kind, payload) values ('order:1', 'new_order', '{}')$$,
  '23514', null,
  'only the five kinds of news the owner chose can be drafted'
);
select throws_ok(
  $$update public.telegram_news_drafts set status = 'sent' where event_key = 'new:soar-phoenix-9-60gf'$$,
  '23514', null,
  'a draft is a draft, publishing, published or discarded, nothing else'
);

-- One memory per subject -------------------------------------------------------------------------
insert into public.telegram_news_memory (subject, state) values ('product:soar-phoenix-9-60gf', '{"stock":"esaurito","prices":[]}');
select throws_ok(
  $$insert into public.telegram_news_memory (subject, state) values ('product:soar-phoenix-9-60gf', '{}')$$,
  '23505', null,
  'a subject is remembered once'
);

select * from finish();
rollback;
