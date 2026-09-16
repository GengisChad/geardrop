begin;
select plan(20);

-- Fixtures ------------------------------------------------------------------
insert into public.categories(slug,name,tagline,description,active,publication_status,published_at)
values('stripe-order-cat','Stripe','Stripe','Stripe',true,'published',now());
insert into public.products(category_id,slug,sku,name,tagline,description,price_cents,publication_status,active,stock_quantity)
values((select id from public.categories where slug='stripe-order-cat'),'stripe-stock','STRIPE-STOCK','Stripe stock','Stripe','Stripe',3000,'published',true,8),
      ((select id from public.categories where slug='stripe-order-cat'),'stripe-last','STRIPE-LAST','Stripe last piece','Stripe','Stripe',2000,'published',true,1);
insert into public.product_images(product_id,src,width,height,alt,sort_order,published,is_primary) values
((select id from public.products where sku='STRIPE-STOCK'),'/products/stripe-stock.webp',800,800,'Stripe stock',0,true,true),
((select id from public.products where sku='STRIPE-LAST'),'/products/stripe-last.webp',800,800,'Stripe last',0,true,true);

-- 1-4. Only the server's secret key can record a paid order ----------------------------
select ok(has_function_privilege('service_role','public.record_stripe_checkout_order(text,text,text,text,text,jsonb,jsonb,integer,text)','EXECUTE'),
  'the webhook, running with the secret key, may record paid orders');
select ok(not has_function_privilege('anon','public.record_stripe_checkout_order(text,text,text,text,text,jsonb,jsonb,integer,text)','EXECUTE'),
  'guests cannot record a paid order');
select ok(not has_function_privilege('authenticated','public.record_stripe_checkout_order(text,text,text,text,text,jsonb,jsonb,integer,text)','EXECUTE'),
  'signed-in customers cannot record a paid order');
select ok((select prosecdef from pg_proc where oid='public.record_stripe_checkout_order(text,text,text,text,text,jsonb,jsonb,integer,text)'::regprocedure),
  'recording runs as security definer');

-- 5-13. A paid session becomes a confirmed order and takes the stock ------------------------
create temporary table first_call on commit drop as
select * from public.record_stripe_checkout_order(
  'cs_test_stripeorder0000001', 'pi_test_1', 'GD-TESTORDR', 'Buyer@Example.com', '3331234567',
  '{"name":"Mario Rossi","address":"Via Roma 1","postalCode":"00100","city":"Roma","province":"RM","country":"IT"}',
  '[{"slug":"stripe-stock","name":"Stripe stock","quantity":2,"unit_price_cents":3000}]', 490, 'Citofono Rossi');

select is((select created from first_call), true, 'the first delivery creates the order');
select is((select order_number from first_call), 'GD-TESTORDR', 'the order keeps the checkout reference');
select results_eq(
  $$select status::text, payment_status::text, email, subtotal_cents, shipping_cents, total_cents, notes
    from public.orders where stripe_checkout_session_id = 'cs_test_stripeorder0000001'$$,
  $$values ('confirmed', 'paid', 'buyer@example.com', 6000, 490, 6490, 'Citofono Rossi')$$,
  'the order is confirmed, paid and priced as Stripe charged it');
select is((select shipping_address_snapshot ->> 'address' from public.orders where stripe_checkout_session_id = 'cs_test_stripeorder0000001'),
  'Via Roma 1', 'the shipping address is stored for the admin panel');
select results_eq(
  $$select sku_snapshot, quantity, line_total_cents, reservation_kind, image_src_snapshot
    from public.order_items where order_id = (select order_id from first_call)$$,
  $$values ('STRIPE-STOCK', 2, 6000, 'stock', '/products/stripe-stock.webp')$$,
  'each paid line is stored with its product snapshot');
select is((select stock_quantity from public.products where sku = 'STRIPE-STOCK'), 6, 'the pieces sold come off the stock');
select results_eq(
  $$select delta, stock_after, reason::text from public.inventory_movements where order_id = (select order_id from first_call)$$,
  $$values (-2, 6, 'order_reserved')$$,
  'the stock change is recorded as an inventory movement of the order');
select is((select count(*)::int from public.order_status_events where order_id = (select order_id from first_call) and to_status = 'confirmed'),
  1, 'the confirmation is on the order timeline');
select is((select count(*)::int from public.audit_events where entity_type = 'orders' and entity_id = (select order_id from first_call)::text and action = 'order.paid_on_stripe'),
  1, 'the payment is audited');

-- 14-15. Stripe retries are no-ops -----------------------------------------------------
create temporary table repeat_call on commit drop as
select * from public.record_stripe_checkout_order(
  'cs_test_stripeorder0000001', 'pi_test_1', 'GD-TESTORDR', 'buyer@example.com', '3331234567',
  '{"name":"Mario Rossi","address":"Via Roma 1"}',
  '[{"slug":"stripe-stock","name":"Stripe stock","quantity":2,"unit_price_cents":3000}]', 490, null);
select results_eq($$select order_id, created from repeat_call$$, $$select order_id, false from first_call$$,
  'a repeated delivery returns the same order without creating another');
select is((select stock_quantity from public.products where sku = 'STRIPE-STOCK'), 6, 'a repeated delivery never takes stock twice');

-- 16-18. Selling past the last piece keeps the payment and flags it ------------------------
create temporary table oversold_call on commit drop as
select * from public.record_stripe_checkout_order(
  'cs_test_stripeorder0000002', 'pi_test_2', 'GD-TESTORDR', 'late@example.com', null,
  '{"name":"Luca Bianchi","address":"Via Milano 2"}',
  '[{"slug":"stripe-last","name":"Stripe last piece","quantity":2,"unit_price_cents":2000}]', 490, null);
select is((select order_number from oversold_call), 'GD-TESTORDR-2', 'a reused reference gets a suffixed order number');
select is((select stock_quantity from public.products where sku = 'STRIPE-LAST'), 0, 'stock never goes below zero');
select is((select count(*)::int from public.order_notes where order_id = (select order_id from oversold_call) and note like 'Attenzione%'),
  1, 'an oversold order carries a note for the owner');

-- 19-20. Malformed payloads are refused before anything is written ------------------------
select throws_ok(
  $$select * from public.record_stripe_checkout_order('not-a-session', null, 'GD-X', 'a@b.it', null, '{}', '[{"slug":"stripe-stock","name":"x","quantity":1,"unit_price_cents":3000}]', 0, null)$$,
  '22023', 'GD_STRIPE_ORDER_INVALID_PAYLOAD', 'an invalid session id is refused');
select throws_ok(
  $$select * from public.record_stripe_checkout_order('cs_test_stripeorder0000003', null, 'GD-X', 'a@b.it', null, '{}', '[{"slug":"stripe-stock","name":"x","quantity":0,"unit_price_cents":3000}]', 0, null)$$,
  '22023', 'GD_STRIPE_ORDER_INVALID_PAYLOAD', 'a zero quantity is refused');

select * from finish();
rollback;
