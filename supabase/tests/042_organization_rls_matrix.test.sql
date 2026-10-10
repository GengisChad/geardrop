-- Company isolation, table by table, without the legacy shortcuts: every fixture row names its
-- company, every person reaches a company only through a membership.
--
-- Oryvenne's fixture rows are all "published" and "active": the only thing that keeps them
-- from anonymous visitors is that Oryvenne has no public shop. Gear Drop's fixture rows are
-- drafts, so staff see them only through membership.
begin;
select plan(12);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email, '', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
from (values
  ('00000000-0000-0000-0000-000000004201'::uuid, 'rls-owner-both@example.com'),
  ('00000000-0000-0000-0000-000000004202'::uuid, 'rls-owner-oryvenne@example.com'),
  ('00000000-0000-0000-0000-000000004203'::uuid, 'rls-editor-geardrop@example.com'),
  ('00000000-0000-0000-0000-000000004204'::uuid, 'rls-customer@example.com')
) as people(id, email);

insert into public.staff_profiles (user_id, role, display_name) values
  ('00000000-0000-0000-0000-000000004201', 'owner', 'Owner both'),
  ('00000000-0000-0000-0000-000000004202', 'owner', 'Owner Oryvenne'),
  ('00000000-0000-0000-0000-000000004203', 'editor', 'Editor Gear Drop');

insert into public.organization_members (organization_id, user_id, role)
select organization.id, member.user_id, member.role::public.staff_role
from (values
  ('geardrop', '00000000-0000-0000-0000-000000004201'::uuid, 'owner'),
  ('oryvenne', '00000000-0000-0000-0000-000000004201'::uuid, 'owner'),
  ('oryvenne', '00000000-0000-0000-0000-000000004202'::uuid, 'owner'),
  ('geardrop', '00000000-0000-0000-0000-000000004203'::uuid, 'editor')
) as member(slug, user_id, role)
join public.organizations as organization on organization.slug = member.slug;

insert into public.customer_profiles (user_id, organization_id, display_name)
select '00000000-0000-0000-0000-000000004204', id, 'Customer' from public.organizations where slug = 'geardrop';
insert into public.customer_addresses (customer_id, label, recipient_name, line_one, city, province, postal_code)
values ('00000000-0000-0000-0000-000000004204', 'Casa', 'Customer', 'Via Roma 1', 'Milano', 'MI', '20121');

create temporary table fx (org_slug text not null, tbl text not null, id bigint not null) on commit drop;

do $fixture$
declare
  company record;
  looks_public boolean;
  status public.publication_status;
  v_category bigint; v_product bigint; v_bundle bigint; v_coupon bigint; v_promotion bigint;
  v_order bigint; v_media bigint; v_section bigint; v_menu bigint; v_column bigint;
  v_social bigint; v_page bigint; v_shipping bigint; v_restock bigint; v_movement bigint;
  v_redemption bigint;
