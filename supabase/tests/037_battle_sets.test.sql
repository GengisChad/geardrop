begin;
select plan(24);

-- Fixtures: a set of three pieces, ten sealed, nothing opened yet ---------------------
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token) values
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000003701','authenticated','authenticated','sets-owner@example.com','',now(),'{}','{}',now(),now(),'','','',''),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000003702','authenticated','authenticated','sets-editor@example.com','',now(),'{}','{}',now(),now(),'','','',''),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000003703','authenticated','authenticated','sets-buyer@example.com','',now(),'{}','{}',now(),now(),'','','','');
insert into public.staff_profiles(user_id,role,display_name) values
('00000000-0000-0000-0000-000000003701','owner','Sets Owner'),
('00000000-0000-0000-0000-000000003702','editor','Sets Editor');
insert into public.categories(slug,name,tagline,description,active,publication_status,published_at)
values('sets-cat','Sets','S','S',true,'published',now());
insert into public.products(category_id,slug,sku,name,tagline,description,price_cents,publication_status,active,stock_quantity)
values
  ((select id from public.categories where slug='sets-cat'),'bs-set','BS-SET','Battle Set prova','S','S',3990,'published',true,10),
  ((select id from public.categories where slug='sets-cat'),'bs-top-a','BS-TOP-A','Top A 9-60LR','S','S',1500,'published',true,10),
  ((select id from public.categories where slug='sets-cat'),'bs-top-b','BS-TOP-B','Top B 3-85N','S','S',1500,'published',true,10),
  ((select id from public.categories where slug='sets-cat'),'bs-arena','BS-ARENA','Arena prova','S','S',1000,'draft',false,10);
insert into public.battle_set_parts(set_product_id, part_product_id)
select set_product.id, piece.id from public.products set_product join public.products piece on piece.slug in ('bs-top-a','bs-top-b','bs-arena')
where set_product.slug = 'bs-set';

create function pg_temp.sell(p_slug text, p_units integer, p_reason public.inventory_reason default 'order_reserved') returns void language sql as $$
  update public.products set stock_quantity = stock_quantity - p_units where slug = p_slug;
  insert into public.inventory_movements(product_id, delta, stock_after, reason, note)
  select id, -p_units, stock_quantity, p_reason, 'test' from public.products where slug = p_slug;
$$;
create function pg_temp.give_back(p_slug text, p_units integer) returns void language sql as $$
  update public.products set stock_quantity = stock_quantity + p_units where slug = p_slug;
  insert into public.inventory_movements(product_id, delta, stock_after, reason, note)
  select id, p_units, stock_quantity, 'order_cancelled', 'test' from public.products where slug = p_slug;
$$;
create function pg_temp.shelf() returns table(slug text, stock integer, loose integer) language sql as $$
  select product.slug, product.stock_quantity, coalesce(parts.loose, -1)
  from public.products product
  left join public.battle_set_parts parts on parts.part_product_id = product.id
  where product.slug in ('bs-set','bs-top-a','bs-top-b','bs-arena')
  order by product.slug;
$$;

-- 1-3. A loose piece sold with nothing opened: one set is opened for it ----------------------
select pg_temp.sell('bs-top-a', 1);
select results_eq($$select * from pg_temp.shelf()$$,
  $$values ('bs-arena'::text, 10, 1), ('bs-set'::text, 9, -1), ('bs-top-a'::text, 9, 0), ('bs-top-b'::text, 10, 1)$$,
  'selling a top opens a set: the set goes down, its other pieces are now loose, what can be sold of them stays');
select results_eq($$select delta, reason::text from public.inventory_movements where product_id = (select id from public.products where slug='bs-set')$$,
  $$values (-1, 'set_opened'::text)$$, 'the ledger says the set was opened');
select pg_temp.sell('bs-top-b', 1);
select results_eq($$select * from pg_temp.shelf()$$,
  $$values ('bs-arena'::text, 10, 1), ('bs-set'::text, 9, -1), ('bs-top-a'::text, 9, 0), ('bs-top-b'::text, 9, 0)$$,
  'the other top comes from the set already opened, no new set is opened');

-- 4-5. A sealed set sold takes one of each piece with it -----------------------------------
select pg_temp.sell('bs-set', 2);
select results_eq($$select * from pg_temp.shelf()$$,
  $$values ('bs-arena'::text, 8, 1), ('bs-set'::text, 7, -1), ('bs-top-a'::text, 7, 0), ('bs-top-b'::text, 7, 0)$$,
  'two sealed sets out: every piece is two less available, the loose ones stay');
select is((select count(*)::int from public.inventory_movements where reason = 'set_linked' and note = 'Uscito con un set sigillato'), 3,
  'one linked line per piece');

-- 6-7. A cancelled top goes back on the shelf as a loose one ---------------------------------
select pg_temp.give_back('bs-top-a', 1);
select results_eq($$select * from pg_temp.shelf()$$,
  $$values ('bs-arena'::text, 8, 1), ('bs-set'::text, 7, -1), ('bs-top-a'::text, 8, 1), ('bs-top-b'::text, 7, 0)$$,
  'a cancelled top is a loose one again');
