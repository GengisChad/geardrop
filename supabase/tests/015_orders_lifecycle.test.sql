begin;
select plan(33);
select has_table('public','order_notes','order notes exist');
select has_table('public','order_status_events','order status events exist');
select has_function('public','create_order',array['text','text','jsonb','jsonb','jsonb','text','text','uuid'],'atomic order create exists');
select has_function('public','transition_order_status',array['bigint','order_status','text'],'status transition exists');
select has_function('public','cancel_order_and_restore_stock',array['bigint','text'],'atomic cancellation exists');
select has_function('public','set_order_tracking',array['bigint','text','text','text'],'tracking RPC exists');
select has_function('public','add_order_note',array['bigint','text'],'note RPC exists');
select has_function('public','prepare_order_refund',array['bigint','integer','text'],'refund preparation exists');

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token) values
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000001501','authenticated','authenticated','orders-admin@example.com','',now(),'{}','{}',now(),now(),'','','',''),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000001502','authenticated','authenticated','orders-editor@example.com','',now(),'{}','{}',now(),now(),'','','','');
insert into public.staff_profiles(user_id,role,display_name) values
('00000000-0000-0000-0000-000000001501','admin','Orders Admin'),('00000000-0000-0000-0000-000000001502','editor','Orders Editor');
insert into public.categories(slug,name,tagline,description,active,publication_status,published_at) values ('orders-cat','Orders','Orders','Orders',true,'published',now());
insert into public.products(category_id,slug,sku,name,tagline,description,price_cents,publication_status,active,stock_quantity)
values((select id from public.categories where slug='orders-cat'),'orders-product','orders-product','Original snapshot','Orders','Orders',1000,'published',true,5);
insert into public.shipping_methods(code,name,price_cents,active) values('orders-standard','Standard',500,true);
insert into public.coupons(code,discount_kind,discount_value,active) values('ORDER100','fixed',100,true);
update public.site_settings set accept_orders=true where singleton;

