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
select plan(14);

-- Fixtures ------------------------------------------------------------------
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token) values
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000003501','authenticated','authenticated','deliver-admin@example.com','',now(),'{}','{}',now(),now(),'','','',''),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000003502','authenticated','authenticated','deliver-editor@example.com','',now(),'{}','{}',now(),now(),'','','','');
insert into public.staff_profiles(user_id,role,display_name) values
('00000000-0000-0000-0000-000000003501','admin','Deliver Admin'),
('00000000-0000-0000-0000-000000003502','editor','Deliver Editor');
insert into public.orders(order_number,email,status,payment_status,subtotal_cents,discount_cents,shipping_cents,total_cents,shipping_method_code,shipping_address_snapshot,billing_address_snapshot,idempotency_key)
values
('GD-DLV-1','dlv@example.com','shipped','paid',2000,0,490,2490,'standard','{"name":"Dlv"}','{}','00000000-0000-0000-0000-000000003511'),
('GD-DLV-2','young@example.com','confirmed','paid',2000,0,490,2490,'standard','{}','{}','00000000-0000-0000-0000-000000003512');
select set_config('test.shipped_order',(select id from public.orders where order_number='GD-DLV-1')::text,true);
select set_config('test.confirmed_order',(select id from public.orders where order_number='GD-DLV-2')::text,true);

-- 1-4. Only managers confirm a delivery ------------------------------------------------
select ok(not has_function_privilege('anon','public.complete_order(bigint,text)','EXECUTE'), 'guests cannot complete orders');
select ok(not has_function_privilege('anon','public.mark_order_delivery_notified(bigint)','EXECUTE'), 'guests cannot stamp delivery emails');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000003502',true);
set local role authenticated;
select throws_ok($$select public.complete_order(current_setting('test.shipped_order')::bigint,null)$$,
  '42501','GD_ORDER_MANAGER_REQUIRED','an editor cannot confirm a delivery');
select throws_ok($$select public.mark_order_delivery_notified(current_setting('test.shipped_order')::bigint)$$,
  '42501','GD_ORDER_MANAGER_REQUIRED','an editor cannot stamp a delivery email');
reset role;

-- 5-9. A shipped order is delivered, and only a shipped one ----------------------------
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000003501',true);
set local role authenticated;
select throws_ok($$select public.complete_order(current_setting('test.confirmed_order')::bigint,null)$$,
  '22023','GD_ORDER_INVALID_TRANSITION','an order that never shipped cannot be delivered');
select throws_ok($$select public.mark_order_delivery_notified(current_setting('test.shipped_order')::bigint)$$,
  '22023','GD_ORDER_INVALID_TRANSITION','an order still in transit cannot be stamped as told');
select lives_ok($$select public.complete_order(current_setting('test.shipped_order')::bigint,'Consegnato al portiere')$$,
  'a manager confirms the delivery of a shipped order');
reset role;
select results_eq(
  $$select status::text, delivered_at is not null, delivery_notified_at is null from public.orders where order_number='GD-DLV-1'$$,
  $$values ('completed'::text, true, true)$$,
  'the order is completed and dated, with nobody told yet');
select results_eq(
  $$select from_status::text, to_status::text, note from public.order_status_events where order_id=current_setting('test.shipped_order')::bigint$$,
  $$values ('shipped'::text, 'completed'::text, 'Consegnato al portiere'::text)$$,
  'the timeline records shipped to completed once');

-- 10-11. Confirming twice is not a second delivery --------------------------------------
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000003501',true);
set local role authenticated;
select lives_ok($$select public.complete_order(current_setting('test.shipped_order')::bigint,'Riprovato')$$,
  'a completed order can be confirmed again to resend its email');
reset role;
select results_eq(
  $$select (select count(*)::int from public.order_status_events where order_id=current_setting('test.shipped_order')::bigint),
           (select count(*)::int from public.audit_events where entity_type='orders' and entity_id=current_setting('test.shipped_order') and action='order.delivered')$$,
  $$values (1, 1)$$,
  'a second confirmation adds no status event and no second audit entry');

-- 12-14. Stamping the delivery email ----------------------------------------------------
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000003501',true);
set local role authenticated;
select lives_ok($$select public.mark_order_delivery_notified(current_setting('test.shipped_order')::bigint)$$,
  'a manager stamps the delivery email');
reset role;
select is((select delivery_notified_at is not null from public.orders where order_number='GD-DLV-1'), true,
  'the order remembers its delivery email');
select is((select count(*)::int from public.audit_events where entity_type='orders' and entity_id=current_setting('test.shipped_order') and action='order.delivery_notified'), 1,
  'the audit trail records who told the buyer');

select * from finish();
rollback;
