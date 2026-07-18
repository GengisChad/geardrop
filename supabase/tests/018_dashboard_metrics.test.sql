begin;
select plan(16);
select has_function('public','get_admin_dashboard_metrics',array[]::text[],'dashboard aggregate exists');
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token) values
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000001801','authenticated','authenticated','dashboard-admin@example.com','',now(),'{}','{}',now(),now(),'','','',''),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000001802','authenticated','authenticated','dashboard-editor@example.com','',now(),'{}','{}',now(),now(),'','','','');
insert into public.staff_profiles(user_id,role,display_name) values('00000000-0000-0000-0000-000000001801','admin','Dashboard Admin'),('00000000-0000-0000-0000-000000001802','editor','Dashboard Editor');
update public.coupons set active=false;update public.promotions set active=false;
insert into public.coupons(code,discount_kind,discount_value,active) values('DASHBOARD10','fixed',100,true);
insert into public.promotions(name,discount_kind,discount_value,active) values('Dashboard Promo','percentage',10,true);

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001801',true);set local role authenticated;
select results_eq($$select (public.get_admin_dashboard_metrics()->'commerce'->>'order_count')::integer$$,array[0],'empty order count is zero');
select results_eq($$select (public.get_admin_dashboard_metrics()->'commerce'->>'revenue_cents')::integer$$,array[0],'empty revenue is zero cents');
select results_eq($$select (public.get_admin_dashboard_metrics()->'commerce'->>'average_order_value_cents')::integer$$,array[0],'empty average is zero cents');
select results_eq($$select jsonb_array_length(public.get_admin_dashboard_metrics()->'commerce'->'latest_orders')$$,array[0],'empty latest orders is an empty list');
select results_eq($$select (public.get_admin_dashboard_metrics()->>'active_coupons')::integer,(public.get_admin_dashboard_metrics()->>'active_promotions')::integer$$,$$select 1,1$$,'active pricing counts are exact');
select ok((public.get_admin_dashboard_metrics()->'products'->>'total')::integer>=0,'product count is a real nonnegative aggregate');
reset role;

insert into public.orders(order_number,email,status,payment_status,currency,subtotal_cents,discount_cents,shipping_cents,total_cents,shipping_method_code,shipping_address_snapshot,billing_address_snapshot,idempotency_key) values
('GD-DASH-1','one@example.com','confirmed','paid','EUR',2000,0,0,2000,'standard','{}','{}','00000000-0000-0000-0000-000000001811'),
('GD-DASH-2','two@example.com','pending','pending','EUR',3000,0,0,3000,'standard','{}','{}','00000000-0000-0000-0000-000000001812');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001801',true);set local role authenticated;
select results_eq($$select (public.get_admin_dashboard_metrics()->'commerce'->>'order_count')::integer$$,array[2],'manager sees exact order count');
select results_eq($$select (public.get_admin_dashboard_metrics()->'commerce'->>'revenue_cents')::integer$$,array[2000],'revenue uses paid integer cents only');
select results_eq($$select (public.get_admin_dashboard_metrics()->'commerce'->>'average_order_value_cents')::integer$$,array[2000],'average order value uses paid integer cents');
select results_eq($$select jsonb_array_length(public.get_admin_dashboard_metrics()->'commerce'->'latest_orders')$$,array[2],'manager sees real latest orders');
select ok(jsonb_typeof(public.get_admin_dashboard_metrics()->'stock_movements')='array','stock movements are always a real list');
select ok(jsonb_typeof(public.get_admin_dashboard_metrics()->'staff_activity')='array','manager receives real staff activity list');
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001802',true);set local role authenticated;
select ok(public.get_admin_dashboard_metrics()->'commerce'='null'::jsonb,'editor commerce metrics are redacted, not zeroed');
select ok(public.get_admin_dashboard_metrics()->'staff_activity'='null'::jsonb,'editor staff activity is redacted');
select ok(jsonb_typeof(public.get_admin_dashboard_metrics()->'products')='object','editor still receives catalog operations metrics');
reset role;
select * from finish();rollback;