begin
  for company in select id, slug from public.organizations order by id loop
    looks_public := company.slug = 'oryvenne';
    status := case when looks_public then 'published' else 'draft' end;

    insert into public.categories (organization_id, slug, name, tagline, description, active, publication_status, published_at)
    values (company.id, 'rls-category', 'RLS', 't', 'd', looks_public, status, case when looks_public then now() end)
    returning id into v_category;
    insert into public.products (organization_id, category_id, slug, sku, name, tagline, description, price_cents, publication_status, active)
    values (company.id, v_category, 'rls-product', 'rls-product', 'RLS product', 't', 'd', 1000, status, looks_public)
    returning id into v_product;
    insert into public.product_images (product_id, src, width, height, alt, published, is_primary)
    values (v_product, '/products/rls.webp', 800, 800, 'RLS', true, true);
    insert into public.product_specs (product_id, label, value) values (v_product, 'Tipo', 'Test');
    insert into public.product_tags (product_id, tag) values (v_product, 'novita');

    insert into public.media_assets (organization_id, object_path, original_filename, mime_type, byte_size, width, height, alt_text, uploaded_by)
    values (company.id, 'rls/' || company.slug || '.webp', 'rls.webp', 'image/webp', 100, 10, 10, 'RLS', '00000000-0000-0000-0000-000000004201')
    returning id into v_media;

    insert into public.bundles (organization_id, slug, eyebrow, title_line_one, title_line_two, description, price_cents, compare_at_price_cents, hero_product_id, active)
    values (company.id, 'rls-bundle', 'e', 'a', 'b', 'd', 1000, 1200, v_product, looks_public)
    returning id into v_bundle;
    insert into public.bundle_items (bundle_id, product_id, quantity) values (v_bundle, v_product, 1);

    insert into public.coupons (organization_id, code, discount_kind, discount_value) values (company.id, 'RLS10', 'percentage', 10)
    returning id into v_coupon;
    insert into public.coupon_products (coupon_id, product_id) values (v_coupon, v_product);
    insert into public.promotions (organization_id, name, discount_kind, discount_value, active)
    values (company.id, 'RLS promo', 'percentage', 5, looks_public)
    returning id into v_promotion;
    insert into public.promotion_products (promotion_id, product_id) values (v_promotion, v_product);

    insert into public.orders (organization_id, order_number, email, subtotal_cents, shipping_cents, total_cents,
      shipping_method_code, shipping_address_snapshot, billing_address_snapshot, idempotency_key)
    values (company.id, 'RLS-' || upper(company.slug), 'buyer@example.com', 1000, 0, 1000, 'rls-ship', '{}', '{}', gen_random_uuid())
    returning id into v_order;
    insert into public.order_items (order_id, product_id, quantity, unit_price_cents, line_total_cents, product_name_snapshot, sku_snapshot, image_src_snapshot)
    values (v_order, v_product, 1, 1000, 1000, 'RLS product', 'rls-product', '');
    insert into public.order_notes (order_id, note) values (v_order, 'Nota');
    insert into public.order_status_events (order_id, to_status) values (v_order, 'pending');
    insert into public.inventory_movements (product_id, delta, stock_after, reason, order_id)
    values (v_product, -1, 0, 'order_reserved', v_order)
    returning id into v_movement;
    insert into public.coupon_redemptions (coupon_id, order_id, email_normalized, discount_cents)
    values (v_coupon, v_order, 'buyer@example.com', 100)
    returning id into v_redemption;

    insert into public.homepage_sections (organization_id, section_key, section_type, title, sort_order, publication_status, published_at, active)
    values (company.id, 'rls-section', 'featured_products', 'RLS', 900, status, case when looks_public then now() end, looks_public)
    returning id into v_section;
    insert into public.homepage_section_products (section_id, product_id, sort_order) values (v_section, v_product, 0);
    insert into public.navigation_menus (organization_id, menu_key, label, publication_status, published_at, active)
    values (company.id, 'rls-menu', 'Menu', status, case when looks_public then now() end, looks_public)
    returning id into v_menu;
    insert into public.navigation_items (menu_id, label, href, sort_order) values (v_menu, 'Negozio', '/negozio', 0);
    insert into public.footer_columns (organization_id, column_key, title, sort_order, publication_status, published_at, active)
    values (company.id, 'rls-column', 'Aiuto', 900, status, case when looks_public then now() end, looks_public)
    returning id into v_column;
    insert into public.footer_items (column_id, label, href, sort_order) values (v_column, 'Contatti', '/negozio', 0);
    insert into public.social_links (organization_id, platform_key, label, href, sort_order, publication_status, published_at, active)
    values (company.id, 'rls-social', 'Social', 'https://example.com/rls', 900, status, case when looks_public then now() end, looks_public)
    returning id into v_social;
    insert into public.content_pages (organization_id, slug, title, markdown_source, publication_status, published_at, active)
    values (company.id, 'rls-page', 'Pagina', '# RLS', status, case when looks_public then now() end, looks_public)
    returning id into v_page;
    insert into public.shipping_methods (organization_id, code, name, price_cents, active)
    values (company.id, 'rls-ship', 'Corriere', 400, looks_public)
    returning id into v_shipping;
    insert into public.restock_requests (organization_id, product_slug, email)
    values (company.id, 'rls-product', 'waiting@example.com')
    returning id into v_restock;
    insert into public.audit_events (action, entity_type, entity_id) values ('rls.fixture', 'products', v_product::text);
    insert into public.storefront_daily_events (organization_id, day, event, count) values (company.id, current_date - 400, 'product_view', 1);

    insert into fx (org_slug, tbl, id) values
      (company.slug, 'categories', v_category), (company.slug, 'products', v_product),
      (company.slug, 'bundles', v_bundle), (company.slug, 'coupons', v_coupon),
      (company.slug, 'promotions', v_promotion), (company.slug, 'orders', v_order),
      (company.slug, 'media_assets', v_media), (company.slug, 'homepage_sections', v_section),
      (company.slug, 'navigation_menus', v_menu), (company.slug, 'footer_columns', v_column),
      (company.slug, 'social_links', v_social), (company.slug, 'content_pages', v_page),
      (company.slug, 'shipping_methods', v_shipping), (company.slug, 'restock_requests', v_restock),
      (company.slug, 'inventory_movements', v_movement), (company.slug, 'coupon_redemptions', v_redemption);
  end loop;
