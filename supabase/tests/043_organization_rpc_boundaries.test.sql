-- Every RPC acts inside one company, without the legacy shortcuts. Both companies hold a product
-- with the same slug and SKU and a coupon with the same code, so a lookup that forgot the company
-- would pick the wrong row.
begin;
select plan(36);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email, '', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
from (values
  ('00000000-0000-0000-0000-000000004301'::uuid, 'rpc-owner-both@example.com'),
  ('00000000-0000-0000-0000-000000004302'::uuid, 'rpc-owner-oryvenne@example.com'),
  ('00000000-0000-0000-0000-000000004303'::uuid, 'rpc-editor-geardrop@example.com'),
  ('00000000-0000-0000-0000-000000004304'::uuid, 'rpc-invitee@example.com')
) as people(id, email);

insert into public.staff_profiles (user_id, role, display_name) values
  ('00000000-0000-0000-0000-000000004301', 'owner', 'Owner both'),
  ('00000000-0000-0000-0000-000000004302', 'owner', 'Owner Oryvenne'),
  ('00000000-0000-0000-0000-000000004303', 'editor', 'Editor Gear Drop');

insert into public.organization_members (organization_id, user_id, role)
select organization.id, member.user_id, member.role::public.staff_role
from (values
  ('geardrop', '00000000-0000-0000-0000-000000004301'::uuid, 'owner'),
  ('oryvenne', '00000000-0000-0000-0000-000000004301'::uuid, 'owner'),
  ('oryvenne', '00000000-0000-0000-0000-000000004302'::uuid, 'owner'),
  ('geardrop', '00000000-0000-0000-0000-000000004303'::uuid, 'editor')
) as member(slug, user_id, role)
join public.organizations as organization on organization.slug = member.slug;

create temporary table fx (org_slug text not null, tbl text not null, id bigint not null) on commit drop;
create temporary table org (slug text primary key, id bigint not null) on commit drop;
insert into org select slug, id from public.organizations;

do $fixture$
declare
  company record;
  v_category bigint; v_product bigint; v_bundle bigint; v_coupon bigint; v_order bigint;
  v_media bigint; v_section bigint;
begin
  for company in select id, slug from public.organizations order by id loop
    insert into public.categories (organization_id, slug, name, tagline, description, active, publication_status, published_at)
    values (company.id, 'rpc-category', 'RPC', 't', 'd', true, 'published', now())
    returning id into v_category;
    insert into public.products (organization_id, category_id, slug, sku, name, tagline, description, price_cents,
      publication_status, active, stock_quantity)
    values (company.id, v_category, 'rpc-product', 'rpc-product', 'RPC product', 't', 'd', 1000, 'published', true, 10)
    returning id into v_product;
    insert into public.product_images (product_id, src, width, height, alt, published, is_primary)
    values (v_product, '/products/rpc.webp', 800, 800, 'RPC', true, true);
    insert into public.shipping_methods (organization_id, code, name, price_cents, active)
    values (company.id, 'rpc-ship', 'Corriere', 400, true);
    insert into public.coupons (organization_id, code, discount_kind, discount_value, active)
    values (company.id, 'RPC10', 'percentage', case when company.slug = 'geardrop' then 10 else 50 end, true)
    returning id into v_coupon;
    insert into public.bundles (organization_id, slug, eyebrow, title_line_one, title_line_two, description,
      price_cents, compare_at_price_cents, hero_product_id, active)
    values (company.id, 'rpc-bundle', 'e', 'a', 'b', 'd', 1000, 1200, v_product, false)
    returning id into v_bundle;
    insert into public.bundle_items (bundle_id, product_id, quantity) values (v_bundle, v_product, 1);
    insert into public.orders (organization_id, order_number, email, status, payment_status, subtotal_cents,
      shipping_cents, total_cents, shipping_method_code, shipping_address_snapshot, billing_address_snapshot, idempotency_key)
    values (company.id, 'RPC-' || upper(company.slug), 'buyer@example.com', 'confirmed', 'paid', 1000, 0, 1000,
      'rpc-ship', '{}', '{}', gen_random_uuid())
    returning id into v_order;
    insert into public.media_assets (organization_id, object_path, original_filename, mime_type, byte_size, width, height, alt_text, uploaded_by)
    values (company.id, 'rpc/' || company.slug || '.webp', 'rpc.webp', 'image/webp', 100, 10, 10, 'RPC', '00000000-0000-0000-0000-000000004301')
    returning id into v_media;
    insert into public.homepage_sections (organization_id, section_key, section_type, title, sort_order)
    values (company.id, 'rpc-section', 'hero', 'RPC', 950)
    returning id into v_section;
    insert into fx values
      (company.slug, 'categories', v_category), (company.slug, 'products', v_product), (company.slug, 'bundles', v_bundle),
      (company.slug, 'coupons', v_coupon), (company.slug, 'orders', v_order), (company.slug, 'media_assets', v_media),
      (company.slug, 'homepage_sections', v_section);
  end loop;
