-- I pre-ordini presi su Telegram: i dati di chi compra li legge solo la chiave del server, e i
-- pezzi si contano in un posto solo, products.preorder_allocation, lo stesso del checkout del sito.
begin;
select plan(16);

select ok(not has_table_privilege('anon', 'public.telegram_preorders', 'SELECT'), 'a guest cannot read who pre-ordered');
select ok(not has_table_privilege('authenticated', 'public.telegram_preorders', 'SELECT'), 'a signed-in account cannot read who pre-ordered');
select ok(not has_table_privilege('authenticated', 'public.telegram_preorders', 'UPDATE'), 'a signed-in account cannot mark a pre-order paid');
select ok(has_table_privilege('service_role', 'public.telegram_preorders', 'INSERT'), 'the server records pre-orders');
select ok(not has_function_privilege('anon', 'public.telegram_preorder_hold(text,integer)', 'EXECUTE'), 'a guest cannot reserve pieces directly');
select ok(not has_function_privilege('authenticated', 'public.telegram_preorder_hold(text,integer)', 'EXECUTE'), 'a signed-in account cannot reserve pieces directly');
select ok(has_function_privilege('service_role', 'public.telegram_preorder_hold(text,integer)', 'EXECUTE'), 'the server reserves pieces');

-- The bot may draft the pre-order that opens on the channel -------------------------------------
insert into public.telegram_news_drafts (event_key, kind, payload)
values ('preorder:test-piece:2026-11-26', 'channel_preorder', '{"kind":"channel_preorder","slugs":["test-piece"]}');
select is(
  (select count(*)::integer from public.telegram_news_drafts where kind = 'channel_preorder'),
  1,
  'a channel pre-order is a kind of news the bot can draft'
);

-- "Ordino 30 pezzi, ne prendono 10, ne tornano 20" ------------------------------------------------
create temporary table hold_piece as
  select slug from public.products where publication_status = 'published' order by id limit 1;
update public.products
set availability_override = 'preorder', preorder_allocation = 30
where slug = (select slug from hold_piece);

select is(public.telegram_preorder_hold((select slug from hold_piece), 3), 27, 'reserving three pieces leaves twenty-seven');
select is(public.telegram_preorder_hold((select slug from hold_piece), 7), 20, 'ten reserved in all leave twenty for the shelf');
select is(public.telegram_preorder_hold((select slug from hold_piece), -3), 23, 'a reservation nobody paid gives its pieces back');
update public.products set preorder_allocation = 2 where slug = (select slug from hold_piece);
select is(public.telegram_preorder_hold((select slug from hold_piece), 3), null, 'more pieces than are left reserves nothing');
select is(
  (select preorder_allocation from public.products where slug = (select slug from hold_piece)),
  2,
  'and leaves the count as it was'
);

update public.products set availability_override = null where slug = (select slug from hold_piece);
select is(public.telegram_preorder_hold((select slug from hold_piece), 1), null, 'a product that is no longer a pre-order cannot be reserved');
select is(public.telegram_preorder_hold('no-such-piece', 1), null, 'an unknown product reserves nothing');
select throws_ok(
  $$select public.telegram_preorder_hold('any', 0)$$,
  '22023', 'GD_TELEGRAM_PREORDER_INVALID_HOLD',
  'a hold of zero pieces is refused'
);

select * from finish();
rollback;
