-- «Avvisami» su Telegram (27/11/2026): una richiesta ha o un'email o una chat Telegram, una sola
-- per prodotto e chat, e solo la chiave del server scrive quelle Telegram.
begin;
select plan(7);

select ok(has_table_privilege('service_role', 'public.restock_requests', 'INSERT'), 'the server keeps a Telegram request');
select ok(has_table_privilege('service_role', 'public.restock_requests', 'DELETE'), 'the server forgets it once answered');
select ok(not has_table_privilege('anon', 'public.restock_requests', 'INSERT'), 'a guest cannot write the list directly');

create temporary table piece as
  select organization_id, slug from public.products where publication_status = 'published' order by id limit 1;

insert into public.restock_requests (organization_id, product_slug, telegram_chat_id)
select organization_id, slug, 444555666 from piece;
select is(
  (select count(*)::integer from public.restock_requests where telegram_chat_id = 444555666),
  1,
  'a request can name a Telegram chat instead of an email'
);

select throws_ok(
  $$insert into public.restock_requests (organization_id, product_slug, telegram_chat_id) select organization_id, slug, 444555666 from piece$$,
  '23505', null,
  'one request per product and chat'
);
select throws_ok(
  $$insert into public.restock_requests (organization_id, product_slug) select organization_id, slug from piece$$,
  '23514', null,
  'a request names a way to reach the customer'
);
select throws_ok(
  $$insert into public.restock_requests (organization_id, product_slug, email, telegram_chat_id) select organization_id, slug, 'a@example.it', 1 from piece$$,
  '23514', null,
  'and only one'
);

select * from finish();
rollback;
