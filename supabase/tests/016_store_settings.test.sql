begin;
select plan(30);
select has_column('public','shipping_methods','enabled_country_codes','shipping areas are typed');
select has_column('public','shipping_methods','estimate_min_days','shipping minimum estimate exists');
select has_column('public','shipping_methods','estimate_max_days','shipping maximum estimate exists');
select has_column('public','site_settings','store_name','store identity exists');
select has_column('public','site_settings','support_email','support contact exists');
select has_column('public','site_settings','maintenance_mode','maintenance flag exists');
select has_column('public','site_settings','upload_max_bytes','upload limit exists');
select has_column('public','site_settings','default_seo_title','default SEO exists');
select has_column('public','site_settings','instagram_url','social settings exist');
select has_function('public','set_order_acceptance',array['boolean','text'],'owner activation RPC exists');

select throws_ok($$insert into public.shipping_methods(code,name,price_cents,estimate_min_days,estimate_max_days) values('bad-range','Bad',100,8,2)$$,'23514',null,'invalid delivery estimate is rejected');
select throws_ok($$insert into public.shipping_methods(code,name,price_cents,enabled_country_codes) values('bad-area','Bad',100,array['Italy'])$$,'23514',null,'invalid country area is rejected');
select throws_ok($$update public.site_settings set support_email='not-an-email' where singleton$$,'23514',null,'invalid email is rejected');
select throws_ok($$update public.site_settings set instagram_url='javascript:bad' where singleton$$,'23514',null,'non-HTTPS social URL is rejected');

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token) values
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000001601','authenticated','authenticated','settings-owner@example.com','',now(),'{}','{}',now(),now(),'','','',''),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000001602','authenticated','authenticated','settings-admin@example.com','',now(),'{}','{}',now(),now(),'','','',''),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000001603','authenticated','authenticated','settings-editor@example.com','',now(),'{}','{}',now(),now(),'','','','');
insert into public.staff_profiles(user_id,role,display_name) values
('00000000-0000-0000-0000-000000001601','owner','Settings Owner'),('00000000-0000-0000-0000-000000001602','admin','Settings Admin'),('00000000-0000-0000-0000-000000001603','editor','Settings Editor');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001602',true); set local role authenticated;
select lives_ok($$insert into public.shipping_methods(code,name,description,price_cents,free_from_cents,enabled_country_codes,estimate_min_days,estimate_max_days,active,sort_order) values('settings-standard','Standard','Consegna nazionale',500,5000,array['IT'],2,5,true,10)$$,'admin manages shipping');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001603',true); set local role authenticated;
select throws_ok($$insert into public.shipping_methods(code,name,price_cents) values('editor-forbidden','No',100)$$,'42501','new row violates row-level security policy for table "shipping_methods"','editor cannot manage shipping');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001602',true); set local role authenticated;
select lives_ok($$update public.site_settings set store_name='Admin forbidden' where singleton$$,'admin update is safely filtered by RLS');
reset role;
select results_eq($$select store_name from public.site_settings where singleton$$,array['GEAR//DROP'::text],'admin cannot change seeded owner settings');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001601',true); set local role authenticated;
select lives_ok($$update public.site_settings set store_name='GEAR//DROP',legal_name='GearDrop Srl',support_email='support@example.com',default_seo_title='GearDrop' where singleton$$,'owner manages typed settings');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001602',true); set local role authenticated;
select throws_ok($$select public.set_order_acceptance(true,'ATTIVA ORDINI')$$,'42501','GD_ORDER_OWNER_REQUIRED','admin cannot activate orders');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001601',true); set local role authenticated;
select throws_ok($$select public.set_order_acceptance(true,'attiva')$$,'22023','GD_ORDER_CONFIRMATION_INVALID','activation requires exact confirmation');
select throws_ok($$select public.set_order_acceptance(true,'ATTIVA ORDINI')$$,'55000','GD_ORDER_CHECKLIST_INCOMPLETE','incomplete checklist blocks activation');
reset role;

insert into public.categories(slug,name,tagline,description,active,publication_status,published_at) values('settings-cat','Settings','Settings','Settings',true,'published',now());
insert into public.products(category_id,slug,sku,name,tagline,description,price_cents,publication_status,active,stock_quantity)
values((select id from public.categories where slug='settings-cat'),'settings-product','settings-product','Settings Product','Settings','Settings',1000,'published',true,2);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001601',true); set local role authenticated;
update public.order_enablement_checks set status='passed',evidence='Prerequisito verificato nel fixture',verified_at=now(),verified_by='00000000-0000-0000-0000-000000001601';
select lives_ok($$select public.set_order_acceptance(true,'ATTIVA ORDINI')$$,'owner activates only after live checklist passes');
reset role;
select results_eq($$select accept_orders from public.site_settings where singleton$$,array[true],'order acceptance is enabled');
select results_eq($$select count(*)::bigint from public.order_enablement_checks where status='passed'$$,array[14::bigint],'all checklist items are passed');
select results_eq($$select count(*)::bigint from public.audit_events where action='store.order_acceptance_changed'$$,array[1::bigint],'activation is audited');

select set_config('request.jwt.claim.sub','',true); set local role anon;
select lives_ok($$select store_name,accept_orders,support_email from public.site_settings where singleton$$,'anonymous reads only public store configuration');
select throws_ok($$select updated_by from public.site_settings where singleton$$,'42501','permission denied for table site_settings','anonymous cannot read internal actor identity');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001601',true); set local role authenticated;
select lives_ok($$select public.set_order_acceptance(false,'DISATTIVA ORDINI')$$,'owner can disable orders with exact confirmation');
reset role;
select results_eq($$select accept_orders from public.site_settings where singleton$$,array[false],'order acceptance is disabled');
select * from finish();
rollback;
