-- Sondaggi del canale (27/11/2026): solo la chiave del server scrive, lo staff legge i risultati
-- dalla funzione, e una bozza non compare tra i risultati.
begin;
select plan(7);

select ok(has_table_privilege('service_role', 'public.telegram_polls', 'INSERT'), 'the server keeps a poll');
select ok(not has_table_privilege('authenticated', 'public.telegram_polls', 'SELECT'), 'nobody signed in reads the table directly');
select ok(not has_table_privilege('anon', 'public.telegram_polls', 'SELECT'), 'nor does a guest');
select ok(has_function_privilege('authenticated', 'public.get_telegram_poll_results(bigint)', 'EXECUTE'), 'staff ask the function');
select ok(not has_function_privilege('anon', 'public.get_telegram_poll_results(bigint)', 'EXECUTE'), 'a guest cannot');

select throws_ok(
  $$insert into public.telegram_polls (subject, question, options, status) values ('CX-21', 'CX-21: lo prendereste?', '[]', 'live')$$,
  '23514', null,
  'a poll is a draft, open, closed or discarded'
);

insert into public.telegram_polls (subject, question, options) values ('CX-21', 'CX-21: lo prendereste?', '["Sì","Forse","No"]');
select is(
  (select count(*)::integer from public.telegram_polls where status = 'draft' and subject = 'CX-21'),
  1,
  'a poll starts as a draft, which only the owner sees in the bot'
);

select * from finish();
rollback;
