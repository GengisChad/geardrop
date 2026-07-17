begin;
select plan(19);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000301', 'authenticated', 'authenticated', 'owner-one@example.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000302', 'authenticated', 'authenticated', 'owner-two@example.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000303', 'authenticated', 'authenticated', 'unconfirmed@example.com', '', null, '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

select results_eq(
  $$select count(*)::bigint from public.staff_profiles$$,
  array[0::bigint],
  'auth users receive no automatic owner privilege'
);
select throws_ok(
  $$select private.bootstrap_initial_owners(array['owner-one@example.com'])$$,
  '22023',
  'GD_OWNER_BOOTSTRAP_REQUIRES_TWO_EMAILS',
  'bootstrap requires exactly two emails'
);
select throws_ok(
  $$select private.bootstrap_initial_owners(array['owner-one@example.com', 'owner-one@example.com'])$$,
  '22023',
  'GD_OWNER_BOOTSTRAP_REQUIRES_TWO_DISTINCT_EMAILS',
  'bootstrap requires two distinct emails'
);
select throws_ok(
  $$select private.bootstrap_initial_owners(array['owner-one@example.com', 'unconfirmed@example.com'])$$,
  'P0002',
  'GD_OWNER_BOOTSTRAP_USERS_NOT_READY',
  'bootstrap rejects an unconfirmed user'
);
select results_eq(
  $$select private.bootstrap_initial_owners(array['owner-one@example.com', 'owner-two@example.com'])$$,
  array[2],
  'bootstrap creates exactly two owners'
);
select results_eq(
  $$select count(*)::bigint from public.staff_profiles where active and role = 'owner'$$,
  array[2::bigint],
  'exactly two active owner rows exist'
);
select results_eq(
  $$select count(*)::bigint from public.staff_profiles$$,
  array[2::bigint],
  'bootstrap creates no additional staff row'
);
select results_eq(
  $$select count(*)::bigint from public.audit_events where action = 'initial_owner_bootstrap'$$,
  array[2::bigint],
  'bootstrap records two audit events'
);
select throws_ok(
  $$select private.bootstrap_initial_owners(array['owner-one@example.com', 'owner-two@example.com'])$$,
  'P0001',
  'GD_OWNER_BOOTSTRAP_ALREADY_USED',
  'bootstrap cannot be reused'
);
select results_eq(
  $$select stock_quantity from public.products where sku = 'wizard-arrow-4-80b'$$,
  array[0],
  'inventory test starts from zero stock'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000301', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select results_eq(
  $$select public.adjust_inventory('wizard-arrow-4-80b', 5, 'manual_adjustment', 'CI stock test')$$,
  array[5],
  'owner can increase stock through adjust_inventory'
);
select results_eq(
  $$select stock_quantity from public.products where sku = 'wizard-arrow-4-80b'$$,
  array[5],
  'adjust_inventory updates authoritative stock'
);
select results_eq(
  $$select count(*)::bigint from public.inventory_movements where note = 'CI stock test'$$,
  array[1::bigint],
  'adjust_inventory writes one inventory movement'
);
select results_eq(
  $$select delta from public.inventory_movements where note = 'CI stock test'$$,
  array[5],
  'inventory movement records the delta'
);
select results_eq(
  $$select stock_after from public.inventory_movements where note = 'CI stock test'$$,
  array[5],
  'inventory movement records resulting stock'
);
select is(
  has_column_privilege('authenticated', 'public.products', 'stock_quantity', 'update'),
  false,
  'authenticated role cannot update stock directly'
);
select throws_ok(
  $$select public.adjust_inventory('wizard-arrow-4-80b', -6, 'manual_adjustment', 'negative stock')$$,
  '23514',
  'GD_INSUFFICIENT_STOCK',
  'adjust_inventory blocks negative stock'
);
select results_eq(
  $$select stock_quantity from public.products where sku = 'wizard-arrow-4-80b'$$,
  array[5],
  'failed negative adjustment leaves stock unchanged'
);
select results_eq(
  $$select count(*)::bigint from public.inventory_movements where product_id = (select id from public.products where sku = 'wizard-arrow-4-80b')$$,
  array[1::bigint],
  'failed negative adjustment creates no movement'
);
reset role;

select * from finish();
rollback;
