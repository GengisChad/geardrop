begin;
select plan(32);

select results_eq(
  $$select enumlabel::text collate "C" from pg_enum join pg_type on pg_type.oid=pg_enum.enumtypid
    where pg_type.typnamespace='public'::regnamespace and pg_type.typname='promotion_discount_kind' order by enumsortorder$$,
  $$values ('percentage'::text collate "C"),('fixed'),('promotional_price')$$,
  'promotion discount kinds are exact'
);
select results_eq(
  $$select count(*)::bigint from information_schema.tables where table_schema='public' and table_name in (
    'promotions','promotion_products','promotion_categories','promotion_bundles','coupon_products','coupon_categories','coupon_bundles')$$,
  array[7::bigint], 'all promotion and coupon target tables exist'
);
select has_function('public','calculate_cart_pricing',array['jsonb','text','uuid','text'],'authoritative pricing RPC exists');
select has_column('public','coupons','free_shipping','coupons support free shipping');
select has_column('public','coupons','per_customer_limit','coupons support customer limits');
select has_column('public','coupons','first_purchase_only','coupons support first purchase');
select has_column('public','coupons','disabled_at','coupons support immediate disable');
select results_eq(
  $$select count(*)::bigint from pg_indexes where schemaname='public' and indexname='coupons_code_case_insensitive_idx'$$,
  array[1::bigint], 'coupon code has case-insensitive unique index'
);
select results_eq(
  $$select count(*)::bigint from pg_class join pg_namespace on pg_namespace.oid=pg_class.relnamespace
    where pg_namespace.nspname='public' and pg_class.relname in (
      'promotions','promotion_products','promotion_categories','promotion_bundles','coupon_products','coupon_categories','coupon_bundles')
      and pg_class.relrowsecurity$$,
  array[7::bigint], 'RLS is enabled on every new table'
);
select results_eq(
  $$select count(*)::bigint from information_schema.triggers where event_object_schema='public'
    and event_object_table in ('promotions','promotion_products','promotion_categories','promotion_bundles','coupon_products','coupon_categories','coupon_bundles')
    and trigger_name like '%audit_admin_mutation'$$,
  array[21::bigint], 'every new row family is audited'
);

insert into auth.users (
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,
  created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token
) values
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000001401','authenticated','authenticated','pricing-admin@example.com','',now(),'{}','{}',now(),now(),'','','',''),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000001402','authenticated','authenticated','pricing-editor@example.com','',now(),'{}','{}',now(),now(),'','','',''),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000001403','authenticated','authenticated','pricing-customer@example.com','',now(),'{}','{}',now(),now(),'','','','');
insert into public.staff_profiles(user_id,role,display_name) values
  ('00000000-0000-0000-0000-000000001401','admin','Pricing Admin'),
  ('00000000-0000-0000-0000-000000001402','editor','Pricing Editor');
insert into public.customer_profiles(user_id,display_name) values
  ('00000000-0000-0000-0000-000000001403','Pricing Customer');
insert into public.categories(slug,name,tagline,description,active,publication_status,published_at) values
  ('pricing-cat','Pricing','Pricing','Pricing',true,'published',now());
insert into public.products(category_id,slug,sku,name,tagline,description,price_cents,publication_status,active,stock_quantity)
values
  ((select id from public.categories where slug='pricing-cat'),'pricing-a','pricing-a','Pricing A','A','A',1001,'published',true,20),
  ((select id from public.categories where slug='pricing-cat'),'pricing-b','pricing-b','Pricing B','B','B',2500,'published',true,20);
insert into public.shipping_methods(code,name,price_cents,free_from_cents,active) values ('pricing-standard','Standard',499,10000,true);

select results_eq(
  $$select (public.calculate_cart_pricing(
    jsonb_build_array(jsonb_build_object('product_id',(select id from public.products where sku='pricing-a'),'quantity',2,'total_cents',1),
      jsonb_build_object('product_id',(select id from public.products where sku='pricing-b'),'quantity',1,'unit_price_cents',1)),
    null,null,'pricing-standard')->>'total_cents')::bigint$$,
  array[5001::bigint], 'client prices and totals are ignored'
);
select results_eq(
  $$select jsonb_typeof(public.calculate_cart_pricing(
    jsonb_build_array(jsonb_build_object('product_id',(select id from public.products where sku='pricing-a'),'quantity',1)),
    null,null,'pricing-standard')->'total_cents')$$,
  array['number'::text], 'totals remain integer JSON numbers'
);
select throws_ok(
  $$select public.calculate_cart_pricing('[{"product_id":9223372036854770000,"quantity":1}]',null,null,'pricing-standard')$$,
  'P0001','GD_PRICING_PRODUCT_UNAVAILABLE','unknown products are rejected'
);
select throws_ok(
  $$select public.calculate_cart_pricing(jsonb_build_array(jsonb_build_object('product_id',(select id from public.products where sku='pricing-a'),'quantity',21)),null,null,'pricing-standard')$$,
  'P0001','GD_PRICING_PRODUCT_UNAVAILABLE','quantity above stock is rejected'
);

