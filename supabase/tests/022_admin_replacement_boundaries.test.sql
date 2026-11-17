begin;
-- Organization compatibility for fixtures written before organizations existed (see
-- supabase/tests/044). Inside this rolled-back transaction every organization-scoped table
-- defaults to Gear Drop, and every staff profile is mirrored as a Gear Drop member with the
-- same role and state. Company isolation itself is tested without these shortcuts in 041-044.
do $legacy_organization$
declare
  geardrop bigint := (select id from public.organizations where slug = 'geardrop');
  target text;
begin
  for target in
    select c.table_name
    from information_schema.columns as c
    join information_schema.tables as t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'organization_id'
      and t.table_type = 'BASE TABLE' and c.table_name <> 'organization_members'
  loop
    execute format('alter table public.%I alter column organization_id set default %s', target, geardrop);
  end loop;
end
$legacy_organization$;
create function private.legacy_mirror_staff_membership() returns trigger language plpgsql set search_path = '' as $legacy_mirror$
begin
  insert into public.organization_members (organization_id, user_id, role, active)
  values ((select id from public.organizations where slug = 'geardrop'), new.user_id, new.role, new.active)
  on conflict (organization_id, user_id) do update set role = excluded.role, active = excluded.active;
  return new;
end
$legacy_mirror$;
create trigger legacy_mirror_staff_membership after insert or update of role, active on public.staff_profiles
  for each row execute function private.legacy_mirror_staff_membership();
select plan(20);

select has_column('public','inventory_movements','balance_kind','inventory ledger identifies its balance');
select has_column('public','inventory_movements','balance_after','inventory ledger stores the affected balance');
select has_function('public','save_footer_configuration',array['bigint', 'jsonb'],'atomic footer replacement exists');
select has_function('public','set_manual_order_enablement_check',array['bigint', 'text','enablement_check_status','text'],'manual enablement verification exists');
select has_function('public','update_product_image_metadata',array['bigint','bigint','text','boolean','boolean'],'atomic product image metadata update exists');
select ok(not has_function_privilege('anon','public.save_footer_configuration(bigint,jsonb)','EXECUTE'),'anonymous cannot replace footer');

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token) values
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000002201','authenticated','authenticated','replacement-owner@example.com','',now(),'{}','{}',now(),now(),'','','',''),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000002202','authenticated','authenticated','replacement-editor@example.com','',now(),'{}','{}',now(),now(),'','','','');
insert into public.staff_profiles(user_id,role,display_name) values
('00000000-0000-0000-0000-000000002201','owner','Replacement Owner'),
('00000000-0000-0000-0000-000000002202','editor','Replacement Editor');

delete from public.footer_columns;
insert into public.footer_columns(column_key,title,publication_status,active,sort_order)
values('preserved','Preserved','draft',false,0);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000002202',true);
set local role authenticated;
select throws_ok(
  $$select public.save_footer_configuration((select id from public.organizations where slug = 'geardrop'), '{"columns":[{"key":"duplicate","title":"One","publication_status":"draft","active":false,"items":[]},{"key":"duplicate","title":"Two","publication_status":"draft","active":false,"items":[]}],"social_links":[]}'::jsonb)$$,
  '23505',null,'invalid footer replacement rolls back atomically');
reset role;
select results_eq($$select column_key from public.footer_columns$$,array['preserved'::text],'failed replacement preserves prior footer');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000002202',true);
set local role authenticated;
select throws_ok(
  $$select public.set_manual_order_enablement_check((select id from public.organizations where slug = 'geardrop'), 'payments','passed','Editor evidence')$$,
  '42501','GD_ORDER_OWNER_REQUIRED','editor cannot verify payment readiness');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000002201',true);
set local role authenticated;
select lives_ok(
  $$select public.set_manual_order_enablement_check((select id from public.organizations where slug = 'geardrop'), 'payments','passed','Sandbox payment round trip verified')$$,
  'owner records payment readiness');
