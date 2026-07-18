begin;
select plan(10);

select has_function('public','save_promotion_with_targets',array['jsonb','bigint[]','bigint[]','bigint[]'],'atomic promotion save exists');
select has_function('public','save_coupon_with_targets',array['jsonb','bigint[]','bigint[]','bigint[]'],'atomic coupon save exists');
select has_function('public','duplicate_coupon_with_targets',array['bigint'],'atomic coupon duplication exists');
select ok(not has_function_privilege('anon','public.save_promotion_with_targets(jsonb,bigint[],bigint[],bigint[])','EXECUTE'),'anonymous cannot save promotions');
select ok(not has_function_privilege('anon','public.save_coupon_with_targets(jsonb,bigint[],bigint[],bigint[])','EXECUTE'),'anonymous cannot save coupons');

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
values('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000002101','authenticated','authenticated','atomic-admin@example.com','',now(),'{}','{}',now(),now(),'','','','');
insert into public.staff_profiles(user_id,role,display_name)
values('00000000-0000-0000-0000-000000002101','admin','Atomic Admin');
insert into public.categories(slug,name,tagline,description,active,publication_status,published_at)
values('atomic-cat','Atomic','Atomic','Atomic',true,'published',now());
insert into public.products(category_id,slug,sku,name,tagline,description,price_cents,publication_status,active,stock_quantity)
values((select id from public.categories where slug='atomic-cat'),'atomic-product','atomic-product','Atomic product','Atomic','Atomic',1000,'published',true,10);
insert into public.promotions(name,discount_kind,discount_value,active)
values('Atomic promotion','fixed',100,true);
insert into public.promotion_products(promotion_id,product_id)
values((select id from public.promotions where name='Atomic promotion'),(select id from public.products where sku='atomic-product'));
insert into public.coupons(code,discount_kind,discount_value,active)
values('ATOMIC','fixed',100,true);
insert into public.coupon_products(coupon_id,product_id)
values((select id from public.coupons where code='ATOMIC'),(select id from public.products where sku='atomic-product'));

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000002101',true);
set local role authenticated;
select throws_ok(
  $$select public.save_promotion_with_targets(
    jsonb_build_object('id',(select id from public.promotions where name='Atomic promotion'),'name','Changed','description',null,'discount_kind','fixed','discount_value',200,'minimum_subtotal_cents',0,'minimum_quantity',1,'priority',0,'stackable',false,'starts_at',null,'ends_at',null,'active',true),
    array[9223372036854770000]::bigint[],array[]::bigint[],array[]::bigint[])$$,
  '23503','GD_PROMOTION_TARGET_NOT_FOUND','invalid promotion target rolls back the entire save');
select throws_ok(
  $$select public.save_coupon_with_targets(
    jsonb_build_object('id',(select id from public.coupons where code='ATOMIC'),'code','CHANGED','discount_kind','fixed','discount_value',200,'free_shipping',false,'minimum_subtotal_cents',0,'maximum_discount_cents',null,'usage_limit',null,'per_customer_limit',null,'first_purchase_only',false,'starts_at',null,'expires_at',null,'active',true),
    array[9223372036854770000]::bigint[],array[]::bigint[],array[]::bigint[])$$,
  '23503','GD_COUPON_TARGET_NOT_FOUND','invalid coupon target rolls back the entire save');
reset role;

select results_eq(
  $$select name,count(promotion_products.product_id)::bigint from public.promotions join public.promotion_products on promotion_products.promotion_id=promotions.id where name='Atomic promotion' group by name$$,
  $$values('Atomic promotion'::text,1::bigint)$$,
  'failed promotion save preserves parent and targets');
select results_eq(
  $$select code,count(coupon_products.product_id)::bigint from public.coupons join public.coupon_products on coupon_products.coupon_id=coupons.id where code='ATOMIC' group by code$$,
  $$values('ATOMIC'::text,1::bigint)$$,
  'failed coupon save preserves parent and targets');
select throws_ok(
  $$select public.create_order('disabled@example.com',null,'{}','{}','[]',null,null,'00000000-0000-0000-0000-000000002199')$$,
  '55000','GD_ORDER_INTAKE_DISABLED','disabled order intake rejects privileged callers too');

select * from finish();
rollback;