select lives_ok($$select public.create_order('guest@example.com',null,'{"recipient":"Guest"}','{"recipient":"Guest"}',jsonb_build_array(jsonb_build_object('product_id',(select id from public.products where sku='orders-product'),'quantity',2,'total_cents',1)),'order100','orders-standard','00000000-0000-0000-0000-000000001599')$$,'order is created from authoritative rows');
select results_eq($$select subtotal_cents,discount_cents,shipping_cents,total_cents from public.orders where email='guest@example.com'$$,$$select 2000::integer,100::integer,500::integer,2400::integer$$,'server recalculates all integer-cent totals');
select results_eq($$select stock_quantity from public.products where sku='orders-product'$$,array[3],'stock is reserved under lock');
select results_eq($$select product_name_snapshot,unit_price_cents,line_total_cents from public.order_items where order_id=(select id from public.orders where email='guest@example.com')$$,$$select 'Original snapshot'::text,1000::integer,2000::integer$$,'order line stores immutable snapshots');
select results_eq($$select shipping_address_snapshot->>'recipient' from public.orders where email='guest@example.com'$$,array['Guest'::text],'address is snapshotted');
update public.products set name='Changed later',price_cents=1999 where sku='orders-product';
select results_eq($$select product_name_snapshot,unit_price_cents from public.order_items where order_id=(select id from public.orders where email='guest@example.com')$$,$$select 'Original snapshot'::text,1000::integer$$,'product edits never rewrite historical lines');
select results_eq($$select public.create_order('guest@example.com',null,'{}','{}',jsonb_build_array(jsonb_build_object('product_id',(select id from public.products where sku='orders-product'),'quantity',1)),null,'orders-standard','00000000-0000-0000-0000-000000001599')$$,$$select id from public.orders where email='guest@example.com'$$,'idempotency returns original order');
select results_eq($$select count(*)::bigint from public.orders where email='guest@example.com'$$,array[1::bigint],'idempotency creates no duplicate');
select throws_ok($$select public.create_order('bad@example.com',null,'{}','{}','[{"product_id":9223372036854770000,"quantity":1}]',null,'orders-standard','00000000-0000-0000-0000-000000001598')$$,'P0001','GD_PRICING_PRODUCT_UNAVAILABLE','invalid cart rolls back order');
select results_eq($$select count(*)::bigint from public.orders where email='bad@example.com'$$,array[0::bigint],'failed order leaves no partial row');
select set_config('test.guest_order_id',(select id from public.orders where email='guest@example.com')::text,true);

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001501',true); set local role authenticated;
select lives_ok($$select public.transition_order_status((select id from public.orders where email='guest@example.com'),'confirmed','Confermato')$$,'manager confirms order');
select throws_ok($$select public.transition_order_status((select id from public.orders where email='guest@example.com'),'shipped',null)$$,'22023','GD_ORDER_INVALID_TRANSITION','invalid status jump is rejected');
select lives_ok($$select public.set_order_tracking((select id from public.orders where email='guest@example.com'),'GLS','TRACK-1','https://tracking.example/TRACK-1')$$,'manager stores tracking');
select lives_ok($$select public.add_order_note((select id from public.orders where email='guest@example.com'),'Nota interna')$$,'staff adds internal note');
reset role;
select throws_ok($$update public.order_notes set note='Mutata' where order_id=current_setting('test.guest_order_id')::bigint$$,'55000','GD_ORDER_HISTORY_IMMUTABLE','order notes are append-only');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001502',true); set local role authenticated;
select throws_ok($$select public.add_order_note(current_setting('test.guest_order_id')::bigint,'Nota editor')$$,'42501','GD_ORDER_MANAGER_REQUIRED','editor cannot append internal notes');
select throws_ok($$select public.set_order_tracking(current_setting('test.guest_order_id')::bigint,'GLS','FORBIDDEN',null)$$,'42501','GD_ORDER_MANAGER_REQUIRED','editor cannot change tracking');
select throws_ok($$select public.prepare_order_refund(current_setting('test.guest_order_id')::bigint,100,'Forbidden')$$,'42501','GD_ORDER_MANAGER_REQUIRED','editor cannot prepare refunds');
reset role;
update public.orders set payment_status='paid' where email='guest@example.com';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001501',true); set local role authenticated;
select lives_ok($$select public.prepare_order_refund((select id from public.orders where email='guest@example.com'),500,'Richiesta cliente')$$,'refund is prepared without payment call');
reset role;

select set_config('request.jwt.claim.sub','',true);
select lives_ok($$select public.create_order('cancel@example.com',null,'{}','{}',jsonb_build_array(jsonb_build_object('product_id',(select id from public.products where sku='orders-product'),'quantity',1)),null,'orders-standard','00000000-0000-0000-0000-000000001597')$$,'second order reserves stock');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001501',true); set local role authenticated;
select lives_ok($$select public.cancel_order_and_restore_stock((select id from public.orders where email='cancel@example.com'),'Annullato')$$,'cancellation restores stock atomically');
select results_eq($$select stock_quantity from public.products where sku='orders-product'$$,array[3],'cancellation restores exactly its reserved quantity');
select throws_ok($$select public.cancel_order_and_restore_stock((select id from public.orders where email='cancel@example.com'),'Ancora')$$,'22023','GD_ORDER_INVALID_TRANSITION','second cancellation cannot restore stock twice');
reset role;
select results_eq($$select count(*)::bigint from public.coupon_redemptions where order_id=(select id from public.orders where email='guest@example.com')$$,array[1::bigint],'coupon redemption is committed with order');
select results_eq($$select count(*)::bigint from public.audit_events where action in ('order.created','order.status_changed','order.cancelled','order.refund_prepared')$$,array[5::bigint],'order lifecycle is auditable');
select * from finish();
rollback;
