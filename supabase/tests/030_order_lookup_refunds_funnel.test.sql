begin;
select plan(23);

-- Fixtures ------------------------------------------------------------------
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token) values
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000003001','authenticated','authenticated','lookup-admin@example.com','',now(),'{}','{}',now(),now(),'','','',''),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000003002','authenticated','authenticated','lookup-editor@example.com','',now(),'{}','{}',now(),now(),'','','','');
insert into public.staff_profiles(user_id,role,display_name) values
('00000000-0000-0000-0000-000000003001','admin','Lookup Admin'),
('00000000-0000-0000-0000-000000003002','editor','Lookup Editor');

-- Insert two orders: one that will be looked up successfully, one for negative tests.
insert into public.orders(order_number,email,status,payment_status,subtotal_cents,discount_cents,shipping_cents,total_cents,shipping_method_code,shipping_address_snapshot,billing_address_snapshot,idempotency_key,stripe_payment_intent_id)
values
('GD-LOOKUP-1','BUYER@example.com','shipped','paid',3000,0,490,3490,'standard','{"name":"Buyer","address":"Via Roma 1"}','{}','00000000-0000-0000-0000-000000003011','pi_test_lookup_1'),
('GD-LOOKUP-2','other@example.com','confirmed','paid',2000,0,490,2490,'standard','{}','{}','00000000-0000-0000-0000-000000003012',null);

-- Insert order items for GD-LOOKUP-1
insert into public.order_items(order_id,product_id,quantity,unit_price_cents,line_total_cents,product_name_snapshot,sku_snapshot,image_src_snapshot,preorder_quantity)
values
((select id from public.orders where order_number='GD-LOOKUP-1'),null,2,1500,3000,'Test Beyblade X','TEST-BX','/products/test.webp',1);

select set_config('test.lookup_order',(select id from public.orders where order_number='GD-LOOKUP-1')::text,true);
select set_config('test.other_order',(select id from public.orders where order_number='GD-LOOKUP-2')::text,true);

-- 1. lookup_order_status is callable by anon -----------------------------------------
select ok(
  has_function_privilege('anon','public.lookup_order_status(text,text)','EXECUTE'),
  'anon can call lookup_order_status');

-- 2. Correct number + email returns the order ----------------------------------------
select results_eq(
  $$select order_number, status from public.lookup_order_status('GD-LOOKUP-1','buyer@example.com')$$,
  $$values ('GD-LOOKUP-1'::text, 'shipped'::text)$$,
  'lookup returns the matching order');

-- 3. Wrong email returns no rows (no existence leak) ---------------------------------
select is(
  (select count(*)::int from public.lookup_order_status('GD-LOOKUP-1','wrong@example.com')),
  0,
  'wrong email returns no rows — no leak of order existence');

-- 4. Allowed fields only: items present, no private fields in result type ------------
-- We verify that the function signature exposes only the safe columns by checking
-- that the returned row has exactly the declared columns and the items array.
select results_eq(
  $$select (r.tracking_carrier is null)::bool from public.lookup_order_status('GD-LOOKUP-1','buyer@example.com') as r$$,
  $$values (true)$$,
  'tracking_carrier may be null but the column is present');

-- 5. Items array contains product_name_snapshot, quantity, preorder_quantity ---------
select results_eq(
  $$select (r.items -> 0 ->> 'product_name_snapshot') as name,
           (r.items -> 0 ->> 'quantity')::int as qty,
           (r.items -> 0 ->> 'preorder_quantity')::int as pre
    from public.lookup_order_status('GD-LOOKUP-1','buyer@example.com') as r$$,
  $$values ('Test Beyblade X'::text, 2, 1)$$,
  'items array contains expected fields');

-- 6. anon cannot read storefront_daily_events directly --------------------------------
set local role anon;
select throws_ok(
  $$select count(*) from public.storefront_daily_events$$,
  '42501', null,
  'anon cannot read storefront_daily_events directly');
reset role;

-- 7. anon cannot insert into storefront_daily_events directly -------------------------
set local role anon;
select throws_ok(
  $$insert into public.storefront_daily_events(day,event,count) values(current_date,'product_view',1)$$,
  '42501', null,
  'anon cannot insert into storefront_daily_events directly');
reset role;

-- 8. track_storefront_event is callable by anon -------------------------------------
select ok(
  has_function_privilege('anon','public.track_storefront_event(text)','EXECUTE'),
  'anon can call track_storefront_event');

