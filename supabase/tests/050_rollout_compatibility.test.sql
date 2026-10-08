-- The app built before organizations keeps working on this schema while the new app is deployed
-- (migration 20261008171016_keep_the_running_app_working_during_rollout.sql), and it gains
-- nobody any access: everything it does lands in the storefront company and passes that
-- company's role checks.
begin;
select no_plan();

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email, '', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
from (values
  ('00000000-0000-0000-0000-000000005001'::uuid, 'compat-owner-geardrop@example.com'),
  ('00000000-0000-0000-0000-000000005002'::uuid, 'compat-owner-oryvenne@example.com'),
  ('00000000-0000-0000-0000-000000005003'::uuid, 'compat-editor-geardrop@example.com'),
  ('00000000-0000-0000-0000-000000005004'::uuid, 'compat-customer@example.com')
) as people(id, email);

insert into public.staff_profiles (user_id, role, display_name) values
  ('00000000-0000-0000-0000-000000005001', 'owner', 'Compat owner Gear Drop'),
  ('00000000-0000-0000-0000-000000005002', 'owner', 'Compat owner Oryvenne'),
  ('00000000-0000-0000-0000-000000005003', 'editor', 'Compat editor Gear Drop');

insert into public.organization_members (organization_id, user_id, role)
select organization.id, member.user_id, member.role::public.staff_role
from (values
  ('geardrop', '00000000-0000-0000-0000-000000005001'::uuid, 'owner'),
  ('oryvenne', '00000000-0000-0000-0000-000000005002'::uuid, 'owner'),
  ('geardrop', '00000000-0000-0000-0000-000000005003'::uuid, 'editor')
) as member(slug, user_id, role)
join public.organizations as organization on organization.slug = member.slug;

create temporary table org (slug text primary key, id bigint not null) on commit drop;
insert into org select slug, id from public.organizations;
grant select on org to anon, authenticated;

-- Both companies have a settings row; the seed made Gear Drop's.
insert into public.site_settings (organization_id)
select id from org where slug = 'oryvenne'
on conflict (organization_id) do nothing;

insert into public.categories (organization_id, slug, name, tagline, description, active, publication_status, published_at)
select id, 'compat-category', 'Compat', 't', 'd', true, 'published', now() from org where slug = 'geardrop';
insert into public.products (organization_id, category_id, slug, sku, name, tagline, description, price_cents,
  publication_status, active, stock_quantity)
select organization.id, category.id, 'compat-product', 'COMPAT-PRODUCT', 'Compat product', 't', 'd', 1000, 'published', true, 4
from org as organization
join public.categories as category on category.organization_id = organization.id and category.slug = 'compat-category'
where organization.slug = 'geardrop';

-- ---------------------------------------------------------------------------------------
-- The pieces are in place, and transitional only.
-- ---------------------------------------------------------------------------------------
select has_column('public', 'site_settings', 'singleton', 'site_settings.singleton is back for the old app');
select results_eq(
  $$select organization_id from public.site_settings where singleton$$,
  $$select id from org where slug = 'geardrop'$$,
  'exactly one settings row is the singleton: the storefront company''s'
);
select is(
  (select singleton from public.site_settings where organization_id = (select id from org where slug = 'oryvenne')),
  null,
  'a company without a public storefront is not the singleton'
);

select is(
  (select count(*)::integer from pg_trigger
   where tgname = '_fill_storefront_organization' and not tgisinternal),
  20,
  'every table the old app knows fills a missing company'
);
select is_empty(
  $$
    select c.table_name
    from information_schema.columns as c
    join pg_class as rel on rel.relname = c.table_name and rel.relnamespace = 'public'::regnamespace
    join pg_trigger as t on t.tgrelid = rel.oid and t.tgname = '_fill_storefront_organization'
    where c.table_schema = 'public' and c.column_name = 'organization_id'
      and (c.is_nullable <> 'NO' or c.column_default is not null)
  $$,
  'the filled tables still require organization_id without a default, so the new app must name it'
);

create temporary table legacy_signature (signature text primary key) on commit drop;
insert into legacy_signature values
  ('public.adjust_inventory(text,integer,inventory_reason,text)'),
  ('public.change_staff_role(uuid,staff_role)'),
  ('public.get_admin_dashboard_metrics()'),
  ('public.get_inventory_restock_demand(text[])'),
  ('public.read_funnel_stats(integer)'),
  ('public.record_staff_invite(uuid,text,text,staff_role)'),
  ('public.save_bundle_with_items(jsonb,jsonb)'),
  ('public.save_coupon_with_targets(jsonb,bigint[],bigint[],bigint[])'),
  ('public.save_footer_configuration(jsonb)'),
  ('public.save_homepage_section(jsonb,bigint[])'),
  ('public.save_navigation_tree(jsonb)'),
  ('public.save_promotion_with_targets(jsonb,bigint[],bigint[],bigint[])'),
  ('public.set_manual_order_enablement_check(text,enablement_check_status,text)'),
  ('public.set_order_acceptance(boolean,text)'),
  ('public.set_staff_active(uuid,boolean)');

