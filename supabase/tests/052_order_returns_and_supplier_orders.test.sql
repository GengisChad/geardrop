-- Resi e ordini ai fornitori: un pezzo integro torna in vendita, uno rovinato resta registrato senza
-- muovere lo stock, mai più pezzi resi che venduti; una bozza di carico si segna come ordinata con
-- la data di arrivo e si può togliere.
begin;
select plan(10);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000005201', 'authenticated',
  'authenticated', 'returns-owner@example.com', '', now(), '{"provider":"email","providers":["email"]}', '{}',
  now(), now(), '', '', '', '');
insert into public.staff_profiles (user_id, role, display_name)
values ('00000000-0000-0000-0000-000000005201', 'owner', 'Returns owner');
insert into public.organization_members (organization_id, user_id, role)
select organization.id, '00000000-0000-0000-0000-000000005201', 'owner'
from public.organizations as organization where organization.slug = 'geardrop'
on conflict (organization_id, user_id) do update set role = excluded.role, active = true;

create temporary table fx (name text primary key, id bigint not null) on commit drop;
grant select on fx to authenticated;

do $fixture$
declare
  geardrop bigint := (select id from public.organizations where slug = 'geardrop');
  v_product bigint;
  v_order bigint;
  v_open bigint;
  v_supplier bigint;
begin
  select id into v_product from public.products
  where organization_id = geardrop and manage_stock order by id limit 1;
  insert into fx values ('geardrop', geardrop), ('product', v_product),
    ('stock', (select stock_quantity from public.products where id = v_product));

  insert into public.orders (organization_id, order_number, email, status, payment_status, subtotal_cents,
    shipping_cents, total_cents, shipping_method_code, shipping_address_snapshot, billing_address_snapshot,
    idempotency_key)
  values (geardrop, 'GD-RESO-1', 'reso@example.com', 'shipped', 'paid', 3000, 0, 3000, 'standard', '{}', '{}',
    gen_random_uuid())
  returning id into v_order;
  insert into public.order_items (order_id, product_id, product_name_snapshot, sku_snapshot, quantity,
    unit_price_cents, line_total_cents, image_src_snapshot)
  values (v_order, v_product, 'Bey reso', 'RESO-BEY', 2, 1500, 3000, '/p.webp');
  insert into fx values ('order', v_order);

  insert into public.orders (organization_id, order_number, email, status, payment_status, subtotal_cents,
    shipping_cents, total_cents, shipping_method_code, shipping_address_snapshot, billing_address_snapshot,
    idempotency_key)
  values (geardrop, 'GD-RESO-2', 'aperto@example.com', 'confirmed', 'paid', 1500, 0, 1500, 'standard', '{}', '{}',
    gen_random_uuid())
  returning id into v_open;
  insert into public.order_items (order_id, product_id, product_name_snapshot, sku_snapshot, quantity,
    unit_price_cents, line_total_cents, image_src_snapshot)
  values (v_open, v_product, 'Bey aperto', 'RESO-BEY', 1, 1500, 1500, '/p.webp');
  insert into fx values ('open', v_open);

  insert into public.suppliers (organization_id, name, country_code, vat_regime)
  values (geardrop, 'Fornitore resi 052', 'ES', 'intra_ue')
  returning id into v_supplier;
  insert into fx values ('supplier', v_supplier);
end;
$fixture$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000005201","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$select public.record_order_return((select id from fx where name = 'order'),
    jsonb_build_array(jsonb_build_object('product_id', (select id from fx where name = 'product'), 'quantity', 1, 'restock', true)))$$,
  'an owner records a sellable piece sent back'
);
select is(
  (select stock_quantity from public.products where id = (select id from fx where name = 'product')),
  ((select id from fx where name = 'stock') + 1)::integer,
  'the sellable piece is back on sale'
);
select lives_ok(
  $$select public.record_order_return((select id from fx where name = 'order'),
    jsonb_build_array(jsonb_build_object('product_id', (select id from fx where name = 'product'), 'quantity', 1, 'restock', false)),
    'graffiato')$$,
  'a damaged piece is recorded too'
);
select is(
  (select stock_quantity from public.products where id = (select id from fx where name = 'product')),
  ((select id from fx where name = 'stock') + 1)::integer,
  'a damaged piece does not change the stock'
);
select throws_ok(
  $$select public.record_order_return((select id from fx where name = 'order'),
    jsonb_build_array(jsonb_build_object('product_id', (select id from fx where name = 'product'), 'quantity', 1)))$$,
  '23514', 'GD_RETURN_TOO_MANY', 'never more pieces back than were sold'
);
select throws_ok(
  $$select public.record_order_return((select id from fx where name = 'open'),
    jsonb_build_array(jsonb_build_object('product_id', (select id from fx where name = 'product'), 'quantity', 1)))$$,
  '55000', 'GD_RETURN_NOT_SHIPPED', 'an order not shipped yet has nothing to return'
);

reset role;
select is(
  (select count(*)::integer from public.audit_events
   where action = 'order.return_recorded' and entity_id = (select id from fx where name = 'order')::text),
  2,
  'every return is in the audit log'
);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000005201","role":"authenticated"}', true);
set local role authenticated;

select public.save_supplier_receipt(
  (select id from fx where name = 'geardrop'),
  jsonb_build_object('supplier_id', (select id from fx where name = 'supplier'), 'document_kind', 'invoice',
    'document_number', 'ORD-052', 'document_date', '2026-11-18'),
  jsonb_build_array(jsonb_build_object('product_id', (select id from fx where name = 'product'), 'quantity', 6, 'unit_cost_cents', 800)));

select lives_ok(
  $$select public.mark_supplier_receipt_ordered(
    (select id from public.supplier_receipts where document_number = 'ORD-052'), '2026-12-01'::date)$$,
  'an owner marks a draft as ordered from the supplier'
);
select ok(
  (select ordered_at is not null and expected_on = '2026-12-01'::date from public.supplier_receipts where document_number = 'ORD-052'),
  'the order keeps when it was sent and the day it is expected'
);
select public.mark_supplier_receipt_ordered(
  (select id from public.supplier_receipts where document_number = 'ORD-052'), null, false);
select ok(
  (select ordered_at is null and expected_on is null from public.supplier_receipts where document_number = 'ORD-052'),
  'a withdrawn order is a plain draft again'
);

select * from finish();
rollback;