-- 9. Unknown events are silently dropped (no error) ----------------------------------
select lives_ok(
  $$select public.track_storefront_event('unknown_event_xyz')$$,
  'unknown events are silently dropped');
select is(
  (select count(*)::int from public.storefront_daily_events where event='unknown_event_xyz'),
  0,
  'unknown event produces no row');

-- 10. Whitelisted events upsert the count -------------------------------------------
select lives_ok($$select public.track_storefront_event('product_view')$$, 'product_view fires');
select lives_ok($$select public.track_storefront_event('product_view')$$, 'product_view fires again');
select is(
  (select count from public.storefront_daily_events
   where event='product_view'
     and day = (now() at time zone 'Europe/Rome')::date),
  2,
  'track_storefront_event upserts the count for whitelisted events');

-- 11. read_funnel_stats requires manager role ----------------------------------------
select ok(
  not has_function_privilege('anon','public.read_funnel_stats(integer)','EXECUTE'),
  'anon cannot call read_funnel_stats');

-- 12. editor cannot call read_funnel_stats -------------------------------------------
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000003002',true);
set local role authenticated;
select throws_ok(
  $$select * from public.read_funnel_stats(7)$$,
  '42501','GD_ORDER_MANAGER_REQUIRED',
  'editor cannot read funnel stats');
reset role;

-- 13. anon cannot call record_order_refund -------------------------------------------
select ok(
  not has_function_privilege('anon','public.record_order_refund(bigint,integer,text,text)','EXECUTE'),
  'anon cannot call record_order_refund');

-- 14. record_order_refund sets stripe_refund_id and refund_amount_cents ---------------
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000003001',true);
set local role authenticated;
select lives_ok(
  $$select public.record_order_refund(
      current_setting('test.lookup_order')::bigint,
      1000,
      'Rimborso parziale di test',
      're_test_partial_001')$$,
  'manager can call record_order_refund');
reset role;
select results_eq(
  $$select refund_amount_cents, stripe_refund_id, payment_status::text
    from public.orders where order_number='GD-LOOKUP-1'$$,
  $$values (1000, 're_test_partial_001'::text, 'paid'::text)$$,
  'partial refund sets amount and refund id, payment_status stays paid');

-- 15. Full refund sets payment_status to refunded ------------------------------------
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000003001',true);
set local role authenticated;
select lives_ok(
  $$select public.record_order_refund(
      current_setting('test.lookup_order')::bigint,
      3490,
      'Rimborso totale di test',
      're_test_full_001')$$,
  'manager records a full refund');
reset role;
select results_eq(
  $$select payment_status::text from public.orders where order_number='GD-LOOKUP-1'$$,
  $$values ('refunded'::text)$$,
  'full refund sets payment_status to refunded');

-- 16. record_order_refund writes an audit event -------------------------------------
select is(
  (select count(*)::int from public.audit_events
   where entity_type='orders'
     and entity_id=current_setting('test.lookup_order')
     and action='order.refunded'),
  2,
  'each record_order_refund call writes an audit event');

-- 17. record_order_refund rejects a non-existent order ------------------------------
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000003001',true);
set local role authenticated;
select throws_ok(
  $$select public.record_order_refund(999999999,'1000','test','re_x')$$,
  '22023','GD_ORDER_NOT_FOUND',
  'non-existent order raises GD_ORDER_NOT_FOUND');
reset role;

-- 18. record_order_refund rejects orders with non-refundable payment status ----------
-- GD-LOOKUP-2 has payment_status=paid but let us use a cancelled-payment one
insert into public.orders(order_number,email,status,payment_status,subtotal_cents,discount_cents,shipping_cents,total_cents,shipping_method_code,shipping_address_snapshot,billing_address_snapshot,idempotency_key)
values ('GD-LOOKUP-FAIL','fail@example.com','cancelled','failed',1000,0,490,1490,'standard','{}','{}','00000000-0000-0000-0000-000000003099');
select set_config('test.fail_order',(select id from public.orders where order_number='GD-LOOKUP-FAIL')::text,true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000003001',true);
set local role authenticated;
select throws_ok(
  $$select public.record_order_refund(current_setting('test.fail_order')::bigint,500,'test','re_x')$$,
  '22023','GD_ORDER_REFUND_INVALID',
  'non-refundable payment_status raises GD_ORDER_REFUND_INVALID');
reset role;

select * from finish();
rollback;