select pg_temp.give_back('bs-set', 1);
select results_eq($$select stock_quantity from public.products where slug in ('bs-top-a','bs-top-b','bs-arena') order by slug$$,
  $$values (9), (9), (8)$$, 'a sealed set back on the shelf makes each piece one more available');

-- 8-11. Only managers open or count by hand --------------------------------------------------
select ok(not has_function_privilege('anon','public.open_battle_sets(text,integer)','EXECUTE'), 'guests cannot open sets');
select ok(not has_function_privilege('anon','public.count_battle_set(text,integer,jsonb)','EXECUTE'), 'guests cannot count sets');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000003702',true);
set local role authenticated;
select throws_ok($$select public.open_battle_sets('bs-set', 1)$$, '42501', 'GD_INVENTORY_MANAGER_REQUIRED', 'an editor cannot open sets');
select throws_ok($$select public.count_battle_set('bs-set', 1, '{}'::jsonb)$$, '42501', 'GD_INVENTORY_MANAGER_REQUIRED', 'an editor cannot count sets');
reset role;

-- 12-15. A batch opened by hand moves sets into loose pieces, nothing else -------------------
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000003701',true);
set local role authenticated;
select is(public.open_battle_sets('bs-set', 3), 5, 'the owner opens three sets: five sealed left');
select throws_ok($$select public.open_battle_sets('bs-set', 6)$$, '23514', 'GD_NOT_ENOUGH_SEALED_SETS', 'no more sets than are sealed');
reset role;
select results_eq($$select * from pg_temp.shelf()$$,
  $$values ('bs-arena'::text, 9, 4), ('bs-set'::text, 5, -1), ('bs-top-a'::text, 9, 4), ('bs-top-b'::text, 8, 3)$$,
  'loose pieces go up by three, what the shop can sell is unchanged');
select is((select count(*)::int from public.inventory_movements where reason = 'set_linked' and note like 'Rientrato%'), 3,
  'opening by hand writes no linked line beyond the earlier return');

-- 16-18. A Vinted stadium sale takes an opened stadium before opening a set --------------------
select public.ingest_inbound_email('sets-resend-1','Vinted <no-reply@vinted.it>','Hai venduto un articolo su Vinted','body',true,
  '{"buyer_username":"acquirente","listing_title":"Arena prova solo arena","item_count":1,"amount_cents":1000}'::jsonb);
select lives_ok($$select public.auto_apply_vinted_sale((select id from public.vinted_sales where listing_title = 'Arena prova solo arena'),
  '[{"slug":"bs-arena","quantity":5}]'::jsonb)$$, 'five stadiums sold on Vinted');
select results_eq($$select * from pg_temp.shelf()$$,
  $$values ('bs-arena'::text, 4, 0), ('bs-set'::text, 4, -1), ('bs-top-a'::text, 9, 5), ('bs-top-b'::text, 8, 4)$$,
  'four opened stadiums go first, the fifth opens a set and frees its tops');
select is((select count(*)::int from public.inventory_movements where reason = 'set_opened' and product_id = (select id from public.products where slug='bs-set')), 3,
  'two automatic openings and the batch are on the ledger');

-- 19-21. A count by hand is the truth, and is not read as a sale -------------------------------
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000003701',true);
set local role authenticated;
select lives_ok($$select public.count_battle_set('bs-set', 2, '{"bs-top-a": 6, "bs-top-b": 1, "bs-arena": 0}'::jsonb)$$, 'the owner saves a count');
select throws_ok($$select public.count_battle_set('bs-set', 2, '{"bs-top-a": 6}'::jsonb)$$, '22023', 'GD_BATTLE_SET_COUNT_INVALID', 'every piece must be counted');
reset role;
select results_eq($$select * from pg_temp.shelf()$$,
  $$values ('bs-arena'::text, 2, 0), ('bs-set'::text, 2, -1), ('bs-top-a'::text, 8, 6), ('bs-top-b'::text, 3, 1)$$,
  'sealed and loose as counted; each piece available = loose + sealed, and no set was opened by the count');

-- 22-24. Who sees what; the real Drop Attack set ----------------------------------------------------
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000003703',true);
set local role authenticated;
select is((select count(*)::int from public.battle_set_parts), 0, 'a customer sees no set pieces');
reset role;
set local role anon;
select is((select count(*)::int from public.products where slug = 'drop-attack-arena'), 0, 'the stadium alone is not on the site');
reset role;
select is((select count(*)::int from public.battle_set_parts parts join public.products set_product on set_product.id = parts.set_product_id
  where set_product.slug = 'drop-attack-battle-set'), 3, 'the Drop Attack set holds Impact Drake, Hover Wyvern and its stadium');

select * from finish();
rollback;
