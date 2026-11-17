-- Warehouse at cost: goods receipts raise stock at their landed cost and move the weighted
-- average; every movement is valued; a reversal takes the goods out at the cost they came in
-- with; an order's profit is net of VAT and stays null while a cost is missing; costs are
-- owners' and admins' business, company by company.
begin;
select plan(55);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email, '', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
from (values
  ('00000000-0000-0000-0000-000000004501'::uuid, 'cost-owner@example.com'),
  ('00000000-0000-0000-0000-000000004502'::uuid, 'cost-admin@example.com'),
  ('00000000-0000-0000-0000-000000004503'::uuid, 'cost-editor@example.com'),
  ('00000000-0000-0000-0000-000000004504'::uuid, 'cost-oryvenne@example.com')
) as people(id, email);

insert into public.staff_profiles (user_id, role, display_name) values
  ('00000000-0000-0000-0000-000000004501', 'owner', 'Cost owner'),
  ('00000000-0000-0000-0000-000000004502', 'admin', 'Cost admin'),
  ('00000000-0000-0000-0000-000000004503', 'editor', 'Cost editor'),
  ('00000000-0000-0000-0000-000000004504', 'owner', 'Cost Oryvenne');

insert into public.organization_members (organization_id, user_id, role)
select organization.id, member.user_id, member.role::public.staff_role
from (values
  ('geardrop', '00000000-0000-0000-0000-000000004501'::uuid, 'owner'),
  ('geardrop', '00000000-0000-0000-0000-000000004502'::uuid, 'admin'),
  ('geardrop', '00000000-0000-0000-0000-000000004503'::uuid, 'editor'),
  ('oryvenne', '00000000-0000-0000-0000-000000004504'::uuid, 'owner')
) as member(slug, user_id, role)
join public.organizations as organization on organization.slug = member.slug
on conflict (organization_id, user_id) do update set role = excluded.role, active = true;

create temporary table fx (name text primary key, id bigint not null) on commit drop;
grant select on fx to authenticated, service_role;

do $fixture$
declare
  geardrop bigint := (select id from public.organizations where slug = 'geardrop');
  oryvenne bigint := (select id from public.organizations where slug = 'oryvenne');
  v_category bigint;
  v_oryvenne_category bigint;
begin
  insert into public.categories (organization_id, slug, name, tagline, description)
  values (geardrop, 'cost-category', 'Costi', 't', 'd') returning id into v_category;
  insert into public.categories (organization_id, slug, name, tagline, description)
  values (oryvenne, 'cost-category', 'Costi', 't', 'd') returning id into v_oryvenne_category;
  with created as (
    insert into public.products (organization_id, category_id, slug, sku, name, tagline, description, price_cents, stock_quantity)
    values
      (geardrop, v_category, 'cost-p1', 'COST-P1', 'Costo uno', 't', 'd', 1500, 0),
      (geardrop, v_category, 'cost-p2', 'COST-P2', 'Costo due', 't', 'd', 1500, 0),
      (geardrop, v_category, 'cost-p3', 'COST-P3', 'Costo tre', 't', 'd', 2000, 0),
      (geardrop, v_category, 'cost-deck', 'COST-DECK', 'Porta deck', 't', 'd', 1450, 9999)
    returning id, slug
  )
  insert into fx select replace(slug, 'cost-', ''), id from created;
  with created as (
    insert into public.products (organization_id, category_id, slug, sku, name, tagline, description, price_cents, stock_quantity)
    values (oryvenne, v_oryvenne_category, 'cost-p1', 'COST-P1', 'Costo Oryvenne', 't', 'd', 1500, 0)
    returning id
  )
  insert into fx select 'oryvenne_product', id from created;
  insert into public.shipping_methods (organization_id, code, name, price_cents, active, cost_cents)
  values (geardrop, 'cost-ship', 'Corriere costi', 490, true, 400);
  insert into fx values ('geardrop', geardrop), ('oryvenne', oryvenne);
