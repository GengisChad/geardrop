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
select plan(25);
select has_function('public','get_admin_dashboard_metrics',array['bigint']::text[],'dashboard aggregate exists');
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token) values
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000001801','authenticated','authenticated','dashboard-admin@example.com','',now(),'{}','{}',now(),now(),'','','',''),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000001802','authenticated','authenticated','dashboard-editor@example.com','',now(),'{}','{}',now(),now(),'','','','');
insert into public.staff_profiles(user_id,role,display_name) values('00000000-0000-0000-0000-000000001801','admin','Dashboard Admin'),('00000000-0000-0000-0000-000000001802','editor','Dashboard Editor');
update public.coupons set active=false;update public.promotions set active=false;
insert into public.coupons(code,discount_kind,discount_value,active) values('DASHBOARD10','fixed',100,true);
insert into public.promotions(name,discount_kind,discount_value,active) values('Dashboard Promo','percentage',10,true);

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001801',true);set local role authenticated;
select results_eq($$select (public.get_admin_dashboard_metrics((select id from public.organizations where slug = 'geardrop'))->'commerce'->>'order_count')::integer$$,array[0],'empty order count is zero');
select results_eq($$select (public.get_admin_dashboard_metrics((select id from public.organizations where slug = 'geardrop'))->'commerce'->>'revenue_cents')::integer$$,array[0],'empty revenue is zero cents');
select results_eq($$select (public.get_admin_dashboard_metrics((select id from public.organizations where slug = 'geardrop'))->'commerce'->>'average_order_value_cents')::integer$$,array[0],'empty average is zero cents');
select results_eq($$select (public.get_admin_dashboard_metrics((select id from public.organizations where slug = 'geardrop'))->'commerce'->>'gross_revenue_cents')::integer$$,array[0],'empty gross revenue is zero cents');
select results_eq($$select (public.get_admin_dashboard_metrics((select id from public.organizations where slug = 'geardrop'))->'commerce'->>'refunded_cents')::integer$$,array[0],'empty refunded total is zero cents');
select results_eq($$select jsonb_array_length(public.get_admin_dashboard_metrics((select id from public.organizations where slug = 'geardrop'))->'commerce'->'latest_orders')$$,array[0],'empty latest orders is an empty list');
select results_eq($$select (public.get_admin_dashboard_metrics((select id from public.organizations where slug = 'geardrop'))->>'active_coupons')::integer,(public.get_admin_dashboard_metrics((select id from public.organizations where slug = 'geardrop'))->>'active_promotions')::integer$$,$$select 1,1$$,'active pricing counts are exact');
select ok((public.get_admin_dashboard_metrics((select id from public.organizations where slug = 'geardrop'))->'products'->>'total')::integer>=0,'product count is a real nonnegative aggregate');
reset role;

insert into public.orders(order_number,email,status,payment_status,currency,subtotal_cents,discount_cents,shipping_cents,total_cents,shipping_method_code,shipping_address_snapshot,billing_address_snapshot,idempotency_key) values
('GD-DASH-1','one@example.com','confirmed','paid','EUR',2000,0,0,2000,'standard','{}','{}','00000000-0000-0000-0000-000000001811'),
('GD-DASH-2','two@example.com','pending','pending','EUR',3000,0,0,3000,'standard','{}','{}','00000000-0000-0000-0000-000000001812');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001801',true);set local role authenticated;
select results_eq($$select (public.get_admin_dashboard_metrics((select id from public.organizations where slug = 'geardrop'))->'commerce'->>'order_count')::integer$$,array[1],'order count follows the charged orders, not every row ever created');
select results_eq($$select (public.get_admin_dashboard_metrics((select id from public.organizations where slug = 'geardrop'))->'commerce'->>'revenue_cents')::integer$$,array[2000],'revenue uses paid integer cents only');
select results_eq($$select (public.get_admin_dashboard_metrics((select id from public.organizations where slug = 'geardrop'))->'commerce'->>'average_order_value_cents')::integer$$,array[2000],'average order value uses paid integer cents');
select results_eq($$select jsonb_array_length(public.get_admin_dashboard_metrics((select id from public.organizations where slug = 'geardrop'))->'commerce'->'latest_orders')$$,array[2],'manager sees real latest orders');
select ok(jsonb_typeof(public.get_admin_dashboard_metrics((select id from public.organizations where slug = 'geardrop'))->'stock_movements')='array','stock movements are always a real list');
select ok(jsonb_typeof(public.get_admin_dashboard_metrics((select id from public.organizations where slug = 'geardrop'))->'staff_activity')='array','manager receives real staff activity list');
reset role;

-- A partial refund stays 'paid' and a full one flips to 'refunded': both have to leave the money
-- they gave back out of the revenue card, the way the Stripe ledger does.
insert into public.orders(order_number,email,status,payment_status,currency,subtotal_cents,discount_cents,shipping_cents,total_cents,shipping_method_code,shipping_address_snapshot,billing_address_snapshot,idempotency_key,refunded_cents) values
('GD-DASH-3','three@example.com','confirmed','paid','EUR',5000,0,0,5000,'standard','{}','{}','00000000-0000-0000-0000-000000001813',1000),
('GD-DASH-4','four@example.com','confirmed','refunded','EUR',4000,0,0,4000,'standard','{}','{}','00000000-0000-0000-0000-000000001814',4000);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001801',true);set local role authenticated;
select results_eq($$select (public.get_admin_dashboard_metrics((select id from public.organizations where slug = 'geardrop'))->'commerce'->>'order_count')::integer$$,array[3],'a refunded order was still a payment and stays counted');
select results_eq($$select (public.get_admin_dashboard_metrics((select id from public.organizations where slug = 'geardrop'))->'commerce'->>'gross_revenue_cents')::integer$$,array[11000],'gross revenue is what the charges took');
select results_eq($$select (public.get_admin_dashboard_metrics((select id from public.organizations where slug = 'geardrop'))->'commerce'->>'refunded_cents')::integer$$,array[5000],'refunds add up across partial and full');
select results_eq($$select (public.get_admin_dashboard_metrics((select id from public.organizations where slug = 'geardrop'))->'commerce'->>'revenue_cents')::integer$$,array[6000],'revenue is net of partial and full refunds');
select results_eq($$select (public.get_admin_dashboard_metrics((select id from public.organizations where slug = 'geardrop'))->'commerce'->>'refunded_order_count')::integer$$,array[2],'both refunded orders are reported');
select results_eq($$select (public.get_admin_dashboard_metrics((select id from public.organizations where slug = 'geardrop'))->'commerce'->>'unpaid_order_count')::integer$$,array[1],'the pending order is reported beside the paid ones, never inside them');
select results_eq($$select (public.get_admin_dashboard_metrics((select id from public.organizations where slug = 'geardrop'))->'commerce'->>'average_order_value_cents')::integer$$,array[2000],'the average is the net revenue over the same orders it counted');
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001802',true);set local role authenticated;
select ok(public.get_admin_dashboard_metrics((select id from public.organizations where slug = 'geardrop'))->'commerce'='null'::jsonb,'editor commerce metrics are redacted, not zeroed');
select ok(public.get_admin_dashboard_metrics((select id from public.organizations where slug = 'geardrop'))->'staff_activity'='null'::jsonb,'editor staff activity is redacted');
select ok(jsonb_typeof(public.get_admin_dashboard_metrics((select id from public.organizations where slug = 'geardrop'))->'products')='object','editor still receives catalog operations metrics');
reset role;
select * from finish();rollback;
