begin;
select plan(18);

-- Fixtures ------------------------------------------------------------------
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token) values
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000002601','authenticated','authenticated','bundle-admin@example.com','',now(),'{}','{}',now(),now(),'','','','');
insert into public.staff_profiles(user_id,role,display_name) values ('00000000-0000-0000-0000-000000002601','admin','Bundle Admin');
insert into public.categories(slug,name,tagline,description,active,publication_status,published_at)
values('bundle-order-cat','Bundle','Bundle','Bundle',true,'published',now());
insert into public.products(category_id,slug,sku,name,tagline,description,price_cents,publication_status,active,stock_quantity)
values((select id from public.categories where slug='bundle-order-cat'),'bundle-pack-a','BUNDLE-PACK-A','Bundle pack A','A','A',2000,'published',true,5),
      ((select id from public.categories where slug='bundle-order-cat'),'bundle-pack-b','BUNDLE-PACK-B','Bundle pack B','B','B',2000,'published',true,1);

-- 1-8. A bundle line is one order item and takes each pack's pieces ------------------------
create temporary table bundle_call on commit drop as
select * from public.record_stripe_checkout_order(
  'cs_test_bundleorder000001', 'pi_test_bundle', 'GD-BUNDLE', 'duo@example.com', '3330000000',
  '{"name":"Duo Buyer","address":"Via Duo 2"}',
  '[{"slug":"duo-a-b","name":"Duo A + B","quantity":1,"unit_price_cents":3700,"components":[{"slug":"bundle-pack-a","quantity":1},{"slug":"bundle-pack-b","quantity":1}]},
    {"slug":"bundle-pack-a","name":"Bundle pack A","quantity":2,"unit_price_cents":2000}]',
  490, null);

select is((select created from bundle_call), true, 'a paid bundle creates the order');
select results_eq(
  $$select subtotal_cents, total_cents from public.orders where id = (select order_id from bundle_call)$$,
  $$values (7700, 8190)$$,
  'the bundle is priced as Stripe charged it, next to the single packs');
select results_eq(
  $$select sku_snapshot, quantity, line_total_cents, product_id is null from public.order_items
    where order_id = (select order_id from bundle_call) order by sku_snapshot$$,
  $$values ('BUNDLE-PACK-A', 2, 4000, false), ('DUO-A-B', 1, 3700, true)$$,
  'the bundle stays one order line beside the single pack');
select is((select image_src_snapshot from public.order_items where order_id = (select order_id from bundle_call) and sku_snapshot = 'DUO-A-B'),
  '/products/duo-a-b.webp', 'the bundle line keeps its packshot path for the admin panel');
select is((select stock_quantity from public.products where sku = 'BUNDLE-PACK-A'), 2, 'the bundle and the single packs both take pack A');
select is((select stock_quantity from public.products where sku = 'BUNDLE-PACK-B'), 0, 'the bundle takes pack B');
select is((select count(*)::int from public.inventory_movements where order_id = (select order_id from bundle_call)),
  3, 'every stock change of the order is an inventory movement');
select is((select count(*)::int from public.order_notes where order_id = (select order_id from bundle_call)),
  0, 'an order within stock carries no oversell note');

-- 9-10. Retries are no-ops -------------------------------------------------------------
create temporary table bundle_repeat on commit drop as
select * from public.record_stripe_checkout_order(
  'cs_test_bundleorder000001', 'pi_test_bundle', 'GD-BUNDLE', 'duo@example.com', null, '{}',
  '[{"slug":"duo-a-b","name":"Duo A + B","quantity":1,"unit_price_cents":3700,"components":[{"slug":"bundle-pack-a","quantity":1},{"slug":"bundle-pack-b","quantity":1}]}]',
  490, null);
select is((select created from bundle_repeat), false, 'a repeated bundle delivery creates nothing');
select is((select stock_quantity from public.products where sku = 'BUNDLE-PACK-A'), 2, 'a repeated bundle delivery never takes stock twice');

-- 11. A bundle beyond its packs' stock is kept and flagged ---------------------------------
create temporary table bundle_oversold on commit drop as
select * from public.record_stripe_checkout_order(
  'cs_test_bundleorder000002', null, 'GD-BUNDLE-LATE', 'late@example.com', null, '{}',
  '[{"slug":"duo-a-b","name":"Duo A + B","quantity":1,"unit_price_cents":3700,"components":[{"slug":"bundle-pack-a","quantity":1},{"slug":"bundle-pack-b","quantity":1}]}]',
  0, null);
select is((select count(*)::int from public.order_notes where order_id = (select order_id from bundle_oversold) and note like 'Attenzione%Bundle pack B%'),
  1, 'selling a bundle whose pack ran out leaves a note for the owner');
select is((select preorder_quantity from public.order_items where order_id = (select order_id from bundle_oversold)),
  0, 'a bundle whose pack does not pre-order is never recorded as pre-ordered');
select is((select count(*)::int from public.order_notes where order_id = (select order_id from bundle_oversold) and note like 'Pre-ordine%'),
  0, 'an oversold bundle promises no pre-order delivery');

-- 12. Malformed components are refused -------------------------------------------------
select throws_ok(
  $$select * from public.record_stripe_checkout_order('cs_test_bundleorder000003', null, 'GD-X', 'a@b.it', null, '{}',
    '[{"slug":"duo-a-b","name":"Duo","quantity":1,"unit_price_cents":3700,"components":[]}]', 0, null)$$,
  '22023', 'GD_STRIPE_ORDER_INVALID_PAYLOAD', 'a bundle without components is refused');

-- 13-16. Cancelling a bundle order gives both packs back, exactly once --------------------
-- The temporary table belongs to the test role, so the staff call reads the id from a setting.
select set_config('test.bundle_order_id',(select order_id from bundle_call)::text,true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000002601',true);
set local role authenticated;
select lives_ok($$select public.cancel_order_and_restore_stock(current_setting('test.bundle_order_id')::bigint,'Annullato')$$,
  'an order with a bundle line can be cancelled');
reset role;
select results_eq(
  $$select sku, stock_quantity from public.products where sku in ('BUNDLE-PACK-A','BUNDLE-PACK-B') order by sku$$,
  $$values ('BUNDLE-PACK-A'::text, 4), ('BUNDLE-PACK-B'::text, 1)$$,
  'cancelling returns what the bundle and the single packs took, and nothing more');
select is((select status::text from public.orders where id = (select order_id from bundle_call)), 'cancelled', 'the order is cancelled');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000002601',true);
set local role authenticated;
select throws_ok($$select public.cancel_order_and_restore_stock(current_setting('test.bundle_order_id')::bigint,'Ancora')$$,
  '22023','GD_ORDER_INVALID_TRANSITION','a second cancellation cannot restore the packs twice');
reset role;

select * from finish();
rollback;
