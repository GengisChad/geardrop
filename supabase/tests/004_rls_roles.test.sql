begin;
select plan(16);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000101', 'authenticated', 'authenticated', 'customer-one@example.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000102', 'authenticated', 'authenticated', 'customer-two@example.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000201', 'authenticated', 'authenticated', 'owner@example.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000202', 'authenticated', 'authenticated', 'admin@example.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000203', 'authenticated', 'authenticated', 'editor@example.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

insert into public.customer_profiles (user_id, display_name)
values
  ('00000000-0000-0000-0000-000000000101', 'Customer One'),
  ('00000000-0000-0000-0000-000000000102', 'Customer Two');

insert into public.staff_profiles (user_id, role, display_name)
values
  ('00000000-0000-0000-0000-000000000201', 'owner', 'Owner'),
  ('00000000-0000-0000-0000-000000000202', 'admin', 'Admin'),
  ('00000000-0000-0000-0000-000000000203', 'editor', 'Editor');

insert into public.orders (
  order_number, customer_id, email, subtotal_cents, shipping_cents,
  total_cents, shipping_method_code, shipping_address_snapshot,
  billing_address_snapshot, idempotency_key
)
values
  ('GD-RLS-ONE', '00000000-0000-0000-0000-000000000101', 'customer-one@example.com', 1000, 0, 1000, 'standard', '{}', '{}', '00000000-0000-0000-0000-000000001001'),
  ('GD-RLS-TWO', '00000000-0000-0000-0000-000000000102', 'customer-two@example.com', 2000, 0, 2000, 'standard', '{}', '{}', '00000000-0000-0000-0000-000000001002');

insert into public.categories (slug, name, tagline, description, active)
values ('hidden-category', 'Hidden', 'Hidden', 'Hidden', false);

insert into public.products (
  category_id, slug, sku, name, tagline, description, price_cents,
  publication_status, active
)
values
  ((select id from public.categories where slug = 'hidden-category'), 'category-hidden', 'category-hidden', 'Category hidden', 'Hidden', 'Hidden', 1000, 'published', true),
  ((select id from public.categories where slug = 'beyblade-x'), 'draft-hidden', 'draft-hidden', 'Draft hidden', 'Hidden', 'Hidden', 1000, 'draft', true),
  ((select id from public.categories where slug = 'beyblade-x'), 'inactive-hidden', 'inactive-hidden', 'Inactive hidden', 'Hidden', 'Hidden', 1000, 'published', false),
  ((select id from public.categories where slug = 'beyblade-x'), 'no-image-hidden', 'no-image-hidden', 'No image hidden', 'Hidden', 'Hidden', 1000, 'published', true);

insert into public.product_images (product_id, src, width, height, alt, published)
select id, '/hidden.png', 10, 10, 'Hidden', true
from public.products
where slug in ('category-hidden', 'draft-hidden', 'inactive-hidden');

set local role anon;
select results_eq(
  $$select count(*)::bigint from public.products$$,
  array[8::bigint],
  'anon sees only the eight published eligible seed products'
);
select results_eq(
  $$select count(*)::bigint from public.categories$$,
  array[4::bigint],
  'anon sees only active categories'
);
select results_eq(
  $$select count(*)::bigint from public.products where slug = 'draft-hidden'$$,
  array[0::bigint],
  'anon cannot see draft products'
);
select results_eq(
  $$select count(*)::bigint from public.products where slug = 'inactive-hidden'$$,
  array[0::bigint],
  'anon cannot see inactive products'
);
select results_eq(
  $$select count(*)::bigint from public.products where slug = 'category-hidden'$$,
  array[0::bigint],
  'anon cannot see products in inactive categories'
);
select results_eq(
  $$select count(*)::bigint from public.products where slug = 'no-image-hidden'$$,
  array[0::bigint],
  'anon cannot see products without a published image'
);
select results_eq(
  $$select count(*)::bigint from public.product_images$$,
  array[9::bigint],
  'anon sees only images belonging to eligible published products'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select results_eq(
  $$select count(*)::bigint from public.orders$$,
  array[1::bigint],
  'customer-one sees only their own order'
);
select results_eq(
  $$select count(*)::bigint from public.orders where order_number = 'GD-RLS-TWO'$$,
  array[0::bigint],
  'customer-one cannot enumerate another customer order'
);
select results_eq(
  $$select count(*)::bigint from public.customer_profiles$$,
  array[1::bigint],
  'customer-one sees only their own profile'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000203', true);
set local role authenticated;
select results_eq($$select count(*)::bigint from public.orders$$, array[0::bigint], 'editor cannot read orders');
select results_eq($$select count(*)::bigint from public.customer_profiles$$, array[0::bigint], 'editor cannot read customer profiles');
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000202', true);
set local role authenticated;
select results_eq($$select count(*)::bigint from public.orders$$, array[2::bigint], 'admin reads all orders');
select results_eq($$select count(*)::bigint from public.customer_profiles$$, array[2::bigint], 'admin reads all customer profiles');
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000201', true);
set local role authenticated;
select results_eq($$select count(*)::bigint from public.orders$$, array[2::bigint], 'owner reads all orders');
select results_eq($$select count(*)::bigint from public.customer_profiles$$, array[2::bigint], 'owner reads all customer profiles');
reset role;

select * from finish();
rollback;
