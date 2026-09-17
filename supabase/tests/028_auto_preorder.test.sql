begin;
select plan(27);

-- Fixtures ------------------------------------------------------------------
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token) values
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000002801','authenticated','authenticated','preorder-admin@example.com','',now(),'{}','{}',now(),now(),'','','','');
insert into public.staff_profiles(user_id,role,display_name) values ('00000000-0000-0000-0000-000000002801','admin','Preorder Admin');
insert into public.categories(slug,name,tagline,description,active,publication_status,published_at)
values('auto-preorder-cat','Auto','Auto','Auto',true,'published',now());
insert into public.products(category_id,slug,sku,name,tagline,description,price_cents,publication_status,active,stock_quantity,allow_backorder)
select (select id from public.categories where slug='auto-preorder-cat'), fixture.slug, upper(fixture.slug), fixture.name, 'Auto', 'Auto', 3000,
  fixture.publication::public.publication_status, true, fixture.stock, fixture.backorder
from (values
  ('auto-last', 'Auto last', 1, true, 'published'),
  ('auto-empty', 'Auto empty', 0, true, 'published'),
  ('closed-empty', 'Closed empty', 0, false, 'published'),
  ('draft-empty', 'Draft empty', 0, true, 'draft'),
  ('auto-pack-a', 'Auto pack A', 1, true, 'published'),
  ('auto-pack-b', 'Auto pack B', 5, true, 'published')
) as fixture(slug, name, stock, backorder, publication);
insert into public.products(category_id,slug,sku,name,tagline,description,price_cents,publication_status,active,stock_quantity,allow_backorder,availability_override,preorder_allocation)
values
  ((select id from public.categories where slug='auto-preorder-cat'),'manual-pre','MANUAL-PRE','Manual pre','M','M',3000,'published',true,0,true,'preorder',2),
  ((select id from public.categories where slug='auto-preorder-cat'),'auto-incoming','AUTO-INCOMING','Auto incoming','I','I',3000,'published',true,0,true,'incoming',0);

-- 1-6. Status follows the stock ------------------------------------------------------------
select results_eq($$select stock_status::text, is_purchasable from public.products where slug = 'auto-empty'$$,
  $$values ('pre-ordine'::text, true)$$, 'a sold-out product that pre-orders keeps selling as a pre-order');
select results_eq($$select stock_status::text, is_purchasable from public.products where slug = 'closed-empty'$$,
  $$values ('esaurito'::text, false)$$, 'a sold-out product without the switch is sold out');
select results_eq($$select stock_status::text, is_purchasable from public.products where slug = 'manual-pre'$$,
  $$values ('pre-ordine'::text, true)$$, 'a manual pre-order keeps its allocation rule');
select results_eq($$select stock_status::text, is_purchasable from public.products where slug = 'auto-incoming'$$,
  $$values ('in-arrivo'::text, false)$$, 'an incoming product is never sold, switch or not');
select is((select is_purchasable from public.products where slug = 'draft-empty'), false, 'an unpublished product is never sold');
update public.products set stock_quantity = 4 where slug = 'auto-empty';
select is((select stock_status::text from public.products where slug = 'auto-empty'), 'disponibile', 'a restock turns the pre-order back into stock');
update public.products set stock_quantity = 0 where slug = 'auto-empty';

-- 7-13. A paid line beyond the last piece is split -----------------------------------------
create temporary table split_call on commit drop as
select * from public.record_stripe_checkout_order(
  'cs_test_autopreorder00001', 'pi_test_split', 'GD-SPLIT', 'split@example.com', '3330000000',
  '{"name":"Split Buyer","address":"Via Pre 1"}',
  '[{"slug":"auto-last","name":"Auto last","quantity":3,"unit_price_cents":3000}]', 0, null);
select results_eq(
  $$select quantity, preorder_quantity, reservation_kind from public.order_items where order_id = (select order_id from split_call)$$,
  $$values (3, 2, 'stock'::text)$$, 'the last piece ships and the other two are pre-ordered');
select is((select stock_quantity from public.products where slug = 'auto-last'), 0, 'the sale takes the last piece');
select results_eq(
  $$select delta, stock_after from public.inventory_movements where order_id = (select order_id from split_call)$$,
  $$values (-1, 0)$$, 'only the piece on the shelf is an inventory movement');
select is((select count(*)::int from public.order_notes where order_id = (select order_id from split_call) and note like 'Attenzione%'),
  0, 'a pre-order is not an oversell');
select is((select note from public.order_notes where order_id = (select order_id from split_call) and note like 'Pre-ordine%'),
  'Pre-ordine: 2 × Auto last. Non erano a magazzino: potrebbero arrivare tra 10/15 giorni lavorativi.', 'the order notes the pre-ordered pieces');
select results_eq($$select stock_status::text, is_purchasable from public.products where slug = 'auto-last'$$,
  $$values ('pre-ordine'::text, true)$$, 'selling the last piece opens the pre-order');
select is((select (after_state ->> 'preordered')::int from public.audit_events where entity_type = 'orders' and entity_id = (select order_id from split_call)::text and action = 'order.paid_on_stripe'),
  2, 'the audit trail counts the pre-ordered pieces');

