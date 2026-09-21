begin;
select plan(4);

-- Supabase's API hands the signed-in user to Postgres as one JSON, request.jwt.claims; the old
-- request.jwt.claim.sub is no longer set. These run with the JSON alone, as production does
-- (record_order_refund refused the owner there until 20260921220000).

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token) values
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000003301','authenticated','authenticated','claims-owner@example.com','',now(),'{}','{}',now(),now(),'','','',''),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000003302','authenticated','authenticated','claims-buyer@example.com','',now(),'{}','{}',now(),now(),'','','','');
insert into public.staff_profiles(user_id,role,display_name) values
('00000000-0000-0000-0000-000000003301','owner','Claims Owner');
insert into public.orders(order_number,email,status,payment_status,subtotal_cents,discount_cents,shipping_cents,total_cents,shipping_method_code,shipping_address_snapshot,billing_address_snapshot,idempotency_key,stripe_payment_intent_id)
values
('GD-CLAIMS-1','claims@example.com','confirmed','paid',7500,0,0,7500,'standard','{}','{}','00000000-0000-0000-0000-000000003311','pi_test_claims_1');

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000003301","role":"authenticated"}', true);

select lives_ok(
  $$select public.record_order_refund((select id from public.orders where order_number = 'GD-CLAIMS-1'), 2500, 'Un pezzo oltre la disponibilità', 'dashboard-claims')$$,
  'the owner records a refund with the claims JSON alone');
select results_eq(
  $$select refunded_cents, payment_status::text from public.orders where order_number = 'GD-CLAIMS-1'$$,
  $$values (2500, 'paid'::text)$$,
  'a partial refund adds up and leaves the order paid');
select lives_ok($$select * from public.read_funnel_stats(7)$$, 'the owner reads the funnel stats with the claims JSON alone');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000003302","role":"authenticated"}', true);
select throws_ok(
  $$select public.record_order_refund((select id from public.orders where order_number = 'GD-CLAIMS-1'), 100, 'Non staff', 'dashboard-nope')$$,
  '42501', 'GD_ORDER_MANAGER_REQUIRED',
  'a signed-in buyer is still refused');

select * from finish();
rollback;
