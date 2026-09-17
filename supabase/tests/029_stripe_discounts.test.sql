begin;
select plan(10);

-- Fixtures ------------------------------------------------------------------
insert into public.categories(slug,name,tagline,description,active,publication_status,published_at)
values('discount-order-cat','Discount','Discount','Discount',true,'published',now());
insert into public.products(category_id,slug,sku,name,tagline,description,price_cents,publication_status,active,stock_quantity)
values((select id from public.categories where slug='discount-order-cat'),'discount-pack','DISCOUNT-PACK','Discount pack','D','D',3000,'published',true,10);

-- 1-4. Only the server's secret key can record a discounted order ----------------------
select ok(has_function_privilege('service_role','public.record_stripe_checkout_order(text,text,text,text,text,jsonb,jsonb,integer,text,integer,text)','EXECUTE'),
  'the webhook may record a discounted paid order');
select ok(not has_function_privilege('anon','public.record_stripe_checkout_order(text,text,text,text,text,jsonb,jsonb,integer,text,integer,text)','EXECUTE'),
  'guests cannot record a discounted order');
select ok(not has_function_privilege('authenticated','public.record_stripe_checkout_order(text,text,text,text,text,jsonb,jsonb,integer,text,integer,text)','EXECUTE'),
  'signed-in customers cannot record a discounted order');
select ok((select prosecdef from pg_proc where oid='public.record_stripe_checkout_order(text,text,text,text,text,jsonb,jsonb,integer,text,integer,text)'::regprocedure),
  'recording runs as security definer');

-- 5-7. A promo-code discount is recorded and totalled correctly -----------------------
create temporary table discount_call on commit drop as
select * from public.record_stripe_checkout_order(
  'cs_test_discountorder00001', 'pi_test_disc', 'GD-DISCOUNT', 'promo@example.com', '3330000000',
  '{"name":"Promo Buyer","address":"Via Promo 1"}',
  '[{"slug":"discount-pack","name":"Discount pack","quantity":2,"unit_price_cents":3000}]',
  490, null, 500, 'SUMMER10');

select results_eq(
  $$select discount_cents, coupon_code, total_cents
    from public.orders where stripe_checkout_session_id = 'cs_test_discountorder00001'$$,
  $$values (500, 'SUMMER10', 5990)$$,
  'discount_cents, coupon_code and total_cents (subtotal-discount+shipping) are stored');

select is((select coupon_code from public.orders where stripe_checkout_session_id = 'cs_test_discountorder00001'),
  'SUMMER10', 'the promotion code text is saved on the order');

select is(
  (select (after_state ->> 'discount_cents')::int from public.audit_events
    where entity_type = 'orders' and entity_id = (select order_id from discount_call)::text
    and action = 'order.paid_on_stripe'),
  500, 'the discount is included in the audit after_state');

-- 8. Discount clamped to subtotal: total_cents never goes below shipping --------------------
create temporary table capped_call on commit drop as
select * from public.record_stripe_checkout_order(
  'cs_test_discountorder00002', null, 'GD-CAPPED', 'capped@example.com', null,
  '{"name":"Cap","address":"Via Cap 1"}',
  '[{"slug":"discount-pack","name":"Discount pack","quantity":1,"unit_price_cents":3000}]',
  490, null, 9999, 'HUGE');

select results_eq(
  $$select discount_cents, total_cents from public.orders where stripe_checkout_session_id = 'cs_test_discountorder00002'$$,
  $$values (3000, 490)$$,
  'a discount larger than the subtotal is clamped: total = shipping only');

-- 9. A negative discount is refused ---------------------------------------------------
select throws_ok(
  $$select * from public.record_stripe_checkout_order('cs_test_discountorder00003', null, 'GD-NEG', 'neg@example.com', null,
    '{"name":"N","address":"A"}', '[{"slug":"discount-pack","name":"Discount pack","quantity":1,"unit_price_cents":3000}]',
    0, null, -1, null)$$,
  '22023', 'GD_STRIPE_ORDER_INVALID_PAYLOAD', 'a negative discount is refused');

-- 10. No discount (default 0) leaves total unchanged -----------------------------------
create temporary table nodiscount_call on commit drop as
select * from public.record_stripe_checkout_order(
  'cs_test_discountorder00004', null, 'GD-NODISC', 'nodisc@example.com', null,
  '{"name":"Plain","address":"Via Plain 1"}',
  '[{"slug":"discount-pack","name":"Discount pack","quantity":1,"unit_price_cents":3000}]',
  490, null);

select results_eq(
  $$select discount_cents, coupon_code, total_cents from public.orders where stripe_checkout_session_id = 'cs_test_discountorder00004'$$,
  $$values (0, null::text, 3490)$$,
  'an order without a discount defaults to zero discount and full total');

select * from finish();
rollback;
