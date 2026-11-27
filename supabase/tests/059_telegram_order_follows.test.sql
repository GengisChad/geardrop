-- «Segui su Telegram» (27/11/2026): una chat segue un ordine una volta sola, solo la chiave del
-- server scrive la tabella, e la riga va via con l'ordine.
begin;
select plan(6);

select ok(has_table_privilege('service_role', 'public.telegram_order_follows', 'INSERT'), 'the server keeps a chat on an order');
select ok(has_table_privilege('service_role', 'public.telegram_order_follows', 'DELETE'), 'and forgets it');
select ok(not has_table_privilege('anon', 'public.telegram_order_follows', 'SELECT'), 'a guest cannot read who follows what');
select ok(not has_table_privilege('authenticated', 'public.telegram_order_follows', 'SELECT'), 'nor can a signed-in customer');

create temporary table one_order as select id from public.orders order by id limit 1;

select throws_ok(
  $$insert into public.telegram_order_follows (order_id, chat_id) values (-1, 444555666)$$,
  '23503', null,
  'a follow names a real order'
);

select lives_ok(
  $$insert into public.telegram_order_follows (order_id, chat_id) select id, 444555666 from one_order$$,
  'a chat can follow an order'
);

select * from finish();
rollback;