end;
$fixture$;

-- ---------------------------------------------------------------------------------------
-- Schema.
-- ---------------------------------------------------------------------------------------

select has_table('public', 'suppliers', 'suppliers exist');
select has_table('public', 'supplier_receipts', 'goods receipts exist');
select has_table('public', 'supplier_receipt_lines', 'goods receipt lines exist');
select has_table('public', 'inventory_cost_state', 'the weighted average cost has a home');
select has_table('public', 'inventory_movement_costs', 'movement costs live apart from the movements');
select has_column('public', 'orders', 'vat_rate_bp', 'orders keep their VAT rate');
select col_not_null('public', 'orders', 'vat_rate_bp', 'every order has a VAT rate');
select is(
  (select count(*)::integer from public.orders where vat_rate_bp <> 2200),
  0,
  'orders placed before the column keep the Italian 22%'
);

-- ---------------------------------------------------------------------------------------
-- An owner of Gear Drop opens a supplier and two documents.
-- ---------------------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000004501","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$insert into public.suppliers (organization_id, name, country_code, vat_number, vat_regime)
    values ((select id from fx where name = 'geardrop'), 'Distribuidora Madrid', 'ES', 'ESB12345678', 'intra_ue')$$,
  'an owner registers a Spanish supplier'
);
select throws_ok(
  $$insert into public.suppliers (organization_id, name, country_code, vat_regime)
    values ((select id from fx where name = 'geardrop'), ' distribuidora madrid ', 'ES', 'intra_ue')$$,
  '23505', null, 'a supplier name is unique in the company, whatever the case'
);
select throws_ok(
  $$insert into public.suppliers (organization_id, name, country_code, vat_regime)
    values ((select id from fx where name = 'oryvenne'), 'Planted', 'ES', 'intra_ue')$$,
  '42501', null, 'no supplier can be planted in a company the owner does not work for'
);

reset role;
insert into fx select 'supplier', id from public.suppliers where name = 'Distribuidora Madrid';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000004501","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$select public.save_supplier_receipt(
    (select id from fx where name = 'geardrop'),
    jsonb_build_object('supplier_id', (select id from fx where name = 'supplier'), 'document_kind', 'invoice',
      'document_number', 'FV-2026-001', 'document_date', '2026-09-20', 'freight_cents', 700),
    jsonb_build_array(
      jsonb_build_object('product_id', (select id from fx where name = 'p1'), 'quantity', 10, 'unit_cost_cents', 650),
      jsonb_build_object('product_id', (select id from fx where name = 'p2'), 'quantity', 4, 'unit_cost_cents', 650)))$$,
  'a draft document is saved with its lines'
);
select throws_ok(
  $$select public.save_supplier_receipt(
    (select id from fx where name = 'geardrop'),
    jsonb_build_object('supplier_id', (select id from fx where name = 'supplier'), 'document_kind', 'invoice',
      'document_number', 'fv-2026-001 ', 'document_date', '2026-09-21'),
    jsonb_build_array(jsonb_build_object('product_id', (select id from fx where name = 'p1'), 'quantity', 1, 'unit_cost_cents', 1)))$$,
  '23505', null, 'the same supplier document cannot be loaded twice'
);
select throws_ok(
  $$select public.save_supplier_receipt(
    (select id from fx where name = 'geardrop'),
    jsonb_build_object('supplier_id', (select id from fx where name = 'supplier'), 'document_kind', 'invoice',
      'document_number', 'FV-CROSS', 'document_date', '2026-09-21'),
    jsonb_build_array(jsonb_build_object('product_id', (select id from fx where name = 'oryvenne_product'), 'quantity', 1, 'unit_cost_cents', 1)))$$,
  '23503', null, 'a line cannot carry a product of another company'
);

reset role;
insert into fx select 'receipt_a', id from public.supplier_receipts where document_number = 'FV-2026-001';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000004501","role":"authenticated"}', true);
set local role authenticated;