end;
$fixture$;

insert into public.products (organization_id, category_id, slug, sku, name, tagline, description, price_cents, publication_status, active, stock_quantity)
select organization.id, category.id, 'rpc-oryvenne-only', 'rpc-oryvenne-only', 'Only at Oryvenne', 't', 'd', 500, 'published', true, 5
from public.organizations as organization
join fx as category on category.org_slug = organization.slug and category.tbl = 'categories'
where organization.slug = 'oryvenne';

update public.site_settings set accept_orders = true where organization_id = (select id from org where slug = 'geardrop');

grant select on fx, org to anon, authenticated, service_role;

create function pg_temp.fx_id(p_slug text, p_table text) returns bigint language sql stable as $$
  select id from fx where org_slug = p_slug and tbl = p_table;
$$;

-- ---------------------------------------------------------------------------------------
-- An owner of Oryvenne only is nobody at Gear Drop.
-- ---------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000004302","role":"authenticated"}', true);
set local role authenticated;

select throws_ok($$select public.transition_order_status(pg_temp.fx_id('geardrop', 'orders'), 'processing')$$,
  '42501', 'GD_ORDER_MANAGER_REQUIRED', 'another company''s order cannot move');
select throws_ok($$select public.record_order_refund(pg_temp.fx_id('geardrop', 'orders'), 100, 'x', 're_rpc')$$,
  '42501', 'GD_ORDER_MANAGER_REQUIRED', 'another company''s order cannot be refunded');
select throws_ok($$select public.delete_product_permanently(pg_temp.fx_id('geardrop', 'products'), 'RPC product')$$,
  '42501', 'GD_PRODUCT_MANAGER_REQUIRED', 'another company''s product cannot be deleted');
select throws_ok($$select public.replace_product_details(pg_temp.fx_id('geardrop', 'products'), '[]', '[]', '[]')$$,
  '42501', 'GD_PRODUCT_STAFF_REQUIRED', 'another company''s product details cannot be replaced');
select throws_ok($$select public.begin_media_delete(pg_temp.fx_id('geardrop', 'media_assets'))$$,
  '42501', 'GD_MEDIA_MANAGER_REQUIRED', 'another company''s media cannot be deleted');
select throws_ok($$select public.publish_homepage_section(pg_temp.fx_id('geardrop', 'homepage_sections'))$$,
  '42501', 'GD_CMS_STAFF_REQUIRED', 'another company''s homepage cannot be published');
select throws_ok($$select public.duplicate_coupon_with_targets(pg_temp.fx_id('geardrop', 'coupons'))$$,
  '42501', 'GD_COUPON_MANAGER_REQUIRED', 'another company''s coupon cannot be copied');
select throws_ok($$select public.get_admin_dashboard_metrics((select id from org where slug = 'geardrop'))$$,
  '42501', 'GD_DASHBOARD_STAFF_REQUIRED', 'another company''s dashboard is closed');
select throws_ok($$select * from public.read_funnel_stats((select id from org where slug = 'geardrop'), 7)$$,
  '42501', 'GD_ORDER_MANAGER_REQUIRED', 'another company''s funnel is closed');
select throws_ok($$select public.adjust_inventory((select id from org where slug = 'geardrop'), 'rpc-product', 1, 'manual_adjustment')$$,
  '42501', 'GD_INVENTORY_MANAGER_REQUIRED', 'another company''s stock cannot be adjusted');
select throws_ok(
  $$select public.save_bundle_with_items((select id from org where slug = 'geardrop'),
    jsonb_build_object('slug', 'planted', 'eyebrow', 'e', 'title_line_one', 'a', 'title_line_two', 'b', 'description', 'd',
      'price_cents', 100, 'compare_at_price_cents', 200, 'hero_product_id', pg_temp.fx_id('geardrop', 'products')),
    jsonb_build_array(jsonb_build_object('product_id', pg_temp.fx_id('geardrop', 'products'), 'quantity', 1, 'sort_order', 0)))$$,
  '42501', 'GD_BUNDLE_STAFF_REQUIRED', 'no bundle can be created in another company');
select throws_ok($$select public.set_order_acceptance((select id from org where slug = 'geardrop'), false, 'DISATTIVA ORDINI')$$,
  '42501', 'GD_ORDER_OWNER_REQUIRED', 'another company''s order intake cannot be switched');
