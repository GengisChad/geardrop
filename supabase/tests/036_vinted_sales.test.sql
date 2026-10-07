begin;
select plan(24);

-- Fixtures ------------------------------------------------------------------
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token) values
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000003601','authenticated','authenticated','vinted-owner@example.com','',now(),'{}','{}',now(),now(),'','','',''),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000003602','authenticated','authenticated','vinted-editor@example.com','',now(),'{}','{}',now(),now(),'','','',''),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000003603','authenticated','authenticated','vinted-buyer@example.com','',now(),'{}','{}',now(),now(),'','','','');
insert into public.staff_profiles(user_id,role,display_name) values
('00000000-0000-0000-0000-000000003601','owner','Vinted Owner'),
('00000000-0000-0000-0000-000000003602','editor','Vinted Editor');
insert into public.categories(slug,name,tagline,description,active,publication_status,published_at)
values('vinted-cat','Vinted','V','V',true,'published',now());
insert into public.products(category_id,slug,sku,name,tagline,description,price_cents,publication_status,active,stock_quantity)
values
  ((select id from public.categories where slug='vinted-cat'),'vinted-top','VINTED-TOP','Vinted Top 1-80MN','V','V',999,'published',true,5),
  ((select id from public.categories where slug='vinted-cat'),'vinted-last','VINTED-LAST','Vinted Last 3-85N','V','V',1500,'published',true,1);
insert into public.products(category_id,slug,sku,name,tagline,description,price_cents,publication_status,active,stock_quantity,allow_backorder,availability_override,preorder_allocation)
values ((select id from public.categories where slug='vinted-cat'),'vinted-drop','VINTED-DROP','Vinted Drop 4-50FF','V','V',2300,'published',true,0,true,'preorder',3);

-- 1-6. Who may call what -----------------------------------------------------
select ok(not has_function_privilege('anon','public.ingest_inbound_email(text,text,text,text,boolean,jsonb)','EXECUTE'), 'guests cannot store inbound email');
select ok(not has_function_privilege('authenticated','public.ingest_inbound_email(text,text,text,text,boolean,jsonb)','EXECUTE'), 'signed-in users cannot store inbound email');
select ok(not has_function_privilege('authenticated','public.auto_apply_vinted_sale(bigint,jsonb)','EXECUTE'), 'signed-in users cannot auto-apply a sale');
select ok(has_function_privilege('service_role','public.ingest_inbound_email(text,text,text,text,boolean,jsonb)','EXECUTE'), 'the webhook key stores inbound email');
select ok(has_function_privilege('service_role','public.auto_apply_vinted_sale(bigint,jsonb)','EXECUTE'), 'the webhook key applies a sale it is sure of');
select ok(not has_function_privilege('anon','public.apply_vinted_sale(bigint,jsonb)','EXECUTE'), 'guests cannot apply a sale');

-- 7-9. Storing an email is idempotent -----------------------------------------
select results_eq(
  $$select sale_id is not null, created from public.ingest_inbound_email('resend-1','Vinted <no-reply@vinted.it>','Hai venduto un articolo su Vinted','body',true,
    '{"buyer_username":"acquirente01","listing_title":"Vinted Top 1-80MN","item_count":1,"amount_cents":999}'::jsonb)$$,
  $$values (true, true)$$, 'a sale email is stored with its sale');
select results_eq(
  $$select created from public.ingest_inbound_email('resend-1','Vinted <no-reply@vinted.it>','Hai venduto un articolo su Vinted','body',true,
    '{"buyer_username":"acquirente01","listing_title":"Vinted Top 1-80MN","item_count":1,"amount_cents":999}'::jsonb)$$,
  $$values (false)$$, 'a second delivery of the same email changes nothing');
select is((select count(*)::int from public.vinted_sales), 1, 'one sale for one email');
select set_config('test.sale', (select id from public.vinted_sales limit 1)::text, true);

-- 10-13. The webhook takes the pieces off the shelf ------------------------------
select lives_ok($$select public.auto_apply_vinted_sale(current_setting('test.sale')::bigint, '[{"slug":"vinted-top","quantity":2}]'::jsonb)$$,
  'a sale named by code is applied');
select is((select stock_quantity from public.products where slug='vinted-top'), 3, 'the shelf loses the pieces sold');
select results_eq(
  $$select delta, stock_after, reason::text from public.inventory_movements where note = 'Vendita Vinted #' || current_setting('test.sale')$$,
  $$values (-2, 3, 'vinted_sale'::text)$$, 'the ledger says the pieces went to Vinted');