select is_empty(
  $$select signature from legacy_signature where to_regprocedure(signature) is null$$,
  'every signature the old app calls exists again'
);
select is_empty(
  $$
    select signature from legacy_signature
    where not pg_catalog.has_function_privilege('authenticated', to_regprocedure(signature), 'EXECUTE')
       or pg_catalog.has_function_privilege('anon', to_regprocedure(signature), 'EXECUTE')
       or pg_catalog.has_function_privilege('service_role', to_regprocedure(signature), 'EXECUTE')
  $$,
  'the old signatures are for staff sessions only, as before'
);
select is_empty(
  $$
    select signature from legacy_signature as legacy
    join pg_proc as p on p.oid = to_regprocedure(legacy.signature)
    where not p.prosecdef or not coalesce(p.proconfig @> array['search_path=""'], false)
  $$,
  'every old signature runs with an empty search path'
);

-- ---------------------------------------------------------------------------------------
-- Anonymous visitors: the old storefront finds its settings row.
-- ---------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select results_eq(
  $$select accept_orders, store_name is not null from public.site_settings where singleton$$,
  $$select accept_orders, store_name is not null from public.site_settings where organization_id = (select id from org where slug = 'geardrop')$$,
  'the old storefront''s singleton read returns the shop''s row'
);
reset role;

-- ---------------------------------------------------------------------------------------
-- A customer saving a profile the old way gets the shop's company.
-- ---------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000005004","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$insert into public.customer_profiles (user_id, display_name) values ('00000000-0000-0000-0000-000000005004', 'Compat buyer')$$,
  'the old profile insert, without a company, is accepted'
);
reset role;
select is(
  (select organization_id from public.customer_profiles where user_id = '00000000-0000-0000-0000-000000005004'),
  (select id from org where slug = 'geardrop'),
  'and the profile belongs to the shop'
);

-- ---------------------------------------------------------------------------------------
-- The shop's owner, through the old app.
-- ---------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000005001","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$insert into public.categories (slug, name, tagline, description, active) values ('compat-old-insert', 'Old', 't', 'd', false)$$,
  'an old insert without a company is accepted for the shop''s staff'
);
select is(
  (select organization_id from public.categories where slug = 'compat-old-insert'),
  (select id from org where slug = 'geardrop'),
  'and the row belongs to the shop'
);
select results_eq(
  $$with changed as (update public.site_settings set store_name = 'Gear Drop compat' where singleton returning organization_id)
    select organization_id from changed$$,
  $$select id from org where slug = 'geardrop'$$,
  'the old settings update by singleton changes exactly the shop''s row'
);
select is(
  public.get_admin_dashboard_metrics(),
  public.get_admin_dashboard_metrics((select id from org where slug = 'geardrop')),
  'the old dashboard call returns the shop''s metrics'
);
select results_eq(
  $$select * from public.read_funnel_stats(7)$$,
  $$select * from public.read_funnel_stats((select id from org where slug = 'geardrop'), 7)$$,
  'the old funnel call returns the shop''s funnel'
);
select is(
  public.adjust_inventory('COMPAT-PRODUCT', 2, 'manual_adjustment'),
  6,
  'the old stock adjustment, note omitted, moves the shop''s product'
);
select lives_ok(
  $$select public.set_order_acceptance(false, 'DISATTIVA ORDINI')$$,
  'the old order-intake switch works for the shop''s owner'
);
reset role;
select is(
  (select accept_orders from public.site_settings where organization_id = (select id from org where slug = 'geardrop')),
  false,
  'and it switched the shop''s intake'
);

-- ---------------------------------------------------------------------------------------
-- The owner of another company gains nothing at the shop through the old paths.
-- ---------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000005002","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$insert into public.categories (slug, name, tagline, description, active) values ('compat-planted', 'Planted', 't', 'd', false)$$,
  '42501', null,
  'an old insert from another company''s owner lands in the shop and is refused'
);
select is_empty(
  $$with changed as (update public.site_settings set store_name = 'Planted' where singleton returning 1)
    select * from changed$$,
  'the shop''s settings row is out of reach'
);
select throws_ok($$select public.get_admin_dashboard_metrics()$$,
  '42501', 'GD_DASHBOARD_STAFF_REQUIRED', 'the old dashboard call is closed to another company');
select throws_ok($$select public.set_order_acceptance(false, 'DISATTIVA ORDINI')$$,
  '42501', 'GD_ORDER_OWNER_REQUIRED', 'the old order-intake switch is closed to another company');
select throws_ok($$select public.adjust_inventory('COMPAT-PRODUCT', 1, 'manual_adjustment')$$,
  '42501', 'GD_INVENTORY_MANAGER_REQUIRED', 'the old stock adjustment is closed to another company');
select throws_ok(
  $$select public.record_staff_invite('00000000-0000-0000-0000-000000005004', 'x@example.com', 'X', 'admin')$$,
  '42501', 'GD_STAFF_OWNER_REQUIRED', 'nobody can be invited into the shop through the old call');
reset role;

-- ---------------------------------------------------------------------------------------
-- Roles inside the shop still hold: an editor cannot use an owner-only old call.
-- ---------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000005003","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.set_order_acceptance(false, 'DISATTIVA ORDINI')$$,
  '42501', 'GD_ORDER_OWNER_REQUIRED', 'the shop''s editor cannot switch intake through the old call');
reset role;

select * from finish();
rollback;
