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
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000002701','authenticated','authenticated','ship-admin@example.com','',now(),'{}','{}',now(),now(),'','','',''),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000002702','authenticated','authenticated','ship-editor@example.com','',now(),'{}','{}',now(),now(),'','','','');
insert into public.staff_profiles(user_id,role,display_name) values
('00000000-0000-0000-0000-000000002701','admin','Ship Admin'),
('00000000-0000-0000-0000-000000002702','editor','Ship Editor');
insert into public.orders(order_number,email,status,payment_status,subtotal_cents,discount_cents,shipping_cents,total_cents,shipping_method_code,shipping_address_snapshot,billing_address_snapshot,idempotency_key)
values
('GD-SHIP-1','ship@example.com','confirmed','paid',2000,0,490,2490,'standard','{"name":"Ship"}','{}','00000000-0000-0000-0000-000000002711'),
('GD-SHIP-2','pending@example.com','pending','pending',2000,0,490,2490,'standard','{}','{}','00000000-0000-0000-0000-000000002712');
select set_config('test.ship_order',(select id from public.orders where order_number='GD-SHIP-1')::text,true);
select set_config('test.pending_order',(select id from public.orders where order_number='GD-SHIP-2')::text,true);

-- 1-4. Only managers call the functions -------------------------------------------------
select ok(not has_function_privilege('anon','public.ship_order(bigint,text,text,text,text)','EXECUTE'), 'guests cannot ship orders');
select ok(not has_function_privilege('anon','public.mark_order_shipping_notified(bigint)','EXECUTE'), 'guests cannot stamp shipping emails');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000002702',true);
set local role authenticated;
select throws_ok($$select public.ship_order(current_setting('test.ship_order')::bigint,'Poste Italiane','RR123',null,null)$$,
  '42501','GD_ORDER_MANAGER_REQUIRED','an editor cannot ship an order');
select throws_ok($$select public.mark_order_shipping_notified(current_setting('test.ship_order')::bigint)$$,
  '42501','GD_ORDER_MANAGER_REQUIRED','an editor cannot stamp a shipping email');
reset role;

-- 5-10. A confirmed order ships in one step --------------------------------------------
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000002701',true);
set local role authenticated;
select throws_ok($$select public.mark_order_shipping_notified(current_setting('test.ship_order')::bigint)$$,
  '22023','GD_ORDER_INVALID_TRANSITION','an order that has not shipped cannot be stamped as notified');
select lives_ok($$select public.ship_order(current_setting('test.ship_order')::bigint,'Poste Italiane','RR123456789IT',null,'Spedito stamattina')$$,
  'a manager ships a confirmed order with its tracking code');
reset role;
select results_eq(
  $$select status::text, tracking_carrier, tracking_code, shipped_at is not null, shipping_notified_at is null from public.orders where order_number='GD-SHIP-1'$$,
  $$values ('shipped'::text, 'Poste Italiane'::text, 'RR123456789IT'::text, true, true)$$,
  'the order is shipped with courier and code, not yet notified');
select results_eq(
  $$select from_status::text, to_status::text, note from public.order_status_events where order_id=current_setting('test.ship_order')::bigint$$,
  $$values ('confirmed'::text, 'shipped'::text, 'Spedito stamattina'::text)$$,
  'the timeline records confirmed to shipped once');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000002701',true);
set local role authenticated;
select lives_ok($$select public.ship_order(current_setting('test.ship_order')::bigint,'BRT','BRT999',null,null)$$,
  'a shipped order can correct its tracking');
reset role;
select results_eq(
  $$select tracking_carrier, tracking_code, (select count(*)::int from public.order_status_events where order_id=current_setting('test.ship_order')::bigint)
    from public.orders where order_number='GD-SHIP-1'$$,
  $$values ('BRT'::text, 'BRT999'::text, 1)$$,
  'correcting tracking adds no second status event');

-- 11-12. Stamping the email -------------------------------------------------------------
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000002701',true);
set local role authenticated;
select lives_ok($$select public.mark_order_shipping_notified(current_setting('test.ship_order')::bigint)$$, 'a manager stamps the shipping email');
reset role;
select is((select shipping_notified_at is not null from public.orders where order_number='GD-SHIP-1'), true, 'the order remembers its shipping email');

-- 13-14. Unpaid orders and bad links are refused ----------------------------------------
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000002701',true);
set local role authenticated;
select throws_ok($$select public.ship_order(current_setting('test.pending_order')::bigint,'Poste Italiane',null,null,null)$$,
  '22023','GD_ORDER_INVALID_TRANSITION','an unpaid pending order cannot ship');
select throws_ok($$select public.ship_order(current_setting('test.ship_order')::bigint,'Altro','X','http://insecure.example',null)$$,
  '22023','GD_ORDER_INVALID_TRACKING','a tracking link must be HTTPS');
reset role;

select * from finish();
rollback;
