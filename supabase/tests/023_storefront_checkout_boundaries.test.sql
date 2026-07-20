begin;
select plan(28);

-- Fixtures ------------------------------------------------------------------
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token) values
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000002301','authenticated','authenticated','buyer-one@example.com','',now(),'{}','{}',now(),now(),'','','',''),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000002302','authenticated','authenticated','buyer-two@example.com','',now(),'{}','{}',now(),now(),'','','',''),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000002303','authenticated','authenticated','checkout-admin@example.com','',now(),'{}','{}',now(),now(),'','','','');
insert into public.staff_profiles(user_id,role,display_name) values
('00000000-0000-0000-0000-000000002303','admin','Checkout Admin');

insert into public.categories(slug,name,tagline,description,active,publication_status,published_at)
values('checkout-cat','Checkout','Checkout','Checkout',true,'published',now());
insert into public.products(category_id,slug,sku,name,tagline,description,price_cents,publication_status,active,stock_quantity)
values((select id from public.categories where slug='checkout-cat'),'checkout-product','checkout-product','Checkout product','Checkout','Checkout',1000,'published',true,20);
insert into public.products(category_id,slug,sku,name,tagline,description,price_cents,publication_status,active,stock_quantity,availability_override,preorder_allocation)
values((select id from public.categories where slug='checkout-cat'),'checkout-preorder','checkout-preorder','Checkout preorder','Checkout','Checkout',2000,'published',true,0,'preorder',1);
insert into public.shipping_methods(code,name,price_cents,active) values('checkout-standard','Standard',500,true);
update public.site_settings set accept_orders=true where singleton;

-- 1-8. The intake boundary ---------------------------------------------------
-- Guests and signed-in customers reach order intake; nothing else does, and no caller
-- can name the customer.
select ok(has_function_privilege('anon','public.create_order(text,text,jsonb,jsonb,jsonb,text,text,uuid)','EXECUTE'),
  'guests may create orders through the validating wrapper');
select ok(has_function_privilege('authenticated','public.create_order(text,text,jsonb,jsonb,jsonb,text,text,uuid)','EXECUTE'),
  'signed-in customers may create orders through the validating wrapper');
select ok(not has_function_privilege('service_role','public.create_order(text,text,jsonb,jsonb,jsonb,text,text,uuid)','EXECUTE'),
  'no service-role path can create an order without a request identity');
select ok(not has_function_privilege('anon','private.create_order_unchecked(text,text,jsonb,jsonb,jsonb,text,text,uuid)','EXECUTE'),
  'anon cannot bypass the wrapper');
select ok(not has_function_privilege('authenticated','private.create_order_unchecked(text,text,jsonb,jsonb,jsonb,text,text,uuid)','EXECUTE'),
  'authenticated cannot bypass the wrapper');
select ok(not has_table_privilege('anon','public.orders','INSERT'),
  'anon cannot write orders directly');
select ok(not has_table_privilege('authenticated','public.orders','INSERT'),
  'authenticated cannot write orders directly');
select ok(
  pg_get_function_arguments('public.create_order(text,text,jsonb,jsonb,jsonb,text,text,uuid)'::regprocedure) not like '%customer%',
  'the intake signature exposes no customer parameter to forge');

-- 9-10. Guest order ----------------------------------------------------------
select set_config('request.jwt.claim.sub','',true);
set local role anon;
select lives_ok(
  $$select public.create_order('guest-checkout@example.com','+39 333 1234567','{"recipient":"Guest"}','{"recipient":"Guest"}',jsonb_build_array(jsonb_build_object('product_id',(select id from public.products where sku='checkout-product'),'quantity',2)),null,'checkout-standard','00000000-0000-0000-0000-000000002391')$$,
  'a guest places an order as anon');
reset role;
select results_eq(
  $$select customer_id from public.orders where email='guest-checkout@example.com'$$,
  $$select null::uuid$$,
  'a guest order is recorded with no customer');

-- 11-12. Authenticated order -------------------------------------------------
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000002301',true);
set local role authenticated;
select lives_ok(
  $$select public.create_order('buyer-one@example.com','+39 333 1234567','{"recipient":"Buyer One"}','{"recipient":"Buyer One"}',jsonb_build_array(jsonb_build_object('product_id',(select id from public.products where sku='checkout-product'),'quantity',1)),null,'checkout-standard','00000000-0000-0000-0000-000000002392')$$,
  'a signed-in customer places an order as authenticated');
reset role;
select results_eq(
  $$select customer_id from public.orders where email='buyer-one@example.com'$$,
  $$select '00000000-0000-0000-0000-000000002301'::uuid$$,
  'the order is attributed to the authenticated user, not to the caller-supplied payload');

