begin;
select plan(24);

-- Fixtures -----------------------------------------------------------------------
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token) values
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000003101','authenticated','authenticated','restock-manager@example.com','',now(),'{}','{}',now(),now(),'','','',''),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000003102','authenticated','authenticated','restock-editor@example.com','',now(),'{}','{}',now(),now(),'','','','');
insert into public.staff_profiles(user_id,role,display_name) values
  ('00000000-0000-0000-0000-000000003101','admin','Restock Admin'),
  ('00000000-0000-0000-0000-000000003102','editor','Restock Editor');
insert into public.categories(slug,name,tagline,description,active,publication_status,published_at)
values('restock-cat','Restock','R','R',true,'published',now());
insert into public.products(category_id,slug,sku,name,tagline,description,price_cents,publication_status,active,stock_quantity)
select (select id from public.categories where slug='restock-cat'), fixture.slug, upper(fixture.slug), fixture.name, 'R', 'R', 2000,
  fixture.pub::public.publication_status, true, fixture.stock
from (values
  ('restock-pub','Restock Pub','published',0),
  ('restock-pub2','Restock Pub2','published',5),
  ('restock-draft','Restock Draft','draft',0)
) as fixture(slug, name, pub, stock);

-- 1. anon can call request_restock_notice on a published product ----------------
set local role anon;
select lives_ok(
  $$select public.request_restock_notice('restock-pub', 'buyer@example.com')$$,
  'anon can request a restock notice for a published product');
reset role;

-- 2. anon cannot read the restock_requests table --------------------------------
set local role anon;
select throws_ok(
  $$select * from public.restock_requests$$,
  '42501', null, 'anon is blocked from reading restock_requests directly');
reset role;

-- 3. authenticated cannot read restock_requests without staff role ---------------
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000099',true);
select throws_ok(
  $$select * from public.restock_requests$$,
  '42501', null, 'authenticated without staff role cannot read restock_requests');
reset role;

-- 4. RPC is idempotent: duplicate insert is silently ignored --------------------
set local role anon;
select lives_ok(
  $$select public.request_restock_notice('restock-pub', 'buyer@example.com')$$,
  'a duplicate notice request does not raise an error');
reset role;

-- Only one row should exist after two calls with the same slug+email.
select is(
  (select count(*)::int from public.restock_requests where product_slug = 'restock-pub' and lower(email) = 'buyer@example.com'),
  1,
  'duplicate request_restock_notice leaves exactly one row');

-- 5. RPC normalises email to lower-case ------------------------------------------
set local role anon;
select lives_ok(
  $$select public.request_restock_notice('restock-pub', 'Buyer@Example.COM')$$,
  'mixed-case email is accepted');
reset role;
select is(
  (select count(*)::int from public.restock_requests where product_slug = 'restock-pub' and email = 'buyer@example.com'),
  1,
  'the email is stored lower-case, and the mixed-case call collapses to the existing row');

-- 6. RPC rejects an unknown slug -------------------------------------------------
set local role anon;
select throws_ok(
  $$select public.request_restock_notice('does-not-exist', 'x@example.com')$$,
  '22023', 'GD_RESTOCK_PRODUCT_NOT_FOUND',
  'unknown product slug is rejected');
reset role;

-- 7. RPC rejects a draft product --------------------------------------------------
set local role anon;
select throws_ok(
  $$select public.request_restock_notice('restock-draft', 'x@example.com')$$,
  '22023', 'GD_RESTOCK_PRODUCT_NOT_FOUND',
  'draft product is rejected');
reset role;

-- 8. RPC rejects an invalid email -------------------------------------------------
set local role anon;
select throws_ok(
  $$select public.request_restock_notice('restock-pub', 'not-an-email')$$,
  '22023', 'GD_RESTOCK_INVALID_EMAIL',
  'malformed email is rejected');
reset role;

-- 9. RPC rejects an empty email ---------------------------------------------------
set local role anon;
select throws_ok(
  $$select public.request_restock_notice('restock-pub', '')$$,
  '22023', 'GD_RESTOCK_INVALID_EMAIL',
  'empty email is rejected');
reset role;

-- 10. Seed a second slug for demand tests ----------------------------------------
set local role anon;
select lives_ok(
  $$select public.request_restock_notice('restock-pub', 'second@example.com')$$,
  'second email can be registered for the same product');
select lives_ok(
  $$select public.request_restock_notice('restock-pub2', 'waiter@example.com')$$,
  'notice registered for product with stock > 0');
reset role;

-- 11. Manager can read restock_requests via the RLS policy -----------------------
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000003101',true);
select is(
  (select count(*)::int from public.restock_requests where product_slug = 'restock-pub'),
  2,
  'admin can read restock_requests for restock-pub (two distinct emails)');