insert into public.promotions(name,discount_kind,discount_value,priority,stackable,active) values
  ('Low fixed','fixed',100,1,false,true),
  ('High percent','percentage',10,10,false,true),
  ('Expired','fixed',1000,100,false,true);
update public.promotions set ends_at=now()-interval '1 hour' where name='Expired';
select results_eq(
  $$select (public.calculate_cart_pricing(jsonb_build_array(
    jsonb_build_object('product_id',(select id from public.products where sku='pricing-a'),'quantity',2),
    jsonb_build_object('product_id',(select id from public.products where sku='pricing-b'),'quantity',1)),null,null,'pricing-standard')->>'promotion_discount_cents')::bigint$$,
  array[450::bigint], 'highest-priority non-stackable promotion wins'
);
select results_eq(
  $$select jsonb_array_length(public.calculate_cart_pricing(jsonb_build_array(
    jsonb_build_object('product_id',(select id from public.products where sku='pricing-a'),'quantity',1)),null,null,'pricing-standard')->'applied_promotion_ids')$$,
  array[1], 'expired promotions are ignored'
);

update public.promotions set active=false;
insert into public.promotions(name,discount_kind,discount_value,minimum_quantity,priority,stackable,active)
values ('Category ten','percentage',10,1,10,true,true),('Needs four','fixed',1000,4,20,true,true),('Global fixed','fixed',100,1,5,true,true);
insert into public.promotion_categories(promotion_id,category_id)
values ((select id from public.promotions where name='Category ten'),(select id from public.categories where slug='pricing-cat'));
insert into public.promotion_products(promotion_id,product_id)
values ((select id from public.promotions where name='Category ten'),(select id from public.products where sku='pricing-a'));
select results_eq(
  $$select (public.calculate_cart_pricing(jsonb_build_array(
    jsonb_build_object('product_id',(select id from public.products where sku='pricing-a'),'quantity',2),
    jsonb_build_object('product_id',(select id from public.products where sku='pricing-b'),'quantity',1)),null,null,'pricing-standard')->>'promotion_discount_cents')::bigint$$,
  array[550::bigint], 'targeted and global stackable promotions combine while quantity rule is enforced'
);
select results_eq(
  $$select jsonb_array_length(public.calculate_cart_pricing(jsonb_build_array(
    jsonb_build_object('product_id',(select id from public.products where sku='pricing-a'),'quantity',2),
    jsonb_build_object('product_id',(select id from public.products where sku='pricing-b'),'quantity',1)),null,null,'pricing-standard')->'applied_promotion_ids')$$,
  array[2], 'minimum quantity excludes ineligible promotion'
);
update public.promotions set active=false;
insert into public.promotions(name,discount_kind,discount_value,priority,active)
values ('Promo price A','promotional_price',800,50,true);
insert into public.promotion_products(promotion_id,product_id)
values ((select id from public.promotions where name='Promo price A'),(select id from public.products where sku='pricing-a'));
select results_eq(
  $$select (public.calculate_cart_pricing(jsonb_build_array(
    jsonb_build_object('product_id',(select id from public.products where sku='pricing-a'),'quantity',2)),null,null,'pricing-standard')->>'promotion_discount_cents')::bigint$$,
  array[402::bigint], 'promotional price is derived per authoritative unit price'
);