-- 13-15. Who may read that order ---------------------------------------------
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000002302',true);
set local role authenticated;
select is_empty(
  $$select id from public.orders where email='buyer-one@example.com'$$,
  'another customer cannot read the order');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000002301',true);
set local role authenticated;
select results_eq(
  $$select count(*)::bigint from public.orders where email='buyer-one@example.com'$$,
  array[1::bigint],
  'the owner reads their own order');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000002303',true);
set local role authenticated;
select results_eq(
  $$select count(*)::bigint from public.orders where email='buyer-one@example.com'$$,
  array[1::bigint],
  'an order manager reads it under the existing matrix');
reset role;
select set_config('request.jwt.claim.sub','',true);

-- 16-20. The last preorder unit is sellable ----------------------------------
select lives_ok(
  $$select public.create_order('preorder-buyer@example.com',null,'{}','{}',jsonb_build_array(jsonb_build_object('product_id',(select id from public.products where sku='checkout-preorder'),'quantity',1)),null,'checkout-standard','00000000-0000-0000-0000-000000002393')$$,
  'the final allocated preorder unit can be bought');
select results_eq(
  $$select preorder_allocation from public.products where sku='checkout-preorder'$$,
  array[0],
  'allocation reaches zero instead of violating a constraint');
select throws_ok(
  $$select public.create_order('preorder-late@example.com',null,'{}','{}',jsonb_build_array(jsonb_build_object('product_id',(select id from public.products where sku='checkout-preorder'),'quantity',1)),null,'checkout-standard','00000000-0000-0000-0000-000000002394')$$,
  'P0001','GD_PRICING_PRODUCT_UNAVAILABLE',
  'an exhausted preorder is refused with a domain error');
select results_eq(
  $$select preorder_allocation from public.products where sku='checkout-preorder'$$,
  array[0],
  'the refused order leaves the allocation non-negative');
select results_eq(
  $$select count(*)::bigint from public.orders where email='preorder-buyer@example.com'$$,
  array[1::bigint],
  'the refused order does not roll back the one that succeeded');

-- 21-27. Payload validation surfaces domain codes ----------------------------
select throws_ok(
  $$select public.create_order('bad@example.com',null,'{}','{}',jsonb_build_array(jsonb_build_object('product_id',(select id from public.products where sku='checkout-product'),'quantity',0)),null,'checkout-standard','00000000-0000-0000-0000-000000002395')$$,
  '22023','GD_ORDER_INVALID_QUANTITY','quantity zero is refused');
select throws_ok(
  $$select public.create_order('bad@example.com',null,'{}','{}',jsonb_build_array(jsonb_build_object('product_id',(select id from public.products where sku='checkout-product'),'quantity',-1)),null,'checkout-standard','00000000-0000-0000-0000-000000002396')$$,
  '22023','GD_ORDER_INVALID_QUANTITY','negative quantity is refused');
select throws_ok(
  $$select public.create_order('bad@example.com',null,'{}','{}',jsonb_build_array(jsonb_build_object('product_id',(select id from public.products where sku='checkout-product'),'quantity',1.5)),null,'checkout-standard','00000000-0000-0000-0000-000000002397')$$,
  '22023','GD_ORDER_INVALID_QUANTITY','fractional quantity is refused before any cast');
select throws_ok(
  $$select public.create_order('bad@example.com',null,'{}','{}',jsonb_build_array(jsonb_build_object('product_id',(select id from public.products where sku='checkout-product'),'quantity',11)),null,'checkout-standard','00000000-0000-0000-0000-000000002398')$$,
  '22023','GD_ORDER_QUANTITY_LIMIT','quantity above the configured maximum is refused');
select throws_ok(
  $$select public.create_order('bad@example.com',null,'{}','{}','[]',null,'checkout-standard','00000000-0000-0000-0000-000000002399')$$,
  '22023','GD_ORDER_INVALID_PAYLOAD','an empty cart is refused');
select throws_ok(
  $$select public.create_order('bad@example.com',null,'{}','{}','[{"product_id":0,"quantity":1}]',null,'checkout-standard','00000000-0000-0000-0000-000000002390')$$,
  '22023','GD_ORDER_INVALID_PAYLOAD','a non-positive product id is refused');
select throws_ok(
  $$select public.create_order('bad@example.com',null,'{}','{}','[{"product_id":1,"quantity":"2"}]',null,'checkout-standard','00000000-0000-0000-0000-000000002389')$$,
  '22023','GD_ORDER_INVALID_PAYLOAD','a non-numeric quantity is refused');

select results_eq(
  $$select count(*)::bigint from public.orders where email='bad@example.com'$$,
  array[0::bigint],
  'no rejected payload leaves a partial order');

select * from finish();
rollback;