select is(
  public.confirm_supplier_receipt((select id from fx where name = 'receipt_a')) ->> 'value_cents',
  '9800',
  'confirming values the document at goods plus freight'
);
select results_eq(
  $$select allocated_costs_cents, landed_total_cents, landed_unit_cost_cents from public.supplier_receipt_lines
    where receipt_id = (select id from fx where name = 'receipt_a') order by sort_order$$,
  $$values (500, 7000::bigint, 700), (200, 2800::bigint, 700)$$,
  'freight follows the value of each line and the last line takes the rounding'
);
select results_eq(
  $$select stock_quantity from public.products where id in ((select id from fx where name = 'p1'), (select id from fx where name = 'p2')) order by sku$$,
  $$values (10), (4)$$,
  'the goods are in stock'
);
select is(
  (select average_cost_cents from public.inventory_cost_state where product_id = (select id from fx where name = 'p1')),
  700,
  'the first load sets the average at the landed cost'
);
select is(
  (select count(*)::integer from public.inventory_movements movement
   join public.inventory_movement_costs cost on cost.movement_id = movement.id
   where movement.reason = 'receipt' and cost.unit_cost_cents = 700 and cost.source = 'receipt'
     and movement.receipt_line_id is not null),
  2,
  'each line enters as a movement valued at its landed cost'
);
select throws_ok(
  $$select public.confirm_supplier_receipt((select id from fx where name = 'receipt_a'))$$,
  '55000', 'GD_RECEIPT_NOT_DRAFT', 'a document is confirmed once'
);
select throws_ok(
  $$delete from public.supplier_receipt_lines where receipt_id = (select id from fx where name = 'receipt_a')$$,
  '42501', null, 'lines are never edited by hand'
);
select is_empty(
  $$delete from public.supplier_receipts where id = (select id from fx where name = 'receipt_a') returning id$$,
  'a confirmed document cannot be thrown away'
);

select lives_ok(
  $$select public.confirm_supplier_receipt(public.save_supplier_receipt(
    (select id from fx where name = 'geardrop'),
    jsonb_build_object('supplier_id', (select id from fx where name = 'supplier'), 'document_kind', 'delivery_note',
      'document_number', 'DDT-77', 'document_date', '2026-09-25'),
    jsonb_build_array(jsonb_build_object('product_id', (select id from fx where name = 'p1'), 'quantity', 10, 'unit_cost_cents', 900))))$$,
  'a second document is loaded and confirmed'
);
select is(
  (select average_cost_cents from public.inventory_cost_state where product_id = (select id from fx where name = 'p1')),
  800,
  'the average weighs what was on the shelf and what arrived'
);
select is(
  (select last_cost_cents from public.inventory_cost_state where product_id = (select id from fx where name = 'p1')),
  900,
  'the last cost is the latest landed cost'
);
select is(
  (select value_cents from public.inventory_valuation where product_id = (select id from fx where name = 'p1')),
  16000::bigint,
  'the warehouse value is stock times average cost'
);

-- A made-to-order product keeps a counter, not a quantity: its average is the price paid.
select lives_ok(
  $$select public.confirm_supplier_receipt(public.save_supplier_receipt(
    (select id from fx where name = 'geardrop'),
    jsonb_build_object('supplier_id', (select id from fx where name = 'supplier'), 'document_kind', 'invoice',
      'document_number', 'FV-DECK', 'document_date', '2026-09-25'),
    jsonb_build_array(jsonb_build_object('product_id', (select id from fx where name = 'deck'), 'quantity', 5, 'unit_cost_cents', 1400))))$$,
  'goods for a made-to-order product are loaded'
);
select is(
  (select average_cost_cents from public.inventory_cost_state where product_id = (select id from fx where name = 'deck')),
  1400,
  'a no-limit counter never weighs on the average'
);
select is(
  (select value_cents from public.inventory_valuation where product_id = (select id from fx where name = 'deck')),
  0::bigint,
  'a no-limit counter adds nothing to the warehouse value'
);