update public.promotions set active=false;
insert into public.coupons(code,discount_kind,discount_value,minimum_subtotal_cents,maximum_discount_cents,free_shipping,active)
values ('Summer','percentage',20,1000,300,true,true);
insert into public.coupon_products(coupon_id,product_id)
values ((select id from public.coupons where code='Summer'),(select id from public.products where sku='pricing-b'));
select throws_ok(
  $$insert into public.coupons(code,discount_kind,discount_value) values ('summer','fixed',100)$$,
  '23505',null,'coupon codes are unique case-insensitively'
);
select results_eq(
  $$select (public.calculate_cart_pricing(jsonb_build_array(
    jsonb_build_object('product_id',(select id from public.products where sku='pricing-a'),'quantity',2),
    jsonb_build_object('product_id',(select id from public.products where sku='pricing-b'),'quantity',1)),'sUmMeR',null,'pricing-standard')->>'coupon_discount_cents')::bigint$$,
  array[300::bigint], 'coupon lookup is case-insensitive and maximum discount is enforced'
);
select results_eq(
  $$select (public.calculate_cart_pricing(jsonb_build_array(
    jsonb_build_object('product_id',(select id from public.products where sku='pricing-a'),'quantity',2),
    jsonb_build_object('product_id',(select id from public.products where sku='pricing-b'),'quantity',1)),'summer',null,'pricing-standard')->>'shipping_cents')::bigint$$,
  array[0::bigint], 'free-shipping coupon overrides authoritative shipping price'
);
select results_eq(
  $$select (public.calculate_cart_pricing(jsonb_build_array(
    jsonb_build_object('product_id',(select id from public.products where sku='pricing-a'),'quantity',2),
    jsonb_build_object('product_id',(select id from public.products where sku='pricing-b'),'quantity',1)),'summer',null,'pricing-standard')->>'total_cents')::bigint$$,
  array[4202::bigint], 'coupon target applies only to eligible product subtotal'
);
update public.coupons set disabled_at=now() where code='Summer';
select throws_ok(
  $$select public.calculate_cart_pricing(jsonb_build_array(jsonb_build_object('product_id',(select id from public.products where sku='pricing-b'),'quantity',1)),'summer',null,'pricing-standard')$$,
  'P0001','GD_PRICING_COUPON_INVALID','disabled coupon stops immediately'
);
insert into public.coupons(code,discount_kind,discount_value,starts_at,expires_at,active)
values ('EXPIRED','fixed',100,now()-interval '2 days',now()-interval '1 day',true);
select throws_ok(
  $$select public.calculate_cart_pricing(jsonb_build_array(jsonb_build_object('product_id',(select id from public.products where sku='pricing-a'),'quantity',1)),'expired',null,'pricing-standard')$$,
  'P0001','GD_PRICING_COUPON_INVALID','expired coupon is rejected'
);
insert into public.coupons(code,discount_kind,discount_value,usage_limit,used_count,active)
values ('USEDUP','fixed',100,1,1,true);
select throws_ok(
  $$select public.calculate_cart_pricing(jsonb_build_array(jsonb_build_object('product_id',(select id from public.products where sku='pricing-a'),'quantity',1)),'usedup',null,'pricing-standard')$$,
  'P0001','GD_PRICING_COUPON_INVALID','total usage limit is enforced'
);

insert into public.orders(order_number,customer_id,email,status,payment_status,subtotal_cents,discount_cents,shipping_cents,total_cents,shipping_method_code,shipping_address_snapshot,billing_address_snapshot,idempotency_key)
values ('GD-PRICING-1','00000000-0000-0000-0000-000000001403','pricing-customer@example.com','completed','paid',1001,100,0,901,'pricing-standard','{}','{}','00000000-0000-0000-0000-000000001499');
insert into public.coupons(code,discount_kind,discount_value,per_customer_limit,first_purchase_only,active)
values ('CUSTOMERONLY','fixed',100,1,false,true),('FIRSTONLY','fixed',100,null,true,true);
insert into public.coupon_redemptions(coupon_id,order_id,customer_id,email_normalized,discount_cents)
values ((select id from public.coupons where code='CUSTOMERONLY'),(select id from public.orders where order_number='GD-PRICING-1'),'00000000-0000-0000-0000-000000001403','pricing-customer@example.com',100);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001403',true);
set local role authenticated;
select throws_ok(
  $$select public.calculate_cart_pricing(jsonb_build_array(jsonb_build_object('product_id',(select id from public.products where sku='pricing-a'),'quantity',1)),'customeronly','00000000-0000-0000-0000-000000001403','pricing-standard')$$,
  'P0001','GD_PRICING_COUPON_INVALID','per-customer coupon limit is enforced'
);
select throws_ok(
  $$select public.calculate_cart_pricing(jsonb_build_array(jsonb_build_object('product_id',(select id from public.products where sku='pricing-a'),'quantity',1)),'firstonly','00000000-0000-0000-0000-000000001403','pricing-standard')$$,
  'P0001','GD_PRICING_COUPON_INVALID','first-purchase coupon rejects existing customer order'
);
reset role;
select throws_ok(
  $$select public.calculate_cart_pricing(jsonb_build_array(jsonb_build_object('product_id',(select id from public.products where sku='pricing-a'),'quantity',1)),null,'00000000-0000-0000-0000-000000001403','pricing-standard')$$,
  '42501','GD_PRICING_CUSTOMER_MISMATCH','anonymous caller cannot impersonate a customer'
);

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001402',true);
set local role authenticated;
select throws_ok(
  $$insert into public.promotions(name,discount_kind,discount_value) values ('Editor denied','fixed',100)$$,
  '42501',null,'editor cannot manage pricing rules'
);
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001401',true);
set local role authenticated;
select lives_ok(
  $$insert into public.promotions(name,discount_kind,discount_value) values ('Admin allowed','fixed',100)$$,
  'admin can manage pricing rules'
);
reset role;
select results_eq(
  $$select count(*)::bigint from public.audit_events where entity_type='promotions' and actor_user_id='00000000-0000-0000-0000-000000001401'$$,
  array[1::bigint], 'manager promotion mutation is audited'
);

select * from finish();
rollback;