select lives_ok(
  $$select public.set_manual_order_enablement_check((select id from public.organizations where slug = 'geardrop'), 'owners','passed','Two confirmed owner profiles verified')$$,
  'owner can complete a seeded operational check');
select throws_ok(
  $$select public.set_manual_order_enablement_check((select id from public.organizations where slug = 'geardrop'), 'store_identity','passed','Must be machine checked')$$,
  '22023','GD_ORDER_CHECK_INVALID','machine checks cannot be manually overridden');
reset role;
select results_eq(
  $$select status::text,evidence from public.order_enablement_checks where key='payments' and organization_id = (select id from public.organizations where slug = 'geardrop')$$,
  $$values('passed'::text,'Sandbox payment round trip verified'::text)$$,
  'manual readiness evidence persists');
select ok(
  pg_get_functiondef('public.create_order(text,text,jsonb,jsonb,jsonb,text,text,uuid)'::regprocedure) ilike '%for share%',
  'order intake locks the acceptance singleton against concurrent disable');
select ok(
  pg_get_functiondef('public.cancel_order_and_restore_stock(bigint,text)'::regprocedure) like '%geardrop.preorder_movement_managed%'
  and pg_get_functiondef('private.record_staff_preorder_allocation_change()'::regprocedure) like '%geardrop.preorder_movement_managed%',
  'preorder cancellation suppresses only the duplicate automatic movement');

insert into public.categories(slug,name,tagline,description,active,publication_status,published_at)
values('ledger-cat','Ledger','Ledger','Ledger',true,'published',now());
insert into public.products(category_id,slug,sku,name,tagline,description,price_cents,publication_status,active,stock_quantity,availability_override,preorder_allocation)
values((select id from public.categories where slug='ledger-cat'),'ledger-preorder','ledger-preorder','Ledger preorder','Ledger','Ledger',1000,'published',true,0,'preorder',5);
insert into public.shipping_methods(code,name,price_cents,active) values('ledger-shipping','Ledger',0,true);
insert into public.orders(order_number,email,status,payment_status,subtotal_cents,discount_cents,shipping_cents,total_cents,shipping_method_code,shipping_address_snapshot,billing_address_snapshot,idempotency_key)
values('GD-LEDGER','ledger@example.com','pending','pending',1000,0,0,1000,'ledger-shipping','{}','{}','00000000-0000-0000-0000-000000002299');
insert into public.order_items(order_id,product_id,quantity,unit_price_cents,line_total_cents,product_name_snapshot,sku_snapshot,image_src_snapshot,reservation_kind)
values((select id from public.orders where order_number='GD-LEDGER'),(select id from public.products where sku='ledger-preorder'),2,1000,2000,'Ledger preorder','ledger-preorder','','preorder');
update public.products set preorder_allocation=3 where sku='ledger-preorder';
insert into public.inventory_movements(product_id,delta,stock_after,reason,order_id,note)
values((select id from public.products where sku='ledger-preorder'),-2,0,'order_reserved',(select id from public.orders where order_number='GD-LEDGER'),'Reserve preorder');
select results_eq(
  $$select balance_kind from public.inventory_movements where note='Reserve preorder'$$,
  array['preorder'::text],'preorder movement is explicit');
select results_eq(
  $$select balance_after from public.inventory_movements where note='Reserve preorder'$$,
  array[3],'preorder movement records preorder allocation after mutation');
select results_eq(
  $$select stock_after from public.inventory_movements where note='Reserve preorder'$$,
  array[0],'preorder movement still records physical stock separately');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000002201',true);
set local role authenticated;
select lives_ok(
  $$update public.products set preorder_allocation=4 where sku='ledger-preorder'$$,
  'staff preorder edit is recorded atomically');
reset role;
select results_eq(
  $$select count(*)::bigint from public.inventory_movements where note='Allocazione preordine aggiornata' and delta=1 and balance_after=4$$,
  array[1::bigint],
  'staff preorder movement stores exact delta and resulting allocation');

select * from finish();
rollback;