-- ---------------------------------------------------------------------------------------
-- A paid order takes two pieces: valued at the average of its moment.
-- ---------------------------------------------------------------------------------------

reset role;
do $order$
declare
  v_order bigint;
begin
  insert into public.orders (organization_id, order_number, email, status, payment_status, subtotal_cents,
    shipping_cents, total_cents, shipping_method_code, shipping_address_snapshot, billing_address_snapshot, idempotency_key)
  values ((select id from fx where name = 'geardrop'), 'GD-COST-1', 'buyer@example.com', 'confirmed', 'paid', 3000, 0, 3000,
    'cost-ship', '{}', '{}', gen_random_uuid())
  returning id into v_order;
  update public.products set stock_quantity = 18 where id = (select id from fx where name = 'p1');
  insert into public.inventory_movements (product_id, delta, stock_after, reason, order_id)
  values ((select id from fx where name = 'p1'), -2, 18, 'order_reserved', v_order);
  insert into fx values ('order', v_order);
end;
$order$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000004502","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select cost.unit_cost_cents from public.inventory_movement_costs cost
   join public.inventory_movements movement on movement.id = cost.movement_id
   where movement.order_id = (select id from fx where name = 'order')),
  800,
  'the sale is valued at the average of its moment'
);
select results_eq(
  $$select revenue_net_cents, cost_of_goods_cents, shipping_cost_cents, profit_cents, missing
    from public.order_profit where order_id = (select id from fx where name = 'order')$$,
  $$values (2459::bigint, 1600::bigint, 400, null::bigint, array['payment_fee'])$$,
  'without the payment fee the profit stays unknown and says why'
);
select lives_ok(
  $$select public.set_order_costs((select id from fx where name = 'order'), '{"payment_fee_cents": 70}')$$,
  'an admin records the payment fee'
);
select results_eq(
  $$select profit_cents, missing from public.order_profit where order_id = (select id from fx where name = 'order')$$,
  $$values (389::bigint, array[]::text[])$$,
  'profit = net revenue - goods - courier - fee - packaging'
);
select is(
  (select payment_fee_source from public.orders where id = (select id from fx where name = 'order')),
  'manual',
  'a fee typed by staff is marked manual'
);
select is(
  (public.get_warehouse_summary((select id from fx where name = 'geardrop'), 30) ->> 'profit_cents')::bigint,
  389::bigint,
  'the overview adds up complete orders'
);
select throws_ok(
  $$select public.set_product_cost((select id from fx where name = 'geardrop'), (select id from fx where name = 'p3'), 1200, 'apertura')$$,
  '42501', 'GD_COST_OWNER_REQUIRED', 'only an owner sets a cost by hand'
);
select throws_ok(
  $$select public.record_order_payment_fee((select id from fx where name = 'order'), 1)$$,
  '42501', null, 'only the payment webhook records Stripe fees'
);
select throws_ok(
  $$select public.set_organization_cost_defaults((select id from fx where name = 'geardrop'), 2200, 50)$$,
  '42501', 'GD_COST_OWNER_REQUIRED', 'only an owner changes the company''s cost defaults'
);

-- ---------------------------------------------------------------------------------------
-- Stripe fee from the webhook never overwrites a manual one.
-- ---------------------------------------------------------------------------------------

reset role;
set local role service_role;
select lives_ok(
  $$select public.record_order_payment_fee((select id from fx where name = 'order'), 999)$$,
  'the webhook records a fee'
);
reset role;
select is(
  (select payment_fee_cents from public.orders where id = (select id from fx where name = 'order')),
  70,
  'the fee staff typed stays'
);