end;
$fixture$;

-- How to find each table's fixture rows of one company. Roots by id, junctions and children by
-- their parent: never by organization_id alone, so the seeded public catalogue does not count.
create temporary table probe (tbl text primary key, sql text not null) on commit drop;
insert into probe (tbl, sql) values
  ('categories', 'select count(*) from public.categories where id in (select id from fx where tbl = ''categories'' and org_slug = $1)'),
  ('products', 'select count(*) from public.products where id in (select id from fx where tbl = ''products'' and org_slug = $1)'),
  ('product_images', 'select count(*) from public.product_images where product_id in (select id from fx where tbl = ''products'' and org_slug = $1)'),
  ('product_specs', 'select count(*) from public.product_specs where product_id in (select id from fx where tbl = ''products'' and org_slug = $1)'),
  ('product_tags', 'select count(*) from public.product_tags where product_id in (select id from fx where tbl = ''products'' and org_slug = $1)'),
  ('media_assets', 'select count(*) from public.media_assets where id in (select id from fx where tbl = ''media_assets'' and org_slug = $1)'),
  ('bundles', 'select count(*) from public.bundles where id in (select id from fx where tbl = ''bundles'' and org_slug = $1)'),
  ('bundle_items', 'select count(*) from public.bundle_items where bundle_id in (select id from fx where tbl = ''bundles'' and org_slug = $1)'),
  ('coupons', 'select count(*) from public.coupons where id in (select id from fx where tbl = ''coupons'' and org_slug = $1)'),
  ('coupon_products', 'select count(*) from public.coupon_products where coupon_id in (select id from fx where tbl = ''coupons'' and org_slug = $1)'),
  ('promotions', 'select count(*) from public.promotions where id in (select id from fx where tbl = ''promotions'' and org_slug = $1)'),
  ('promotion_products', 'select count(*) from public.promotion_products where promotion_id in (select id from fx where tbl = ''promotions'' and org_slug = $1)'),
  ('orders', 'select count(*) from public.orders where id in (select id from fx where tbl = ''orders'' and org_slug = $1)'),
  ('order_items', 'select count(*) from public.order_items where order_id in (select id from fx where tbl = ''orders'' and org_slug = $1)'),
  ('order_notes', 'select count(*) from public.order_notes where order_id in (select id from fx where tbl = ''orders'' and org_slug = $1)'),
  ('order_status_events', 'select count(*) from public.order_status_events where order_id in (select id from fx where tbl = ''orders'' and org_slug = $1)'),
  ('inventory_movements', 'select count(*) from public.inventory_movements where id in (select id from fx where tbl = ''inventory_movements'' and org_slug = $1)'),
  ('coupon_redemptions', 'select count(*) from public.coupon_redemptions where id in (select id from fx where tbl = ''coupon_redemptions'' and org_slug = $1)'),
  ('homepage_sections', 'select count(*) from public.homepage_sections where id in (select id from fx where tbl = ''homepage_sections'' and org_slug = $1)'),
  ('homepage_section_products', 'select count(*) from public.homepage_section_products where section_id in (select id from fx where tbl = ''homepage_sections'' and org_slug = $1)'),
  ('navigation_menus', 'select count(*) from public.navigation_menus where id in (select id from fx where tbl = ''navigation_menus'' and org_slug = $1)'),
  ('navigation_items', 'select count(*) from public.navigation_items where menu_id in (select id from fx where tbl = ''navigation_menus'' and org_slug = $1)'),
  ('footer_columns', 'select count(*) from public.footer_columns where id in (select id from fx where tbl = ''footer_columns'' and org_slug = $1)'),
  ('footer_items', 'select count(*) from public.footer_items where column_id in (select id from fx where tbl = ''footer_columns'' and org_slug = $1)'),
  ('social_links', 'select count(*) from public.social_links where id in (select id from fx where tbl = ''social_links'' and org_slug = $1)'),
  ('content_pages', 'select count(*) from public.content_pages where id in (select id from fx where tbl = ''content_pages'' and org_slug = $1)'),
  ('shipping_methods', 'select count(*) from public.shipping_methods where id in (select id from fx where tbl = ''shipping_methods'' and org_slug = $1)'),
  ('restock_requests', 'select count(*) from public.restock_requests where id in (select id from fx where tbl = ''restock_requests'' and org_slug = $1)'),
  ('audit_events', 'select count(*) from public.audit_events where action = ''rls.fixture'' and organization_id = (select id from public.organizations where slug = $1)'),
  ('storefront_daily_events', 'select count(*) from public.storefront_daily_events where day = current_date - 400 and organization_id = (select id from public.organizations where slug = $1)'),
  ('site_settings', 'select count(*) from public.site_settings where organization_id = (select id from public.organizations where slug = $1)'),
  ('order_enablement_checks', 'select count(*) from public.order_enablement_checks where organization_id = (select id from public.organizations where slug = $1)');

