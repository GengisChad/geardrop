begin;
select plan(19);

-- Fixtures ------------------------------------------------------------------
insert into public.orders(order_number,email,status,payment_status,subtotal_cents,discount_cents,shipping_cents,total_cents,shipping_method_code,shipping_address_snapshot,billing_address_snapshot,idempotency_key,stripe_payment_intent_id)
values
('GD-REFUND-FULL','refund@example.com','confirmed','paid',2180,0,0,2180,'standard','{}','{}','00000000-0000-0000-0000-000000003701','pi_test_refund_full'),
('GD-REFUND-PART','refund@example.com','shipped','paid',7500,0,0,7500,'standard','{}','{}','00000000-0000-0000-0000-000000003702','pi_test_refund_part'),
('GD-REFUND-OWNER','refund@example.com','confirmed','paid',2064,0,0,2064,'standard','{}','{}','00000000-0000-0000-0000-000000003703','pi_test_refund_owner');

-- A refund of the whole order -----------------------------------------------
select results_eq(
  $$select order_number, refunded_cents, recorded from public.record_stripe_charge_refund('pi_test_refund_full', 2180, 'ch_test_full')$$,
  $$values ('GD-REFUND-FULL'::text, 2180, true)$$,
  'a refund made on Stripe is recorded');
select results_eq(
  $$select payment_status::text, status::text, refunded_cents, refund_reason, stripe_refund_id from public.orders where order_number = 'GD-REFUND-FULL'$$,
  $$values ('refunded'::text, 'confirmed'::text, 2180, 'Rimborso fatto su Stripe'::text, 'ch_test_full'::text)$$,
  'the whole amount turns the payment refunded and leaves the order status to the owner');
select ok(
  (select refund_prepared_at is not null from public.orders where order_number = 'GD-REFUND-FULL'),
  'the refund carries its date');
select results_eq(
  $$select note from public.order_notes where order_id = (select id from public.orders where order_number = 'GD-REFUND-FULL')$$,
  $$values ('Rimborso fatto su Stripe: rimborsati 21,80 € su 21,80 €. Registrato in automatico: nessuna email dal negozio, stock invariato. NON SPEDIRE. Se i pezzi sono a magazzino: Annulla e ripristina stock.'::text)$$,
  'the note tells the owner not to ship an order that has not left');
select results_eq(
  $$select action, after_state->>'source', (after_state->>'amount_cents')::integer from public.audit_events where entity_type = 'orders' and entity_id = (select id::text from public.orders where order_number = 'GD-REFUND-FULL') and action = 'order.refunded'$$,
  $$values ('order.refunded'::text, 'stripe_webhook'::text, 2180)$$,
  'the audit trail says the webhook did it');

-- Stripe repeats a delivery ---------------------------------------------------
select results_eq(
  $$select refunded_cents, recorded from public.record_stripe_charge_refund('pi_test_refund_full', 2180, 'ch_test_full')$$,
  $$values (2180, false)$$,
  'a repeated delivery changes nothing');
select is(
  (select count(*)::integer from public.order_notes where order_id = (select id from public.orders where order_number = 'GD-REFUND-FULL')),
  1,
  'a repeated delivery adds no second note');

-- Partial refunds, in any order ----------------------------------------------
select results_eq(
  $$select refunded_cents, recorded from public.record_stripe_charge_refund('pi_test_refund_part', 2500, 'ch_test_part')$$,
  $$values (2500, true)$$,
  'a partial refund records the total so far');
select results_eq(
  $$select payment_status::text, status::text from public.orders where order_number = 'GD-REFUND-PART'$$,
  $$values ('paid'::text, 'shipped'::text)$$,
  'a partial refund leaves the order paid');
select results_eq(
  $$select note from public.order_notes where order_id = (select id from public.orders where order_number = 'GD-REFUND-PART')$$,
  $$values ('Rimborso fatto su Stripe: rimborsati 25,00 € su 75,00 €. Registrato in automatico: nessuna email dal negozio, stock invariato.'::text)$$,
  'no warning about shipping on a partial refund');
select results_eq(
  $$select refunded_cents, recorded from public.record_stripe_charge_refund('pi_test_refund_part', 5000, 'ch_test_part')$$,
  $$values (5000, true)$$,
  'the second refund raises the total without counting the first twice');
select results_eq(
  $$select refunded_cents, recorded from public.record_stripe_charge_refund('pi_test_refund_part', 2500, 'ch_test_part')$$,
  $$values (5000, false)$$,
  'an older event delivered late never lowers the total');

-- The owner recorded it in the panel before making it on Stripe ------------------
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous) values
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000003711','authenticated','authenticated','refund-owner@example.com','',now(),'{}','{}',now(),now(),false,false);
insert into public.staff_profiles(user_id,role,display_name) values ('00000000-0000-0000-0000-000000003711','owner','Refund Owner');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000003711","role":"authenticated"}', true);
select public.record_order_refund((select id from public.orders where order_number = 'GD-REFUND-OWNER'), 2064, 'Annullamento', 'dashboard-test');
select results_eq(
  $$select refunded_cents, recorded from public.record_stripe_charge_refund('pi_test_refund_owner', 2064, 'ch_test_owner')$$,
  $$values (2064, false)$$,
  'a refund the owner already recorded is not counted again');
select results_eq(
  $$select refund_reason, stripe_refund_id from public.orders where order_number = 'GD-REFUND-OWNER'$$,
  $$values ('Annullamento'::text, 'dashboard-test'::text)$$,
  'the words of the owner stay');

-- Payments that are not orders, and wrong figures -----------------------------------
select is_empty(
  $$select * from public.record_stripe_charge_refund('pi_not_an_order', 200, 'ch_test')$$,
  'a payment without an order returns nothing');
select throws_ok(
  $$select * from public.record_stripe_charge_refund('pi_test_refund_part', 0, 'ch_test')$$,
  '22023', 'GD_ORDER_REFUND_INVALID',
  'an amount of zero is refused');

-- Only the webhook's key can call it --------------------------------------------------
select ok(not has_function_privilege('anon', 'public.record_stripe_charge_refund(text,integer,text)', 'EXECUTE'), 'anon cannot call it');
select ok(not has_function_privilege('authenticated', 'public.record_stripe_charge_refund(text,integer,text)', 'EXECUTE'), 'a signed-in user cannot call it');
select ok(has_function_privilege('service_role', 'public.record_stripe_charge_refund(text,integer,text)', 'EXECUTE'), 'the webhook can call it');

select * from finish();
rollback;