-- ---------------------------------------------------------------------------------------
-- Reversal and opening cost.
-- ---------------------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000004501","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$select public.reverse_supplier_receipt((select id from public.supplier_receipts where document_number = 'DDT-77'), 'x')$$,
  '22023', 'GD_RECEIPT_REVERSAL_REASON_REQUIRED', 'a reversal needs a reason'
);
select lives_ok(
  $$select public.reverse_supplier_receipt((select id from public.supplier_receipts where document_number = 'DDT-77'), 'Merce errata, resa al fornitore')$$,
  'a confirmed document is reversed with a reason'
);
select results_eq(
  $$select product.stock_quantity, state.average_cost_cents from public.products product
    join public.inventory_cost_state state on state.product_id = product.id
    where product.id = (select id from fx where name = 'p1')$$,
  $$values (8, 675)$$,
  'the goods leave at the cost they came in with and the average follows'
);
select throws_ok(
  $$select public.reverse_supplier_receipt((select id from fx where name = 'receipt_a'), 'Errore di carico')$$,
  '23514', 'GD_RECEIPT_STOCK_ALREADY_SOLD', 'goods already sold cannot be sent back on paper'
);
select is(
  (select status::text from public.supplier_receipts where document_number = 'DDT-77'),
  'reversed',
  'the document is marked reversed'
);

select lives_ok(
  $$select public.adjust_inventory((select id from fx where name = 'geardrop'), 'COST-P3', 5, 'manual_adjustment', 'Scaffale')$$,
  'goods of unknown cost are counted'
);
select is(
  (select count(*)::integer from public.inventory_movements movement
   where movement.product_id = (select id from fx where name = 'p3')
     and not exists (select 1 from public.inventory_movement_costs cost where cost.movement_id = movement.id)),
  1,
  'a movement without a known cost stays unvalued'
);
select is(
  public.set_product_cost((select id from fx where name = 'geardrop'), (select id from fx where name = 'p3'), 1200, 'Costo di apertura'),
  1,
  'the opening cost values the past movements that had none'
);
select lives_ok(
  $$select public.set_organization_cost_defaults((select id from fx where name = 'geardrop'), 2200, 50)$$,
  'an owner sets packaging per order'
);
select is(
  (select profit_cents from public.order_profit where order_id = (select id from fx where name = 'order')),
  339::bigint,
  'the packaging default lowers every profit that uses it'
);

-- ---------------------------------------------------------------------------------------
-- Editors and other companies see no cost.
-- ---------------------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000004503","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select count(*)::integer from public.suppliers) + (select count(*)::integer from public.supplier_receipts)
    + (select count(*)::integer from public.inventory_cost_state) + (select count(*)::integer from public.inventory_movement_costs)
    + (select count(*)::integer from public.order_profit),
  0,
  'an editor reads no supplier, document, cost or profit'
);
select throws_ok(
  $$select public.get_warehouse_summary((select id from fx where name = 'geardrop'))$$,
  '42501', 'GD_WAREHOUSE_MANAGER_REQUIRED', 'an editor has no warehouse overview'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000004504","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select count(*)::integer from public.suppliers) + (select count(*)::integer from public.inventory_cost_state)
    + (select count(*)::integer from public.order_profit),
  0,
  'an owner of Oryvenne alone sees nothing of Gear Drop'
);
select throws_ok(
  $$select public.confirm_supplier_receipt((select id from fx where name = 'receipt_a'))$$,
  '42501', 'GD_WAREHOUSE_MANAGER_REQUIRED', 'another company''s document cannot be touched'
);
reset role;

-- New orders take the company's VAT rate.
update public.organizations set default_vat_rate_bp = 1000 where slug = 'oryvenne';
insert into public.orders (organization_id, order_number, email, status, payment_status, subtotal_cents,
  shipping_cents, total_cents, shipping_method_code, shipping_address_snapshot, billing_address_snapshot, idempotency_key)
values ((select id from fx where name = 'oryvenne'), 'OV-COST-1', 'buyer@example.com', 'confirmed', 'paid', 1000, 0, 1000,
  'none', '{}', '{}', gen_random_uuid());
select is(
  (select vat_rate_bp from public.orders where order_number = 'OV-COST-1'),
  1000,
  'a new order snapshots its company''s VAT rate'
);

select * from finish();
rollback;