select throws_ok(
  $$select public.record_staff_invite((select id from org where slug = 'geardrop'), '00000000-0000-0000-0000-000000004304', 'x@example.com', 'X', 'admin')$$,
  '42501', 'GD_STAFF_OWNER_REQUIRED', 'nobody can be invited into another company');
select is_empty($$select * from public.get_inventory_restock_demand((select id from org where slug = 'geardrop'), array['rpc-product'])$$,
  'another company''s restock demand stays empty');
select throws_ok($$select public.revoke_staff_access('00000000-0000-0000-0000-000000004303')$$,
  '42501', 'GD_STAFF_OWNER_REQUIRED', 'only an owner of a company the person works for may revoke them');
reset role;

-- ---------------------------------------------------------------------------------------
-- An owner of both companies: the company named must match the rows, and writes land in it.
-- ---------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000004301","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$select public.save_bundle_with_items((select id from org where slug = 'oryvenne'),
    jsonb_build_object('id', pg_temp.fx_id('geardrop', 'bundles'), 'slug', 'rpc-bundle', 'eyebrow', 'e', 'title_line_one', 'a',
      'title_line_two', 'b', 'description', 'd', 'price_cents', 1000, 'compare_at_price_cents', 1200,
      'hero_product_id', pg_temp.fx_id('oryvenne', 'products')),
    jsonb_build_array(jsonb_build_object('product_id', pg_temp.fx_id('oryvenne', 'products'), 'quantity', 1, 'sort_order', 0)))$$,
  'P0002', 'GD_BUNDLE_NOT_FOUND', 'a Gear Drop bundle is not found when Oryvenne is named');
select throws_ok(
  $$select public.save_coupon_with_targets((select id from org where slug = 'oryvenne'),
    jsonb_build_object('code', 'CROSS', 'discount_kind', 'percentage', 'discount_value', 5, 'free_shipping', false,
      'minimum_subtotal_cents', 0, 'first_purchase_only', false, 'active', true),
    array[pg_temp.fx_id('geardrop', 'products')], null, null)$$,
  '23503', 'GD_COUPON_TARGET_NOT_FOUND', 'an Oryvenne coupon cannot target a Gear Drop product');
select lives_ok($$select public.adjust_inventory((select id from org where slug = 'oryvenne'), 'rpc-product', 3, 'manual_adjustment', 'Carico')$$,
  'stock is adjusted by SKU inside the company named');
reset role;

select results_eq(
  $$select organization.slug, product.stock_quantity from public.products as product
    join public.organizations as organization on organization.id = product.organization_id
    where product.slug = 'rpc-product' order by organization.slug$$,
  $$values ('geardrop'::text, 10), ('oryvenne'::text, 13)$$,
  'the same SKU at Gear Drop is untouched'
);
select results_eq(
  $$select organization_id from public.inventory_movements where note = 'Carico'$$,
  $$select id from org where slug = 'oryvenne'$$,
  'the stock movement belongs to Oryvenne'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000004301","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$select public.save_bundle_with_items((select id from org where slug = 'oryvenne'),
    jsonb_build_object('slug', 'rpc-new-bundle', 'eyebrow', 'e', 'title_line_one', 'a', 'title_line_two', 'b', 'description', 'd',
      'price_cents', 900, 'compare_at_price_cents', 1100, 'hero_product_id', pg_temp.fx_id('oryvenne', 'products')),
    jsonb_build_array(jsonb_build_object('product_id', pg_temp.fx_id('oryvenne', 'products'), 'quantity', 2, 'sort_order', 0)))$$,
  'a bundle is created in the company named'
);
select lives_ok($$select public.change_staff_role((select id from org where slug = 'oryvenne'), '00000000-0000-0000-0000-000000004302', 'admin')$$,
  'a role changes in one company');
reset role;

select results_eq(
  $$select bundle.organization_id = item.organization_id and bundle.organization_id = (select id from org where slug = 'oryvenne')
    from public.bundles as bundle join public.bundle_items as item on item.bundle_id = bundle.id
    where bundle.slug = 'rpc-new-bundle'$$,
  $$values (true)$$,
  'the new bundle and its items belong to Oryvenne'
);
select results_eq(
  $$select member.role::text from public.organization_members as member
    where member.user_id = '00000000-0000-0000-0000-000000004302' order by member.organization_id$$,
  $$values ('admin'::text)$$,
  'the Oryvenne role changed and nothing appeared elsewhere'
);