create function pg_temp.visible(p_table text, p_company text)
returns bigint
language plpgsql
as $$
declare
  seen bigint;
begin
  execute (select sql from probe where tbl = p_table) into seen using p_company;
  return seen;
exception when insufficient_privilege then
  -- No grant on the table at all: nothing is visible.
  return 0;
end;
$$;

grant select on fx, probe to anon, authenticated;

-- Tables every owner reads in full: the whole matrix except the funnel counters, which are
-- read only through an RPC.
create temporary view manager_tables as
select tbl from probe where tbl <> 'storefront_daily_events';
grant select on manager_tables to anon, authenticated;

-- Owner of both companies sees both.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000004201","role":"authenticated"}', true);
set local role authenticated;
select is_empty(
  $$select tbl from manager_tables where pg_temp.visible(tbl, 'geardrop') = 0 or pg_temp.visible(tbl, 'oryvenne') = 0$$,
  'an owner of both companies reads every table of both'
);
reset role;

-- Owner of Oryvenne only.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000004202","role":"authenticated"}', true);
set local role authenticated;
select is_empty(
  $$select tbl from manager_tables where tbl <> 'site_settings' and pg_temp.visible(tbl, 'geardrop') > 0$$,
  'an Oryvenne owner sees nothing of Gear Drop beyond its public shop settings'
);
select is_empty(
  $$select tbl from manager_tables where pg_temp.visible(tbl, 'oryvenne') = 0$$,
  'an Oryvenne owner reads every Oryvenne table'
);
select results_eq(
  $$with changed as (update public.products set name = 'Taken' where id in (select id from fx where tbl = 'products' and org_slug = 'geardrop') returning 1) select count(*)::integer from changed$$,
  array[0], 'an Oryvenne owner cannot change a Gear Drop product'
);
select results_eq(
  $$with removed as (delete from public.categories where id in (select id from fx where tbl = 'categories' and org_slug = 'geardrop') returning 1) select count(*)::integer from removed$$,
  array[0], 'an Oryvenne owner cannot delete a Gear Drop category'
);
select throws_ok(
  $$insert into public.categories (organization_id, slug, name, tagline, description)
    select id, 'planted', 'Planted', 't', 'd' from public.organizations where slug = 'geardrop'$$,
  '42501', null, 'an Oryvenne owner cannot create rows in Gear Drop'
);
select throws_ok(
  $$insert into public.product_specs (product_id, label, value)
    select id, 'Planted', 'x' from fx where tbl = 'products' and org_slug = 'geardrop'$$,
  '42501', null, 'an Oryvenne owner cannot add details to a Gear Drop product'
);
select throws_ok(
  $$insert into public.bundle_items (bundle_id, product_id, quantity)
    select bundle.id, product.id, 1
    from fx as bundle, fx as product
    where bundle.tbl = 'bundles' and bundle.org_slug = 'oryvenne'
      and product.tbl = 'products' and product.org_slug = 'geardrop'$$,
  '23503', null, 'an Oryvenne bundle cannot hold a Gear Drop product'
);
reset role;

-- Editor at Gear Drop.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000004203","role":"authenticated"}', true);
set local role authenticated;
select is_empty(
  $$select tbl from manager_tables where pg_temp.visible(tbl, 'oryvenne') > 0$$,
  'a Gear Drop editor sees nothing of Oryvenne, published or not'
);
reset role;

-- Anonymous visitors and customers.
set local role anon;
select is_empty(
  $$select tbl from manager_tables where pg_temp.visible(tbl, 'oryvenne') > 0$$,
  'an anonymous visitor sees nothing of Oryvenne even when its rows are published'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000004204","role":"authenticated"}', true);
set local role authenticated;
select is_empty(
  $$select tbl from manager_tables where pg_temp.visible(tbl, 'oryvenne') > 0$$,
  'a Gear Drop customer sees nothing of Oryvenne'
);
reset role;

select is_empty(
  $$
    select tablename || '.' || policyname
    from pg_policies
    where schemaname in ('public', 'storage')
      and tablename <> 'staff_profiles'
      and coalesce(qual, '') || coalesce(with_check, '') like '%has_staff_role%'
  $$,
  'no company data is authorized through the global staff role'
);

select * from finish();
rollback;