reset role;

-- 12. Editor cannot read restock_requests (policy is manager-only) ---------------
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000003102',true);
select throws_ok(
  $$select * from public.restock_requests$$,
  '42501', null, 'editor is blocked from reading restock_requests');
reset role;

-- 13-15. get_inventory_restock_demand returns correct counts ---------------------
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000003101',true);

select results_eq(
  $$select product_slug, pending_notices::int, preorder_demand::int
      from public.get_inventory_restock_demand(array['restock-pub','restock-pub2','restock-draft'])
      order by product_slug$$,
  $$values ('restock-draft'::text, 0, 0), ('restock-pub'::text, 2, 0), ('restock-pub2'::text, 1, 0)$$,
  'get_inventory_restock_demand returns correct pending notice counts');

-- No pre-order demand yet (no active orders with preorder_quantity > 0).
select is(
  (select coalesce(sum(preorder_demand)::int,0) from public.get_inventory_restock_demand(array['restock-pub'])),
  0,
  'preorder_demand is zero when there are no active preorder orders');
reset role;

-- 16. get_inventory_restock_demand is blocked to non-manager --------------------
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000003102',true);
select is(
  (select count(*)::int from public.get_inventory_restock_demand(array['restock-pub'])),
  0,
  'editor gets no rows from get_inventory_restock_demand (guard returns empty)');
reset role;

-- 17-19. mark_restock_notices_sent marks and cleans up ---------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000003101',true);

-- Capture ids before marking.
create temporary table _ids on commit drop as
  select id from public.restock_requests where product_slug = 'restock-pub' order by id limit 1;

select lives_ok(
  $$select public.mark_restock_notices_sent((select array_agg(id) from _ids))$$,
  'manager can call mark_restock_notices_sent');

select is(
  (select count(*)::int from public.restock_requests where product_slug = 'restock-pub' and notified_at is not null),
  1,
  'one request is marked notified');

select is(
  (select pending_notices::int from public.get_inventory_restock_demand(array['restock-pub'])),
  1,
  'one request remains pending after marking one notified');
reset role;

-- 20. mark_restock_notices_sent is blocked to editor ----------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000003102',true);
select throws_ok(
  $$select public.mark_restock_notices_sent(array[]::bigint[])$$,
  '42501', 'GD_RESTOCK_MANAGER_REQUIRED',
  'editor cannot call mark_restock_notices_sent');
reset role;

-- 21-22. 6-month cleanup on mark_restock_notices_sent ---------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000003101',true);

-- Insert a stale row.
insert into public.restock_requests(product_slug, email, created_at)
values ('restock-pub', 'stale@example.com', now() - interval '7 months');

select is(
  (select count(*)::int from public.restock_requests where email = 'stale@example.com'),
  1,
  'stale row inserted for cleanup test');

select lives_ok(
  $$select public.mark_restock_notices_sent(array[]::bigint[])$$,
  'mark_restock_notices_sent with empty array triggers cleanup');

select is(
  (select count(*)::int from public.restock_requests where email = 'stale@example.com'),
  0,
  '6-month-old request is deleted by the cleanup');
reset role;

-- 23. anon cannot call mark_restock_notices_sent --------------------------------
set local role anon;
select throws_ok(
  $$select public.mark_restock_notices_sent(array[]::bigint[])$$,
  '42501', null, 'anon cannot call mark_restock_notices_sent');
reset role;

-- 24. preorder_demand is populated when active orders exist ---------------------
-- Build a minimal paid order with a preorder_quantity for restock-pub.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000003101',true);

insert into public.orders(order_number,email,status,payment_status,subtotal_cents,discount_cents,shipping_cents,total_cents,shipping_method_code,shipping_address_snapshot,billing_address_snapshot,idempotency_key)
values ('GD-RESTOCK-TEST','demand@example.com','confirmed','paid',2000,0,0,2000,'standard','{}','{}',md5('restock-demand-test')::uuid);
insert into public.order_items(order_id,product_id,quantity,unit_price_cents,line_total_cents,product_name_snapshot,sku_snapshot,image_src_snapshot,preorder_quantity)
select (select id from public.orders where order_number='GD-RESTOCK-TEST'),
       (select id from public.products where slug='restock-pub'),
       2,2000,4000,'Restock Pub','RESTOCK-PUB','',2;

select is(
  (select preorder_demand::int from public.get_inventory_restock_demand(array['restock-pub'])),
  2,
  'preorder_demand counts preorder_quantity from confirmed/processing orders');
reset role;

select * from finish();
rollback;