-- ---------------------------------------------------------------------------------------
-- The public shop.
-- ---------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok(
  $$select public.calculate_cart_pricing(jsonb_build_array(jsonb_build_object('product_id', pg_temp.fx_id('oryvenne', 'products'), 'quantity', 1)), null, null, 'rpc-ship')$$,
  'P0001', 'GD_PRICING_PRODUCT_UNAVAILABLE', 'a buyer cannot price a company without a public shop'
);
select throws_ok(
  $$select public.calculate_cart_pricing(jsonb_build_array(
      jsonb_build_object('product_id', pg_temp.fx_id('geardrop', 'products'), 'quantity', 1),
      jsonb_build_object('product_id', pg_temp.fx_id('oryvenne', 'products'), 'quantity', 1)), null, null, 'rpc-ship')$$,
  '22023', 'GD_PRICING_INVALID_LINES', 'a cart cannot span two companies'
);
select results_eq(
  $$select (public.calculate_cart_pricing(jsonb_build_array(jsonb_build_object('product_id', pg_temp.fx_id('geardrop', 'products'), 'quantity', 1)), 'RPC10', null, 'rpc-ship') ->> 'coupon_id')::bigint$$,
  $$select pg_temp.fx_id('geardrop', 'coupons')$$,
  'a coupon code is read in the shop of the cart, not in the other company'
);
select throws_ok(
  $$select public.create_order('buyer@example.com', null, '{}', '{}',
    jsonb_build_array(jsonb_build_object('product_id', pg_temp.fx_id('oryvenne', 'products'), 'quantity', 1)), null, 'rpc-ship', gen_random_uuid())$$,
  '22023', 'GD_ORDER_INVALID_PAYLOAD', 'nobody orders from a company without a public shop'
);
select lives_ok(
  $$select public.create_order('buyer@example.com', null, '{}', '{}',
    jsonb_build_array(jsonb_build_object('product_id', pg_temp.fx_id('geardrop', 'products'), 'quantity', 1)), null, 'rpc-ship',
    '00000000-0000-4000-8000-000000004399')$$,
  'a Gear Drop order is taken'
);
select throws_ok(
  $$select public.request_restock_notice('rpc-oryvenne-only', 'waiting@example.com')$$,
  '22023', 'GD_RESTOCK_PRODUCT_NOT_FOUND', 'the shop cannot be asked about another company''s products'
);
reset role;

select results_eq(
  $$select organization_id = (select id from org where slug = 'geardrop'), order_number like 'GD-%'
    from public.orders where idempotency_key = '00000000-0000-4000-8000-000000004399'$$,
  $$values (true, true)$$,
  'the order belongs to Gear Drop and carries its prefix'
);

set local role service_role;
select throws_ok(
  $$select * from public.record_stripe_checkout_order('cs_test_rpcboundary0001', 'pi_rpc', 'GD-RPC-STRIPE', 'buyer@example.com', null,
    '{}', jsonb_build_array(jsonb_build_object('slug', 'rpc-product', 'name', 'RPC product', 'quantity', 1, 'unit_price_cents', 1000)),
    0, null, 0, null, (select id from org where slug = 'oryvenne'))$$,
  '22023', 'GD_STRIPE_ORDER_INVALID_PAYLOAD', 'Stripe records orders only in a public shop'
);
select lives_ok(
  $$select * from public.record_stripe_checkout_order('cs_test_rpcboundary0002', 'pi_rpc', 'GD-RPC-STRIPE', 'buyer@example.com', null,
    '{}', jsonb_build_array(jsonb_build_object('slug', 'rpc-product', 'name', 'RPC product', 'quantity', 2, 'unit_price_cents', 1000)),
    0, null)$$,
  'Stripe records an order in the one public shop by default'
);
reset role;

select results_eq(
  $$select organization.slug, product.stock_quantity from public.products as product
    join public.organizations as organization on organization.id = product.organization_id
    where product.slug = 'rpc-product' order by organization.slug$$,
  $$values ('geardrop'::text, 7), ('oryvenne'::text, 13)$$,
  'Stripe and order intake take stock from the Gear Drop product only'
);

-- Oryvenne gets its own prefix once it opens a shop.
update public.organizations set storefront_public = true where slug = 'oryvenne';
update public.site_settings set accept_orders = true where organization_id = (select id from org where slug = 'oryvenne');
create temporary table oryvenne_order on commit drop as
select public.create_order('buyer@example.com', null, '{}', '{}',
  jsonb_build_array(jsonb_build_object('product_id', pg_temp.fx_id('oryvenne', 'products'), 'quantity', 1)), null, 'rpc-ship', gen_random_uuid()) as id;
select results_eq(
  $$select order_number like 'OV-%' from public.orders where id = (select id from oryvenne_order)$$,
  $$values (true)$$,
  'an Oryvenne order carries the OV prefix'
);

select is_empty(
  $$
    select p.pronamespace::regnamespace::text || '.' || p.proname
    from pg_proc p
    where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
      and p.prosrc like '%has_staff_role%'
      and p.proname <> 'has_staff_role'
  $$,
  'no function authorizes through the global staff role'
);

select * from finish();
rollback;
