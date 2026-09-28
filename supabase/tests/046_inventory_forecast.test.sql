-- The demand forecast: units sold from paid orders' movements over 7/30/90 days, a daily rate
-- weighted toward the last week, days of cover, and a reorder that counts pre-orders to serve
-- and goods already on a draft goods receipt.
begin;
select plan(9);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000004601', 'authenticated', 'authenticated',
  'forecast-owner@example.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000004602', 'authenticated', 'authenticated',
  'forecast-editor@example.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
insert into public.staff_profiles (user_id, role, display_name) values
  ('00000000-0000-0000-0000-000000004601', 'owner', 'Forecast owner'),
  ('00000000-0000-0000-0000-000000004602', 'editor', 'Forecast editor');
insert into public.organization_members (organization_id, user_id, role)
select id, '00000000-0000-0000-0000-000000004601'::uuid, 'owner'::public.staff_role from public.organizations where slug = 'geardrop'
union all
select id, '00000000-0000-0000-0000-000000004602'::uuid, 'editor'::public.staff_role from public.organizations where slug = 'geardrop'
on conflict (organization_id, user_id) do update set role = excluded.role, active = true;

create temporary table fx (name text primary key, id bigint not null) on commit drop;
grant select on fx to authenticated;

do $fixture$
declare
  geardrop bigint := (select id from public.organizations where slug = 'geardrop');
  v_category bigint;
  v_product bigint;
  v_order bigint;
  v_supplier bigint;
  v_receipt bigint;
begin
  insert into public.categories (organization_id, slug, name, tagline, description)
  values (geardrop, 'forecast-category', 'Forecast', 't', 'd') returning id into v_category;
  insert into public.products (organization_id, category_id, slug, sku, name, tagline, description, price_cents, stock_quantity)
  values (geardrop, v_category, 'forecast-bey', 'FORECAST-BEY', 'Forecast bey', 't', 'd', 1500, 20)
  returning id into v_product;
  insert into public.orders (organization_id, order_number, email, status, payment_status, subtotal_cents, shipping_cents,
    total_cents, shipping_method_code, shipping_address_snapshot, billing_address_snapshot, idempotency_key)
  values (geardrop, 'GD-FORECAST-1', 'buyer@example.com', 'confirmed', 'paid', 1500, 0, 1500, 'standard', '{}', '{}', gen_random_uuid())
  returning id into v_order;
  -- 7 units in the last week, 23 more over the month, 30 more before: 7 / 30 / 60 sold.
  insert into public.inventory_movements (product_id, delta, stock_after, reason, order_id, created_at) values
    (v_product, -7, 20, 'order_reserved', v_order, now() - interval '2 days'),
    (v_product, -23, 27, 'order_reserved', v_order, now() - interval '20 days'),
    (v_product, -30, 50, 'order_reserved', v_order, now() - interval '60 days'),
    (v_product, -5, 80, 'order_reserved', v_order, now() - interval '120 days');
  -- Three units sold as pre-order wait for goods; four are already on a draft document.
  insert into public.order_items (order_id, product_id, product_name_snapshot, sku_snapshot, quantity, unit_price_cents,
    line_total_cents, image_src_snapshot, preorder_quantity, reservation_kind)
  values (v_order, v_product, 'Forecast bey', 'FORECAST-BEY', 3, 500, 1500, '/p.webp', 3, 'preorder');
  insert into public.suppliers (organization_id, name, country_code, vat_regime)
  values (geardrop, 'Forecast supplier', 'ES', 'intra_ue') returning id into v_supplier;
  insert into public.supplier_receipts (organization_id, supplier_id, document_kind, document_number, document_date, vat_regime)
  values (geardrop, v_supplier, 'invoice', 'FC-1', current_date, 'intra_ue') returning id into v_receipt;
  insert into public.supplier_receipt_lines (organization_id, receipt_id, product_id, quantity, unit_cost_cents)
  values (geardrop, v_receipt, v_product, 4, 650);
  insert into public.inventory_cost_state (product_id, organization_id, average_cost_cents, source)
  values (v_product, geardrop, 650, 'manual');
  insert into fx values ('geardrop', geardrop), ('product', v_product);
end;
$fixture$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000004601","role":"authenticated"}', true);
set local role authenticated;

create temporary view forecast_row as
  select * from public.get_inventory_forecast((select id from fx where name = 'geardrop'), 14, 45)
  where product_id = (select id from fx where name = 'product');

select results_eq(
  $$select sold_7, sold_30, sold_90 from forecast_row$$,
  $$values (7, 30, 60)$$,
  'units sold are counted over the last 7, 30 and 90 days only'
);
-- 0.5 × 7/7 + 0.3 × 30/30 + 0.2 × 60/90 = 0.5 + 0.3 + 0.133 = 0.933
select is((select daily_rate from forecast_row), 0.933, 'the daily rate weighs the last week most');
select is((select trend from forecast_row), 1.00, 'the trend compares the week with the month');
select is((select days_of_cover from forecast_row), 21.4, 'days of cover = stock / daily rate');
select is((select stockout_date from forecast_row), current_date + 21, 'the stock runs out on the projected day');
select is((select reorder_point from forecast_row), 14, 'the reorder point covers the lead time');
-- ceil(0.933 × 59) = 56, + 3 pre-orders − 20 in stock − 4 incoming = 35
select is((select suggested_reorder from forecast_row), 35, 'the reorder counts pre-orders to serve and goods already coming');
select is((select reorder_cost_cents from forecast_row), 22750::bigint, 'the reorder is priced at the average cost');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000004602","role":"authenticated"}', true);
select throws_ok(
  $$select * from public.get_inventory_forecast((select id from fx where name = 'geardrop'))$$,
  '42501', 'GD_WAREHOUSE_MANAGER_REQUIRED', 'an editor has no forecast: it carries costs'
);

select * from finish();
rollback;