-- 14-16. Sold out with and without the switch -----------------------------------------------
create temporary table empty_call on commit drop as
select * from public.record_stripe_checkout_order(
  'cs_test_autopreorder00002', null, 'GD-EMPTY', 'empty@example.com', null, '{}',
  '[{"slug":"auto-empty","name":"Auto empty","quantity":1,"unit_price_cents":3000}]', 0, null);
select results_eq(
  $$select preorder_quantity, (select count(*)::int from public.inventory_movements where order_id = (select order_id from empty_call))
    from public.order_items where order_id = (select order_id from empty_call)$$,
  $$values (1, 0)$$, 'a pre-order at zero stock takes nothing from the shelf');

create temporary table closed_call on commit drop as
select * from public.record_stripe_checkout_order(
  'cs_test_autopreorder00003', null, 'GD-CLOSED', 'closed@example.com', null, '{}',
  '[{"slug":"closed-empty","name":"Closed empty","quantity":1,"unit_price_cents":3000}]', 0, null);
select is((select preorder_quantity from public.order_items where order_id = (select order_id from closed_call)), 0,
  'a product without the switch is never recorded as pre-ordered');
select is((select count(*)::int from public.order_notes where order_id = (select order_id from closed_call) and note like 'Attenzione%Closed empty%'),
  1, 'a product without the switch still flags the oversell');

-- 17-19. A duo ships the sets its packs can make now ---------------------------------------
create temporary table duo_call on commit drop as
select * from public.record_stripe_checkout_order(
  'cs_test_autopreorder00004', null, 'GD-DUO-PRE', 'duo@example.com', null, '{}',
  '[{"slug":"auto-duo","name":"Auto duo","quantity":2,"unit_price_cents":5000,"components":[{"slug":"auto-pack-a","quantity":1},{"slug":"auto-pack-b","quantity":1}]}]',
  0, null);
select is((select preorder_quantity from public.order_items where order_id = (select order_id from duo_call)), 1,
  'one duo ships now and one waits for pack A');
select results_eq($$select slug, stock_quantity from public.products where slug in ('auto-pack-a','auto-pack-b') order by slug$$,
  $$values ('auto-pack-a'::text, 0), ('auto-pack-b'::text, 3)$$, 'the duo takes what the shelf holds of each pack');
select is((select count(*)::int from public.order_notes where order_id = (select order_id from duo_call) and note like 'Attenzione%'),
  0, 'a pre-ordered duo is not an oversell');

-- 20-21. Manual pre-orders keep their allocation -------------------------------------------
create temporary table manual_call on commit drop as
select * from public.record_stripe_checkout_order(
  'cs_test_autopreorder00005', null, 'GD-MANUAL', 'manual@example.com', null, '{}',
  '[{"slug":"manual-pre","name":"Manual pre","quantity":1,"unit_price_cents":3000}]', 0, null);
select results_eq($$select reservation_kind, preorder_quantity from public.order_items where order_id = (select order_id from manual_call)$$,
  $$values ('preorder'::text, 1)$$, 'a manual pre-order line waits whole');
select is((select preorder_allocation from public.products where slug = 'manual-pre'), 1, 'a manual pre-order takes its allocation');

-- 22. Order lines cannot claim more pre-ordered units than they hold ------------------------
select throws_ok(
  $$insert into public.order_items(order_id, product_id, quantity, unit_price_cents, line_total_cents, product_name_snapshot, sku_snapshot, image_src_snapshot, preorder_quantity)
    values ((select order_id from split_call), null, 1, 100, 100, 'X', 'X', '', 2)$$,
  '23514', null, 'pre-ordered units never exceed the line quantity');

-- 23-25. Cancelling gives back only what came off the shelf ---------------------------------
select set_config('test.split_order_id',(select order_id from split_call)::text,true);
select set_config('test.duo_order_id',(select order_id from duo_call)::text,true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000002801',true);
set local role authenticated;
select lives_ok($$select public.cancel_order_and_restore_stock(current_setting('test.split_order_id')::bigint,'Annullato')$$,
  'an admin cancels the split order');
select lives_ok($$select public.cancel_order_and_restore_stock(current_setting('test.duo_order_id')::bigint,'Annullato')$$,
  'an admin cancels the duo order');
reset role;
select results_eq($$select slug, stock_quantity from public.products where slug in ('auto-last','auto-pack-a','auto-pack-b') order by slug$$,
  $$values ('auto-last'::text, 1), ('auto-pack-a'::text, 1), ('auto-pack-b'::text, 5)$$,
  'the shelf gets back its own pieces, never the pre-ordered ones');

-- 26-27. The live catalogue pre-orders; the columns are still computed ---------------------
select is((select count(*)::int from public.products where publication_status = 'published' and slug in (
  'cobalt-dragoon-2-60c','soar-phoenix-9-60gf','saber-samurai-2-70l','blast-pegasus-a-tr','drop-attack-battle-set',
  'sneak-attack-battle-set','glory-valkerion-lf','hurricane-enlil-is-7-55t','shatter-horus-9-65gb') and not allow_backorder),
  0, 'every published catalogue product sells as a pre-order once it runs out');
select is((select count(*)::int from information_schema.columns
  where table_schema = 'public' and table_name = 'products' and column_name in ('stock_status','is_purchasable') and is_generated = 'ALWAYS'),
  2, 'stock status and purchasability stay computed from the stock');

select * from finish();
rollback;
