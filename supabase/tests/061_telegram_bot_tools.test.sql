-- Gli attrezzi del bot Telegram (28/11/2026): magazzino e prezzi dalla chat del titolare, solo con
-- la chiave del server, una volta per tasto; l'assistenza tiene i collegamenti, mai i testi.
begin;
select plan(14);

select ok(has_function_privilege('service_role', 'public.telegram_adjust_inventory(bigint, bigint, integer, text)', 'EXECUTE'), 'the server can move stock for the bot');
select ok(not has_function_privilege('authenticated', 'public.telegram_adjust_inventory(bigint, bigint, integer, text)', 'EXECUTE'), 'a signed-in account cannot');
select ok(not has_function_privilege('anon', 'public.telegram_adjust_inventory(bigint, bigint, integer, text)', 'EXECUTE'), 'nor can a guest');
select ok(has_function_privilege('service_role', 'public.telegram_apply_pricing_proposal(bigint, bigint, text)', 'EXECUTE'), 'the server can apply a price for the bot');
select ok(not has_function_privilege('authenticated', 'public.telegram_apply_pricing_proposal(bigint, bigint, text)', 'EXECUTE'), 'a signed-in account cannot');
select ok(not has_table_privilege('anon', 'public.telegram_support_messages', 'SELECT'), 'a guest cannot read who wrote to the shop');
select ok(not has_table_privilege('authenticated', 'public.telegram_support_messages', 'SELECT'), 'nor can a signed-in customer');
select ok(not has_table_privilege('authenticated', 'public.telegram_owner_actions', 'SELECT'), 'the owner''s taps are the server''s');

create temporary table one_product as
select id, organization_id, stock_quantity from public.products order by id limit 1;

select is(
  (select public.telegram_adjust_inventory(organization_id, id, 2, 'test:carico:1') from one_product),
  (select stock_quantity + 2 from one_product),
  'a load adds the pieces'
);
select is(
  (select public.telegram_adjust_inventory(organization_id, id, 2, 'test:carico:1') from one_product),
  null::integer,
  'the same button pressed twice adds them once'
);
select is(
  (select stock_quantity from public.products where id = (select id from one_product)),
  (select stock_quantity + 2 from one_product),
  'and the shelf says so'
);
select is(
  (select count(*)::integer from public.inventory_movements
   where product_id = (select id from one_product) and note = 'Telegram: rettifica dal bot'),
  1,
  'one movement, with the bot in the note'
);
select throws_ok(
  $$select public.telegram_adjust_inventory(organization_id, id, -100000 + 1, 'test:carico:2') from one_product$$,
  '22023', 'GD_INVALID_STOCK_DELTA',
  'a typo of thousands of pieces is refused'
);
select is(
  (select count(*)::integer from public.telegram_owner_actions where request_key = 'test:carico:2'),
  0,
  'and a refused request keeps no key, so it can be tried again'
);

select * from finish();
rollback;