select throws_ok($$select public.auto_apply_vinted_sale(current_setting('test.sale')::bigint, '[{"slug":"vinted-top","quantity":1}]'::jsonb)$$,
  '22023','GD_VINTED_SALE_ALREADY_HANDLED','a recorded sale cannot be applied twice');

-- 14-15. Never below zero ------------------------------------------------------
select public.ingest_inbound_email('resend-2','Vinted <no-reply@vinted.it>','Hai venduto un articolo su Vinted','body',true,
  '{"buyer_username":"acquirente02","listing_title":"Set di 2 articoli","item_count":2,"amount_cents":2400}'::jsonb);
select set_config('test.set_sale', (select id from public.vinted_sales where listing_title = 'Set di 2 articoli')::text, true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000003601',true);
set local role authenticated;
select results_eq(
  $$select line ->> 'slug', (line ->> 'taken')::int, (line ->> 'quantity')::int
    from jsonb_array_elements(public.apply_vinted_sale(current_setting('test.set_sale')::bigint, '[{"slug":"vinted-last","quantity":2}]'::jsonb)) as line$$,
  $$values ('vinted-last'::text, 1, 2)$$, 'the owner records a set; the shelf gives what it holds and says so');
reset role;
select is((select stock_quantity from public.products where slug='vinted-last'), 0, 'the shelf stops at zero');

-- 16-19. The panel: managers only -------------------------------------------------
select public.ingest_inbound_email('resend-3','Vinted <no-reply@vinted.it>','Hai venduto un articolo su Vinted','body',false,
  '{"buyer_username":"acquirente03","listing_title":"Titolo libero","item_count":1,"amount_cents":1000}'::jsonb);
select set_config('test.free_sale', (select id from public.vinted_sales where listing_title = 'Titolo libero')::text, true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000003602',true);
set local role authenticated;
select throws_ok($$select public.apply_vinted_sale(current_setting('test.free_sale')::bigint, '[{"slug":"vinted-top","quantity":1}]'::jsonb)$$,
  '42501','GD_VINTED_MANAGER_REQUIRED','an editor cannot apply a Vinted sale');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000003601',true);
set local role authenticated;
select throws_ok($$select public.apply_vinted_sale(current_setting('test.free_sale')::bigint, '[{"slug":"no-such-piece","quantity":1}]'::jsonb)$$,
  'P0002','GD_PRODUCT_NOT_FOUND','an unknown product is refused');
select lives_ok($$select public.dismiss_vinted_sale(current_setting('test.free_sale')::bigint, 'Prova')$$, 'the owner dismisses an email that was not a sale');
select is((select count(*)::int from public.vinted_sales where status = 'pending'), 0, 'the owner sees every sale, and none is left waiting');
reset role;

-- 20-22. Reading: managers see the sync, nobody else does -----------------------------
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000003603',true);
set local role authenticated;
select is((select count(*)::int from public.vinted_sales), 0, 'a customer sees no Vinted sale');
select is((select count(*)::int from public.inbound_emails), 0, 'a customer sees no inbound email');
reset role;
select is((select stock_quantity from public.products where slug='vinted-top'), 3, 'a dismissed sale leaves the shelf alone');

-- 23-24. An unreleased drop counts its pieces in its pre-order allocation, as Stripe does ---
select public.ingest_inbound_email('resend-4','Vinted <no-reply@vinted.it>','Hai venduto un articolo su Vinted','body',true,
  '{"buyer_username":"acquirente04","listing_title":"Vinted Drop 4-50FF","item_count":1,"amount_cents":2300}'::jsonb);
select public.auto_apply_vinted_sale((select id from public.vinted_sales where listing_title = 'Vinted Drop 4-50FF'), '[{"slug":"vinted-drop","quantity":1}]'::jsonb);
select results_eq($$select preorder_allocation, stock_quantity from public.products where slug='vinted-drop'$$,
  $$values (2, 0)$$, 'a Vinted sale of an unreleased drop takes one from its allocation');
select results_eq($$select (lines -> 0 ->> 'taken')::int from public.vinted_sales where listing_title = 'Vinted Drop 4-50FF'$$,
  $$values (1)$$, 'and records the piece as taken');

select * from finish();
rollback;
