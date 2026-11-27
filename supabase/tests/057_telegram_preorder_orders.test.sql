-- Un pre-ordine Telegram pagato con PayPal.me diventa un ordine del negozio (27/11/2026): pagato,
-- con il Locker scelto nel bot, una riga in pre-ordine, e i pezzi non vengono tolti una seconda volta.
begin;
select plan(17);

select ok(not has_function_privilege('anon', 'public.record_telegram_preorder_order(bigint)', 'EXECUTE'), 'a guest cannot record an order');
select ok(not has_function_privilege('authenticated', 'public.record_telegram_preorder_order(bigint)', 'EXECUTE'), 'a signed-in account cannot record an order');
select ok(has_function_privilege('service_role', 'public.record_telegram_preorder_order(bigint)', 'EXECUTE'), 'the server records the order');

create temporary table piece as
  select id, slug, name, sku from public.products where publication_status = 'published' order by id limit 1;
update public.products set availability_override = 'preorder', preorder_allocation = 7
where id = (select id from piece);

insert into public.telegram_preorders (
  code, chat_id, username, product_slug, product_name, quantity, unit_cents, shipping_cents, total_cents,
  buyer_name, email, phone, locker, status, step
)
select 'GDT-7K3Q9A', 444555666, 'blader_mario', piece.slug, piece.name, 2, 1000, 490, 2490,
  'Mario Rossi', 'Mario@Example.it', '+393331234567',
  '{"id":"IT_ITROM01M","label":"ROM01 · Via Marsala 29, 00185 Roma"}'::jsonb, 'awaiting_payment', 'confirm'
from piece;
create temporary table reservation as select id from public.telegram_preorders where code = 'GDT-7K3Q9A';

select throws_ok(
  $$select * from public.record_telegram_preorder_order((select id from reservation))$$,
  '22023', 'GD_TELEGRAM_ORDER_NOT_PAID',
  'a reservation nobody paid is not an order'
);

update public.telegram_preorders set status = 'paid' where id = (select id from reservation);
create temporary table first_call as select * from public.record_telegram_preorder_order((select id from reservation));

select is((select created from first_call), true, 'the first call creates the order');
select is((select order_number from first_call), 'GD-T7K3Q9A', 'its number carries the reservation''s code');
select is(
  (select status::text || '/' || payment_status::text from public.orders where id = (select order_id from first_call)),
  'confirmed/paid',
  'the order is confirmed and paid'
);
select is(
  (select subtotal_cents || '+' || shipping_cents || '=' || total_cents from public.orders where id = (select order_id from first_call)),
  '2000+490=2490',
  'it costs what the bot showed'
);
select is((select email from public.orders where id = (select order_id from first_call)), 'mario@example.it', 'the email is stored as the checkout stores it');
select is(
  (select shipping_address_snapshot ->> 'method' || ' ' || (shipping_address_snapshot ->> 'pickupPointId')
   from public.orders where id = (select order_id from first_call)),
  'inpost-locker IT_ITROM01M',
  'it goes to the Locker chosen in the bot, as a Locker order from the site'
);
select is(
  (select reservation_kind || ' ' || preorder_quantity || '/' || quantity from public.order_items where order_id = (select order_id from first_call)),
  'preorder 2/2',
  'its line is a pre-order of both pieces'
);
select is((select preorder_allocation from public.products where id = (select id from piece)), 7, 'the pieces are not taken off the count a second time');
select is(
  (select order_id from public.telegram_preorders where id = (select id from reservation)),
  (select order_id from first_call),
  'the reservation remembers its order'
);
select is(
  (select count(*)::integer from public.order_status_events where order_id = (select order_id from first_call)),
  1,
  'the timeline says how it was paid'
);
select is(
  (select count(*)::integer from public.audit_events where action = 'order.paid_on_paypal_me' and entity_id = (select order_id from first_call)::text),
  1,
  'the audit trail records it'
);

create temporary table second_call as select * from public.record_telegram_preorder_order((select id from reservation));
select is((select created from second_call), false, 'asking again creates nothing');
select is((select order_id from second_call), (select order_id from first_call), 'and answers with the same order');

select * from finish();
rollback;
