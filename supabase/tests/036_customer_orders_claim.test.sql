begin;
select plan(8);

-- Fixtures ------------------------------------------------------------------
-- A buyer whose confirmed address is stored with capitals, an account that never confirmed its
-- address, and another customer who already owns an order placed with the buyer's address.
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token) values
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000003601','authenticated','authenticated','Claim-Buyer@Example.com','',now(),'{}','{}',now(),now(),'','','',''),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000003602','authenticated','authenticated','claim-unconfirmed@example.com','',null,'{}','{}',now(),now(),'','','',''),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000003603','authenticated','authenticated','claim-other@example.com','',now(),'{}','{}',now(),now(),'','','','');
insert into public.orders(order_number,email,status,payment_status,subtotal_cents,discount_cents,shipping_cents,total_cents,shipping_method_code,shipping_address_snapshot,billing_address_snapshot,idempotency_key,customer_id)
values
('GD-CLM-1','claim-buyer@example.com','shipped','paid',1800,0,490,2290,'standard','{}','{}','00000000-0000-0000-0000-000000003611',null),
('GD-CLM-2','claim-buyer@example.com','confirmed','paid',1800,0,490,2290,'standard','{}','{}','00000000-0000-0000-0000-000000003612',null),
('GD-CLM-3','claim-unconfirmed@example.com','confirmed','paid',1800,0,490,2290,'standard','{}','{}','00000000-0000-0000-0000-000000003613',null),
('GD-CLM-4','claim-buyer@example.com','confirmed','paid',1800,0,490,2290,'standard','{}','{}','00000000-0000-0000-0000-000000003614','00000000-0000-0000-0000-000000003603'),
('GD-CLM-5','someone-else@example.com','confirmed','paid',1800,0,490,2290,'standard','{}','{}','00000000-0000-0000-0000-000000003615',null);

-- 1-2. Only a signed-in customer claims --------------------------------------------------
select ok(not has_function_privilege('anon','public.claim_customer_orders()','EXECUTE'), 'guests cannot claim orders');
select ok(has_function_privilege('authenticated','public.claim_customer_orders()','EXECUTE'), 'signed-in customers can claim their orders');

-- 3. An address nobody confirmed claims nothing ------------------------------------------
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000003602',true);
set local role authenticated;
select is(public.claim_customer_orders(), 0, 'an account whose email is not confirmed claims nothing');
reset role;

-- 4-6. A confirmed address claims its guest orders, whatever the case ---------------------
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000003601',true);
set local role authenticated;
select is(public.claim_customer_orders(), 2, 'the buyer claims the two guest orders placed with their address');
select is(public.claim_customer_orders(), 0, 'claiming again changes nothing');
reset role;
select results_eq(
  $$select order_number::text, customer_id::text from public.orders where order_number like 'GD-CLM-%' order by order_number$$,
  $$values ('GD-CLM-1'::text, '00000000-0000-0000-0000-000000003601'::text),
           ('GD-CLM-2'::text, '00000000-0000-0000-0000-000000003601'::text),
           ('GD-CLM-3'::text, null::text),
           ('GD-CLM-4'::text, '00000000-0000-0000-0000-000000003603'::text),
           ('GD-CLM-5'::text, null::text)$$,
  'only guest orders with the buyer''s confirmed address move; an order filed under another account stays');

-- 7-8. Each customer reads only their own orders ----------------------------------------
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000003601',true);
set local role authenticated;
select results_eq(
  $$select order_number::text from public.orders where order_number like 'GD-CLM-%' order by order_number$$,
  $$values ('GD-CLM-1'::text), ('GD-CLM-2'::text)$$,
  'the buyer reads the orders they claimed and nobody else''s');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000003603',true);
set local role authenticated;
select results_eq(
  $$select order_number::text from public.orders where order_number like 'GD-CLM-%' order by order_number$$,
  $$values ('GD-CLM-4'::text)$$,
  'another customer still reads only their own order');
reset role;

select * from finish();
rollback;
