-- Every business row now belongs to one company.
--
-- Tier A roots and tier B junctions get organization_id (see supabase/tests/044). Existing
-- rows are all Gear Drop's: the column is added with Gear Drop as a constant default, which
-- PostgreSQL applies without rewriting or updating a single row (no trigger fires, no
-- updated_at moves), and the default is dropped straight after. From then on every write
-- names its company:
--
-- - roots say it explicitly (the app, or the RPC that creates them);
-- - junctions and rows created under a parent inherit it from that parent in a BEFORE INSERT
--   trigger, and composite foreign keys (child_id, organization_id) -> (id, organization_id)
--   make a cross-company link impossible even when a caller names the wrong company;
-- - no row can ever move to another company.
--
-- Natural keys (slugs, SKUs, coupon codes, menu and section keys) become unique per company.
-- Order numbers stay unique everywhere and carry the company prefix.
begin;

-- ---------------------------------------------------------------------------------------
-- Generic triggers and lookups.
-- ---------------------------------------------------------------------------------------

create or replace function private.prevent_organization_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception using errcode = '55000', message = 'GD_ORGANIZATION_IMMUTABLE';
  end if;
  return new;
end;
$$;

-- BEFORE INSERT on rows created under a parent: takes the parent's company.
-- tg_argv[0] is the parent table, tg_argv[1] the column holding the parent id.
create or replace function private.inherit_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_id bigint := (to_jsonb(new) ->> tg_argv[1])::bigint;
  parent_organization bigint;
begin
  if parent_id is null then
    -- No parent to inherit from: the NOT NULL constraint reports the missing company.
    return new;
  end if;
  execute format('select organization_id from public.%I where id = $1', tg_argv[0])
    into parent_organization
    using parent_id;
  new.organization_id := parent_organization;
  return new;
end;
$$;

-- The company of any row, for the audit trail: its own organization_id, or its parent's for
-- tier C children.
create or replace function private.row_organization(p_table text, p_row jsonb)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result bigint;
begin
  if p_row ? 'organization_id' then
    return (p_row ->> 'organization_id')::bigint;
  end if;
  case p_table
    when 'product_specs', 'product_features', 'product_box_contents', 'product_tags' then
      select organization_id into result from public.products where id = (p_row ->> 'product_id')::bigint;
    when 'footer_items' then
      select organization_id into result from public.footer_columns where id = (p_row ->> 'column_id')::bigint;
    when 'navigation_items' then
      select organization_id into result from public.navigation_menus where id = (p_row ->> 'menu_id')::bigint;
    when 'order_notes', 'order_status_events' then
      select organization_id into result from public.orders where id = (p_row ->> 'order_id')::bigint;
    when 'customer_addresses' then
      select organization_id into result from public.customer_profiles where user_id = (p_row ->> 'customer_id')::uuid;
    else
      result := null;
  end case;
  return result;
end;
$$;

revoke all on function private.prevent_organization_change() from public;
revoke all on function private.inherit_organization() from public;
revoke all on function private.row_organization(text, jsonb) from public;

-- ---------------------------------------------------------------------------------------
-- The column, on every tier A and B table.
-- ---------------------------------------------------------------------------------------

do $scope$
declare
  geardrop bigint := (select id from public.organizations where slug = 'geardrop');
  target text;
begin
  if geardrop is null then
    raise exception using errcode = 'P0002', message = 'GD_GEARDROP_ORGANIZATION_MISSING';
  end if;

  foreach target in array array[
    -- tier A
    'site_settings', 'categories', 'products', 'bundles', 'coupons', 'promotions', 'orders',
    'customer_profiles', 'inventory_movements', 'restock_requests', 'shipping_methods',
    'media_assets', 'content_pages', 'homepage_sections', 'navigation_menus', 'footer_columns',
    'social_links', 'storefront_daily_events', 'order_enablement_checks', 'coupon_redemptions',
    -- tier B
    'order_items', 'bundle_items', 'product_relations', 'product_images',
    'coupon_products', 'coupon_categories', 'coupon_bundles',
    'promotion_products', 'promotion_categories', 'promotion_bundles',
    'homepage_section_products', 'homepage_section_categories', 'homepage_section_bundles'
  ] loop
    execute format(
      'alter table public.%I add column organization_id bigint not null default %s references public.organizations(id) on delete restrict',
      target, geardrop
    );
    execute format('alter table public.%I alter column organization_id drop default', target);
    execute format('create index %I on public.%I (organization_id)', target || '_organization_idx', target);
    execute format(
      'create trigger %I before update of organization_id on public.%I for each row execute function private.prevent_organization_change()',
      target || '_organization_immutable', target
    );
  end loop;

  -- Audit events: staff identity events (invites, role changes, logins) belong to no company.
  alter table public.audit_events add column organization_id bigint references public.organizations(id) on delete restrict;
  execute format('alter table public.audit_events alter column organization_id set default %s', geardrop);
  update public.audit_events set organization_id = default where entity_type <> 'staff_profiles';
  alter table public.audit_events alter column organization_id drop default;
  create index audit_events_organization_idx on public.audit_events (organization_id, created_at desc);
  create trigger audit_events_organization_immutable
    before update of organization_id on public.audit_events
    for each row execute function private.prevent_organization_change();
end;
$scope$;

-- Shortcuts for the RPCs that act on one order or one product.
create or replace function private.organization_of_order(p_order_id bigint)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select organization_id from public.orders where id = p_order_id;
$$;

create or replace function private.organization_of_product(p_product_id bigint)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select organization_id from public.products where id = p_product_id;
$$;

revoke all on function private.organization_of_order(bigint) from public;
revoke all on function private.organization_of_product(bigint) from public;

-- ---------------------------------------------------------------------------------------
-- Company-wide singletons become one row per company.
-- ---------------------------------------------------------------------------------------

alter table public.site_settings drop constraint site_settings_pkey;
alter table public.site_settings drop column singleton;
alter table public.site_settings add constraint site_settings_pkey primary key (organization_id);

insert into public.site_settings (organization_id, store_name, legal_name, accept_orders)
select id, name, name, false from public.organizations where slug = 'oryvenne'
on conflict (organization_id) do nothing;

grant select (organization_id) on public.site_settings to anon;
-- The admin creates products directly under RLS, naming the company.
grant insert (organization_id) on public.products to authenticated;

alter table public.order_enablement_checks drop constraint order_enablement_checks_pkey;
alter table public.order_enablement_checks add constraint order_enablement_checks_pkey primary key (organization_id, key);

insert into public.order_enablement_checks (organization_id, key, label, status)
select organization.id, checks.key, checks.label, 'pending'
from public.organizations as organization
cross join (
  select key, label from public.order_enablement_checks
  where organization_id = (select id from public.organizations where slug = 'geardrop')
) as checks
where organization.slug = 'oryvenne'
on conflict (organization_id, key) do nothing;

alter table public.storefront_daily_events drop constraint storefront_daily_events_pkey;
alter table public.storefront_daily_events add constraint storefront_daily_events_pkey primary key (organization_id, day, event);

alter table public.customer_profiles
  add constraint customer_profiles_user_organization_key unique (user_id, organization_id);

-- ---------------------------------------------------------------------------------------
-- (id, organization_id) on every root with an id, for composite foreign keys.
-- ---------------------------------------------------------------------------------------

do $keys$
declare
  target text;
begin
  foreach target in array array[
    'categories', 'products', 'bundles', 'coupons', 'promotions', 'orders',
    'inventory_movements', 'restock_requests', 'shipping_methods', 'media_assets',
    'content_pages', 'homepage_sections', 'navigation_menus', 'footer_columns',
    'social_links', 'coupon_redemptions'
  ] loop
    execute format(
      'alter table public.%I add constraint %I unique (id, organization_id)',
      target, target || '_id_organization_key'
    );
  end loop;
end;
$keys$;

-- ---------------------------------------------------------------------------------------
-- Natural keys are unique per company. Constraint names are kept, so code that names them
-- (set constraints ... deferred) keeps working.
-- ---------------------------------------------------------------------------------------

alter table public.bundles drop constraint bundles_slug_key,
  add constraint bundles_slug_key unique (organization_id, slug);
alter table public.categories drop constraint categories_slug_key,
  add constraint categories_slug_key unique (organization_id, slug);
alter table public.content_pages drop constraint content_pages_slug_key,
  add constraint content_pages_slug_key unique (organization_id, slug);
alter table public.footer_columns drop constraint footer_columns_column_key_key,
  add constraint footer_columns_column_key_key unique (organization_id, column_key);
alter table public.footer_columns drop constraint footer_columns_sort_order_key,
  add constraint footer_columns_sort_order_key unique (organization_id, sort_order);
alter table public.homepage_sections drop constraint homepage_sections_section_key_key,
  add constraint homepage_sections_section_key_key unique (organization_id, section_key);
alter table public.homepage_sections drop constraint homepage_sections_sort_order_key,
  add constraint homepage_sections_sort_order_key unique (organization_id, sort_order) deferrable initially immediate;
alter table public.navigation_menus drop constraint navigation_menus_menu_key_key,
  add constraint navigation_menus_menu_key_key unique (organization_id, menu_key);
alter table public.products drop constraint products_sku_key,
  add constraint products_sku_key unique (organization_id, sku);
alter table public.products drop constraint products_slug_key,
  add constraint products_slug_key unique (organization_id, slug);
alter table public.shipping_methods drop constraint shipping_methods_code_key,
  add constraint shipping_methods_code_key unique (organization_id, code);
alter table public.social_links drop constraint social_links_platform_key_key,
  add constraint social_links_platform_key_key unique (organization_id, platform_key);
alter table public.social_links drop constraint social_links_sort_order_key,
  add constraint social_links_sort_order_key unique (organization_id, sort_order);

drop index public.products_sku_case_insensitive_idx;
create unique index products_sku_case_insensitive_idx on public.products (organization_id, lower(sku));
drop index public.coupons_code_case_insensitive_idx;
create unique index coupons_code_case_insensitive_idx on public.coupons (organization_id, lower(code));
drop index public.restock_requests_slug_email_unique;
create unique index restock_requests_slug_email_unique on public.restock_requests (organization_id, product_slug, lower(email));

-- ---------------------------------------------------------------------------------------
-- Composite foreign keys: a link between two companies cannot be written. Names and delete
-- rules are kept; SET NULL clears only the reference, never the company.
-- ---------------------------------------------------------------------------------------

alter table public.categories
  drop constraint categories_media_asset_id_fkey,
  add constraint categories_media_asset_id_fkey foreign key (media_asset_id, organization_id)
    references public.media_assets (id, organization_id) on delete set null (media_asset_id);

alter table public.products
  drop constraint products_category_id_fkey,
  add constraint products_category_id_fkey foreign key (category_id, organization_id)
    references public.categories (id, organization_id);

alter table public.product_images
  drop constraint product_images_product_id_fkey,
  add constraint product_images_product_id_fkey foreign key (product_id, organization_id)
    references public.products (id, organization_id) on delete cascade,
  drop constraint product_images_media_asset_id_fkey,
  add constraint product_images_media_asset_id_fkey foreign key (media_asset_id, organization_id)
    references public.media_assets (id, organization_id) on delete set null (media_asset_id);

alter table public.product_relations
  drop constraint product_relations_product_id_fkey,
  add constraint product_relations_product_id_fkey foreign key (product_id, organization_id)
    references public.products (id, organization_id) on delete cascade,
  drop constraint product_relations_related_product_id_fkey,
  add constraint product_relations_related_product_id_fkey foreign key (related_product_id, organization_id)
    references public.products (id, organization_id) on delete cascade;

alter table public.bundles
  drop constraint bundles_hero_product_id_fkey,
  add constraint bundles_hero_product_id_fkey foreign key (hero_product_id, organization_id)
    references public.products (id, organization_id),
  drop constraint bundles_media_asset_id_fkey,
  add constraint bundles_media_asset_id_fkey foreign key (media_asset_id, organization_id)
    references public.media_assets (id, organization_id) on delete set null (media_asset_id);

alter table public.bundle_items
  drop constraint bundle_items_bundle_id_fkey,
  add constraint bundle_items_bundle_id_fkey foreign key (bundle_id, organization_id)
    references public.bundles (id, organization_id) on delete cascade,
  drop constraint bundle_items_product_id_fkey,
  add constraint bundle_items_product_id_fkey foreign key (product_id, organization_id)
    references public.products (id, organization_id);

alter table public.order_items
  drop constraint order_items_order_id_fkey,
  add constraint order_items_order_id_fkey foreign key (order_id, organization_id)
    references public.orders (id, organization_id) on delete restrict,
  drop constraint order_items_product_id_fkey,
  add constraint order_items_product_id_fkey foreign key (product_id, organization_id)
    references public.products (id, organization_id) on delete set null (product_id);

alter table public.coupon_redemptions
  drop constraint coupon_redemptions_coupon_id_fkey,
  add constraint coupon_redemptions_coupon_id_fkey foreign key (coupon_id, organization_id)
    references public.coupons (id, organization_id) on delete restrict,
  drop constraint coupon_redemptions_order_id_fkey,
  add constraint coupon_redemptions_order_id_fkey foreign key (order_id, organization_id)
    references public.orders (id, organization_id) on delete restrict;

alter table public.inventory_movements
  drop constraint inventory_movements_order_id_fkey,
  add constraint inventory_movements_order_id_fkey foreign key (order_id, organization_id)
    references public.orders (id, organization_id) on delete restrict,
  drop constraint inventory_movements_product_id_fkey,
  add constraint inventory_movements_product_id_fkey foreign key (product_id, organization_id)
    references public.products (id, organization_id) on delete restrict;

alter table public.homepage_sections
  drop constraint homepage_sections_desktop_media_asset_id_fkey,
  add constraint homepage_sections_desktop_media_asset_id_fkey foreign key (desktop_media_asset_id, organization_id)
    references public.media_assets (id, organization_id) on delete restrict,
  drop constraint homepage_sections_mobile_media_asset_id_fkey,
  add constraint homepage_sections_mobile_media_asset_id_fkey foreign key (mobile_media_asset_id, organization_id)
    references public.media_assets (id, organization_id) on delete restrict;

alter table public.homepage_section_products
  drop constraint homepage_section_products_product_id_fkey,
  add constraint homepage_section_products_product_id_fkey foreign key (product_id, organization_id)
    references public.products (id, organization_id) on delete restrict,
  drop constraint homepage_section_products_section_id_fkey,
  add constraint homepage_section_products_section_id_fkey foreign key (section_id, organization_id)
    references public.homepage_sections (id, organization_id) on delete cascade;

alter table public.homepage_section_categories
  drop constraint homepage_section_categories_category_id_fkey,
  add constraint homepage_section_categories_category_id_fkey foreign key (category_id, organization_id)
    references public.categories (id, organization_id) on delete restrict,
  drop constraint homepage_section_categories_section_id_fkey,
  add constraint homepage_section_categories_section_id_fkey foreign key (section_id, organization_id)
    references public.homepage_sections (id, organization_id) on delete cascade;

alter table public.homepage_section_bundles
  drop constraint homepage_section_bundles_bundle_id_fkey,
  add constraint homepage_section_bundles_bundle_id_fkey foreign key (bundle_id, organization_id)
    references public.bundles (id, organization_id) on delete restrict,
  drop constraint homepage_section_bundles_section_id_fkey,
  add constraint homepage_section_bundles_section_id_fkey foreign key (section_id, organization_id)
    references public.homepage_sections (id, organization_id) on delete cascade;

alter table public.promotion_products
  drop constraint promotion_products_product_id_fkey,
  add constraint promotion_products_product_id_fkey foreign key (product_id, organization_id)
    references public.products (id, organization_id) on delete cascade,
  drop constraint promotion_products_promotion_id_fkey,
  add constraint promotion_products_promotion_id_fkey foreign key (promotion_id, organization_id)
    references public.promotions (id, organization_id) on delete cascade;

alter table public.promotion_categories
  drop constraint promotion_categories_category_id_fkey,
  add constraint promotion_categories_category_id_fkey foreign key (category_id, organization_id)
    references public.categories (id, organization_id) on delete cascade,
  drop constraint promotion_categories_promotion_id_fkey,
  add constraint promotion_categories_promotion_id_fkey foreign key (promotion_id, organization_id)
    references public.promotions (id, organization_id) on delete cascade;

alter table public.promotion_bundles
  drop constraint promotion_bundles_bundle_id_fkey,
  add constraint promotion_bundles_bundle_id_fkey foreign key (bundle_id, organization_id)
    references public.bundles (id, organization_id) on delete cascade,
  drop constraint promotion_bundles_promotion_id_fkey,
  add constraint promotion_bundles_promotion_id_fkey foreign key (promotion_id, organization_id)
    references public.promotions (id, organization_id) on delete cascade;

alter table public.coupon_products
  drop constraint coupon_products_coupon_id_fkey,
  add constraint coupon_products_coupon_id_fkey foreign key (coupon_id, organization_id)
    references public.coupons (id, organization_id) on delete cascade,
  drop constraint coupon_products_product_id_fkey,
  add constraint coupon_products_product_id_fkey foreign key (product_id, organization_id)
    references public.products (id, organization_id) on delete cascade;

alter table public.coupon_categories
  drop constraint coupon_categories_category_id_fkey,
  add constraint coupon_categories_category_id_fkey foreign key (category_id, organization_id)
    references public.categories (id, organization_id) on delete cascade,
  drop constraint coupon_categories_coupon_id_fkey,
  add constraint coupon_categories_coupon_id_fkey foreign key (coupon_id, organization_id)
    references public.coupons (id, organization_id) on delete cascade;

alter table public.coupon_bundles
  drop constraint coupon_bundles_bundle_id_fkey,
  add constraint coupon_bundles_bundle_id_fkey foreign key (bundle_id, organization_id)
    references public.bundles (id, organization_id) on delete cascade,
  drop constraint coupon_bundles_coupon_id_fkey,
  add constraint coupon_bundles_coupon_id_fkey foreign key (coupon_id, organization_id)
    references public.coupons (id, organization_id) on delete cascade;

-- ---------------------------------------------------------------------------------------
-- Rows created under a parent take the parent's company.
-- ---------------------------------------------------------------------------------------

create trigger order_items_inherit_organization before insert on public.order_items
  for each row when (new.organization_id is null) execute function private.inherit_organization('orders', 'order_id');
create trigger bundle_items_inherit_organization before insert on public.bundle_items
  for each row when (new.organization_id is null) execute function private.inherit_organization('bundles', 'bundle_id');
create trigger product_relations_inherit_organization before insert on public.product_relations
  for each row when (new.organization_id is null) execute function private.inherit_organization('products', 'product_id');
create trigger product_images_inherit_organization before insert on public.product_images
  for each row when (new.organization_id is null) execute function private.inherit_organization('products', 'product_id');
create trigger coupon_products_inherit_organization before insert on public.coupon_products
  for each row when (new.organization_id is null) execute function private.inherit_organization('coupons', 'coupon_id');
create trigger coupon_categories_inherit_organization before insert on public.coupon_categories
  for each row when (new.organization_id is null) execute function private.inherit_organization('coupons', 'coupon_id');
create trigger coupon_bundles_inherit_organization before insert on public.coupon_bundles
  for each row when (new.organization_id is null) execute function private.inherit_organization('coupons', 'coupon_id');
create trigger promotion_products_inherit_organization before insert on public.promotion_products
  for each row when (new.organization_id is null) execute function private.inherit_organization('promotions', 'promotion_id');
create trigger promotion_categories_inherit_organization before insert on public.promotion_categories
  for each row when (new.organization_id is null) execute function private.inherit_organization('promotions', 'promotion_id');
create trigger promotion_bundles_inherit_organization before insert on public.promotion_bundles
  for each row when (new.organization_id is null) execute function private.inherit_organization('promotions', 'promotion_id');
create trigger homepage_section_products_inherit_organization before insert on public.homepage_section_products
  for each row when (new.organization_id is null) execute function private.inherit_organization('homepage_sections', 'section_id');
create trigger homepage_section_categories_inherit_organization before insert on public.homepage_section_categories
  for each row when (new.organization_id is null) execute function private.inherit_organization('homepage_sections', 'section_id');
create trigger homepage_section_bundles_inherit_organization before insert on public.homepage_section_bundles
  for each row when (new.organization_id is null) execute function private.inherit_organization('homepage_sections', 'section_id');
create trigger inventory_movements_inherit_organization before insert on public.inventory_movements
  for each row when (new.organization_id is null) execute function private.inherit_organization('products', 'product_id');
create trigger coupon_redemptions_inherit_organization before insert on public.coupon_redemptions
  for each row when (new.organization_id is null) execute function private.inherit_organization('orders', 'order_id');

-- Audit events written by RPCs name the entity; the company is read from it (or from the
-- state captured in the event, for a row the event records as deleted).
create or replace function private.audit_event_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  entity_table regclass;
  resolved bigint;
begin
  resolved := coalesce(
    (new.after_state ->> 'organization_id')::bigint,
    (new.before_state ->> 'organization_id')::bigint
  );
  if resolved is null and new.entity_type = 'storage.objects' then
    select media.organization_id into resolved
    from public.media_assets as media
    where media.bucket_id || '/' || media.object_path = new.entity_id;
  elsif resolved is null and new.entity_id ~ '^[0-9]{1,18}$' then
    entity_table := to_regclass('public.' || quote_ident(new.entity_type));
    if entity_table is not null and exists (
      select 1 from pg_catalog.pg_attribute
      where attrelid = entity_table and attname = 'organization_id' and not attisdropped
    ) and exists (
      select 1 from pg_catalog.pg_attribute
      where attrelid = entity_table and attname = 'id' and not attisdropped
    ) then
      execute format('select organization_id from %s where id = $1', entity_table)
        into resolved
        using new.entity_id::bigint;
    end if;
  end if;
  new.organization_id := resolved;
  return new;
end;
$$;
revoke all on function private.audit_event_organization() from public;

create trigger audit_events_resolve_organization before insert on public.audit_events
  for each row when (new.organization_id is null) execute function private.audit_event_organization();

-- ---------------------------------------------------------------------------------------
-- Staff triggers act on the role the person holds in the row's company.
-- ---------------------------------------------------------------------------------------

create or replace function private.audit_admin_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  before_row jsonb;
  after_row jsonb;
  entity_row jsonb;
  entity_key text;
  row_company bigint;
begin
  -- Seed and reviewed direct-database maintenance have no request actor.
  if actor_id is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  before_row := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  after_row := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  entity_row := coalesce(after_row, before_row);
  row_company := private.row_organization(tg_table_name, entity_row);

  -- Only staff of the row's company make administrative mutations. The only other writer is
  -- order intake, already audited as an order event and an inventory movement. A child row
  -- whose parent is already gone (a cascade) is audited when the actor is staff anywhere.
  if (row_company is not null and private.org_role(row_company) is null)
    or (row_company is null and cardinality(private.member_organization_ids(
      array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role]
    )) = 0) then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  entity_key := coalesce(
    entity_row ->> 'id',
    nullif(
      concat_ws(
        ':',
        entity_row ->> 'product_id',
        entity_row ->> 'related_product_id',
        entity_row ->> 'media_asset_id',
        entity_row ->> 'tag',
        entity_row ->> 'relation_type',
        entity_row ->> 'sort_order'
      ),
      ''
    ),
    'unknown'
  );

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    before_state,
    after_state
  ) values (
    row_company,
    actor_id,
    lower(tg_op),
    tg_table_name,
    entity_key,
    before_row,
    after_row
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function private.enforce_product_editor_boundaries()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  actor_role public.staff_role;
begin
  -- Seed and explicitly reviewed database maintenance do not carry a request actor.
  if (select auth.uid()) is null then
    return new;
  end if;

  actor_role := private.org_role(new.organization_id);

  if actor_role in ('owner'::public.staff_role, 'admin'::public.staff_role) then
    return new;
  end if;

  -- Not staff of this company: RLS decides. Reached by order intake, which reserves stock on
  -- behalf of the shop while running under the buyer's identity.
  if actor_role is distinct from 'editor'::public.staff_role then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.publication_status <> 'draft'::public.publication_status
      or new.active
      or new.price_cents <> 0
      or new.compare_at_price_cents is not null
      or not new.manage_stock
      or new.low_stock_threshold <> 5
      or new.allow_backorder
      or new.availability_override is not null
      or new.preorder_allocation <> 0
      or new.preorder_release_date is not null
      or new.rating <> 0
      or new.review_count <> 0
      or new.stock_quantity <> 0 then
      raise exception using errcode = '42501', message = 'GD_EDITOR_DRAFT_DEFAULTS_REQUIRED';
    end if;
    return new;
  end if;

  if new.price_cents is distinct from old.price_cents
    or new.compare_at_price_cents is distinct from old.compare_at_price_cents
    or new.currency is distinct from old.currency
    or new.manage_stock is distinct from old.manage_stock
    or new.low_stock_threshold is distinct from old.low_stock_threshold
    or new.allow_backorder is distinct from old.allow_backorder
    or new.availability_override is distinct from old.availability_override
    or new.preorder_allocation is distinct from old.preorder_allocation
    or new.preorder_release_date is distinct from old.preorder_release_date
    or new.rating is distinct from old.rating
    or new.review_count is distinct from old.review_count
    or new.stock_quantity is distinct from old.stock_quantity then
    raise exception using errcode = '42501', message = 'GD_EDITOR_COMMERCE_FIELDS_FORBIDDEN';
  end if;

  if new.publication_status = 'published'::public.publication_status and new.price_cents = 0 then
    raise exception using errcode = '23514', message = 'GD_ZERO_PRICE_PRODUCT_CANNOT_PUBLISH';
  end if;

  if (new.publication_status = 'published'::public.publication_status) is distinct from new.active then
    raise exception using errcode = '23514', message = 'GD_EDITOR_PUBLICATION_STATE_INVALID';
  end if;

  return new;
end;
$$;

create or replace function private.enforce_bundle_editor_boundaries()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.staff_role;
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  actor_role := private.org_role(new.organization_id);
  if actor_role in ('owner'::public.staff_role, 'admin'::public.staff_role) then
    return new;
  end if;

  if actor_role is distinct from 'editor'::public.staff_role then
    raise exception using errcode = '42501', message = 'GD_BUNDLE_STAFF_REQUIRED';
  end if;

  if tg_op = 'INSERT' then
    if new.price_cents <> 0
      or new.compare_at_price_cents <> 1
      or new.availability_override is not null then
      raise exception using errcode = '42501', message = 'GD_BUNDLE_MANAGER_REQUIRED';
    end if;
  elsif new.price_cents is distinct from old.price_cents
    or new.compare_at_price_cents is distinct from old.compare_at_price_cents
    or new.availability_override is distinct from old.availability_override then
    raise exception using errcode = '42501', message = 'GD_BUNDLE_MANAGER_REQUIRED';
  end if;
  return new;
end;
$$;

create or replace function private.record_staff_preorder_allocation_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.preorder_allocation is distinct from new.preorder_allocation
    and current_setting('geardrop.preorder_movement_managed', true) is distinct from 'on'
    and private.is_org_member(new.organization_id, array['owner'::public.staff_role, 'admin'::public.staff_role]) then
    insert into public.inventory_movements(
      product_id, delta, stock_after, balance_kind, balance_after, reason, actor_user_id, note
    ) values (
      new.id, new.preorder_allocation - old.preorder_allocation, new.stock_quantity, 'preorder',
      new.preorder_allocation, 'manual_adjustment', (select auth.uid()), 'Allocazione preordine aggiornata'
    );
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Functions whose SQL named a key or a column this migration changes. Their company-aware
-- versions: the rest of the functions follow in the next migrations.
-- ---------------------------------------------------------------------------------------

-- Storefront funnel: one bucket per company and day. Without a company named, the event
-- counts for the one public shop; unknown events and ambiguous shops are dropped silently,
-- as before, because tracking must never break a page.
drop function public.track_storefront_event(text);
create function public.track_storefront_event(p_event text, p_organization_id bigint default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date;
  shop bigint := p_organization_id;
begin
  if p_event not in ('product_view', 'add_to_cart', 'cart_view', 'checkout_view', 'checkout_submit') then
    return;
  end if;
  if shop is null then
    begin
      shop := private.single_storefront_organization();
    exception when others then
      return;
    end;
  end if;
  if not private.is_storefront_organization(shop) then
    return;
  end if;
  today := (now() at time zone 'Europe/Rome')::date;
  insert into public.storefront_daily_events (organization_id, day, event, count)
  values (shop, today, p_event, 1)
  on conflict (organization_id, day, event) do update
    set count = public.storefront_daily_events.count + 1;
end;
$$;
revoke all on function public.track_storefront_event(text, bigint) from public, anon, authenticated;
grant execute on function public.track_storefront_event(text, bigint) to anon, authenticated;

-- "Tell me when it is back": the product is looked up in the shop the request comes from.
drop function public.request_restock_notice(text, text);
create function public.request_restock_notice(p_slug text, p_email text, p_organization_id bigint default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_slug text := btrim(coalesce(p_slug, ''));
  clean_email text := lower(btrim(coalesce(p_email, '')));
  shop bigint := coalesce(p_organization_id, private.single_storefront_organization());
begin
  if clean_slug = '' then
    raise exception using errcode = '22023', message = 'GD_RESTOCK_INVALID_SLUG';
  end if;
  if not private.is_storefront_organization(shop) or not exists (
    select 1 from public.products
    where organization_id = shop
      and slug = clean_slug
      and publication_status = 'published'::public.publication_status
  ) then
    raise exception using errcode = '22023', message = 'GD_RESTOCK_PRODUCT_NOT_FOUND';
  end if;
  if clean_email = ''
    or clean_email !~ '^[^@\s]{1,64}@[^@\s]{1,255}\.[^@\s]{1,63}$'
    or length(clean_email) > 320
  then
    raise exception using errcode = '22023', message = 'GD_RESTOCK_INVALID_EMAIL';
  end if;
  -- A cap per product keeps a flood of made-up addresses from filling the table and the
  -- owner's email quota; real demand for one pack never gets near it.
  if (select count(*) from public.restock_requests where organization_id = shop and product_slug = clean_slug) >= 2000 then
    return;
  end if;
  insert into public.restock_requests (organization_id, product_slug, email)
  values (shop, clean_slug, clean_email)
  on conflict (organization_id, product_slug, lower(email)) do nothing;
end;
$$;
revoke all on function public.request_restock_notice(text, text, bigint) from public, anon, authenticated;
grant execute on function public.request_restock_notice(text, text, bigint) to anon, authenticated;

-- Navigation menus are per company; the caller names it.
drop function public.save_navigation_tree(jsonb);
create function public.save_navigation_tree(p_organization_id bigint, p_tree jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  menu jsonb;
  items jsonb;
  target_menu_id bigint;
  normalized_key text;
  normalized_status public.publication_status;
begin
  perform private.require_org_role(
    p_organization_id,
    array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role],
    'GD_CMS_STAFF_REQUIRED'
  );
  if p_organization_id is null then
    raise exception using errcode = '22023', message = 'GD_INVALID_NAVIGATION_TREE';
  end if;
  if jsonb_typeof(p_tree) <> 'object' or p_tree - array['menu', 'items'] <> '{}'::jsonb
    or jsonb_typeof(p_tree -> 'menu') <> 'object' or jsonb_typeof(p_tree -> 'items') <> 'array' then
    raise exception using errcode = '22023', message = 'GD_INVALID_NAVIGATION_TREE';
  end if;
  menu := p_tree -> 'menu';
  items := p_tree -> 'items';
  if menu - array['key', 'label', 'publication_status', 'active'] <> '{}'::jsonb then
    raise exception using errcode = '22023', message = 'GD_INVALID_NAVIGATION_TREE';
  end if;
  normalized_key := lower(trim(menu ->> 'key'));
  normalized_status := coalesce(nullif(menu ->> 'publication_status', ''), 'draft')::public.publication_status;
  if normalized_key !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or nullif(trim(menu ->> 'label'), '') is null then
    raise exception using errcode = '22023', message = 'GD_INVALID_NAVIGATION_TREE';
  end if;
  insert into public.navigation_menus (organization_id, menu_key, label, publication_status, published_at, active)
  values (
    p_organization_id, normalized_key, trim(menu ->> 'label'), normalized_status,
    case when normalized_status = 'published' then now() else null end,
    coalesce((menu ->> 'active')::boolean, false)
  )
  on conflict (organization_id, menu_key) do update set
    label = excluded.label,
    publication_status = excluded.publication_status,
    published_at = case when excluded.publication_status = 'published'
      then coalesce(public.navigation_menus.published_at, now()) else null end,
    active = excluded.active
  returning id into target_menu_id;
  delete from public.navigation_items where menu_id = target_menu_id;
  perform private.insert_navigation_items(target_menu_id, null, items, 0);
  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, after_state)
  values (p_organization_id, actor_id, 'content.navigation.saved', 'navigation_menus', target_menu_id::text,
    jsonb_build_object('menu_key', normalized_key));
  return target_menu_id;
exception when invalid_text_representation then
  raise exception using errcode = '22023', message = 'GD_INVALID_NAVIGATION_TREE';
end;
$$;
revoke all on function public.save_navigation_tree(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.save_navigation_tree(bigint, jsonb) to authenticated;

-- Order acceptance and its checklist are per company; the caller names it.
drop function public.set_order_acceptance(boolean, text);
create function public.set_order_acceptance(p_organization_id bigint, p_enabled boolean, p_confirmation text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  incomplete_count integer;
begin
  perform private.require_org_role(p_organization_id, array['owner'::public.staff_role], 'GD_ORDER_OWNER_REQUIRED');
  if p_organization_id is null or not exists (select 1 from public.site_settings where organization_id = p_organization_id) then
    raise exception using errcode = 'P0002', message = 'GD_ORDER_SETTINGS_NOT_FOUND';
  end if;
  if (p_enabled and p_confirmation <> 'ATTIVA ORDINI') or (not p_enabled and p_confirmation <> 'DISATTIVA ORDINI') then
    raise exception using errcode = '22023', message = 'GD_ORDER_CONFIRMATION_INVALID';
  end if;
  update public.order_enablement_checks set
    status = case when exists (
      select 1 from public.site_settings
      where organization_id = p_organization_id
        and nullif(trim(store_name), '') is not null
        and nullif(trim(legal_name), '') is not null
        and support_email is not null
    ) then 'passed'::public.enablement_check_status else 'failed'::public.enablement_check_status end,
    evidence = 'Campi identità e contatto riletti dal database', verified_at = now(), verified_by = actor_id
  where organization_id = p_organization_id and key = 'store_identity';
  update public.order_enablement_checks set
    status = case when exists (
      select 1 from public.shipping_methods
      where organization_id = p_organization_id and active and private.valid_country_codes(enabled_country_codes)
    ) then 'passed'::public.enablement_check_status else 'failed'::public.enablement_check_status end,
    evidence = 'Metodi attivi riletti dal database', verified_at = now(), verified_by = actor_id
  where organization_id = p_organization_id and key = 'shipping';
  update public.order_enablement_checks set
    status = case when exists (
      select 1 from public.products
      where organization_id = p_organization_id and active and publication_status = 'published' and is_purchasable
    ) then 'passed'::public.enablement_check_status else 'failed'::public.enablement_check_status end,
    evidence = 'Catalogo e stock riletti dal database', verified_at = now(), verified_by = actor_id
  where organization_id = p_organization_id and key = 'catalog_stock';
  if p_enabled then
    select count(*) into incomplete_count
    from public.order_enablement_checks
    where organization_id = p_organization_id and status <> 'passed';
    if incomplete_count > 0 then
      raise exception using errcode = '55000', message = 'GD_ORDER_CHECKLIST_INCOMPLETE';
    end if;
  end if;
  update public.site_settings set accept_orders = p_enabled, updated_by = actor_id
  where organization_id = p_organization_id;
  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, after_state)
  values (p_organization_id, actor_id, 'store.order_acceptance_changed', 'site_settings', p_organization_id::text,
    jsonb_build_object('accept_orders', p_enabled));
end;
$$;
revoke all on function public.set_order_acceptance(bigint, boolean, text) from public, anon, authenticated;
grant execute on function public.set_order_acceptance(bigint, boolean, text) to authenticated;

-- Order intake: the company is the one every cart line belongs to. A cart mixing companies,
-- or naming a company without a public shop, is refused.
create or replace function public.create_order(
  p_email text,
  p_phone text,
  p_shipping_address jsonb,
  p_billing_address jsonb,
  p_lines jsonb,
  p_coupon_code text,
  p_shipping_code text,
  p_idempotency_key uuid
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_id bigint;
  maximum_quantity integer;
  intake_enabled boolean;
  shops bigint[];
  shop bigint;
begin
  -- The company is the one every known cart line belongs to. A malformed cart names no product:
  -- it is judged in the one public shop, so the checks below answer exactly as they always did.
  if jsonb_typeof(p_lines) = 'array' then
    select array_agg(distinct product.organization_id)
    into shops
    from jsonb_array_elements(p_lines) as line(value)
    join public.products as product
      on jsonb_typeof(line.value) = 'object'
     and jsonb_typeof(line.value -> 'product_id') = 'number'
     and (line.value ->> 'product_id') ~ '^[0-9]{1,18}$'
     and product.id = (line.value ->> 'product_id')::bigint;
  end if;
  if coalesce(cardinality(shops), 0) > 1 then
    raise exception using errcode = '22023', message = 'GD_ORDER_INVALID_PAYLOAD';
  end if;
  shop := coalesce(shops[1], private.single_storefront_organization());
  if not private.is_storefront_organization(shop) then
    raise exception using errcode = '22023', message = 'GD_ORDER_INVALID_PAYLOAD';
  end if;

  -- `for share` holds the company's settings row for the life of the transaction, so a
  -- concurrent "disable orders" cannot commit between this check and the insert.
  select accept_orders, max_quantity_per_line into intake_enabled, maximum_quantity
  from public.site_settings
  where organization_id = shop
  for share;
  if not found or not intake_enabled then
    raise exception using errcode = '55000', message = 'GD_ORDER_INTAKE_DISABLED';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) < 1 then
    raise exception using errcode = '22023', message = 'GD_ORDER_INVALID_PAYLOAD';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lines) as line(value)
    where jsonb_typeof(line.value) is distinct from 'object'
      or jsonb_typeof(line.value -> 'product_id') is distinct from 'number'
      or jsonb_typeof(line.value -> 'quantity') is distinct from 'number'
  ) then
    raise exception using errcode = '22023', message = 'GD_ORDER_INVALID_PAYLOAD';
  end if;
  -- JSON numbers are arbitrary precision, so "quantity": 1.5 parses as a number and would
  -- otherwise reach an ::integer cast and raise 22P02 from somewhere unhelpful.
  if exists (
    select 1 from jsonb_array_elements(p_lines) as line(value)
    where (line.value ->> 'product_id')::numeric < 1
      or (line.value ->> 'product_id')::numeric
         <> pg_catalog.trunc((line.value ->> 'product_id')::numeric)
  ) then
    raise exception using errcode = '22023', message = 'GD_ORDER_INVALID_PAYLOAD';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lines) as line(value)
    where (line.value ->> 'quantity')::numeric < 1
      or (line.value ->> 'quantity')::numeric
         <> pg_catalog.trunc((line.value ->> 'quantity')::numeric)
  ) then
    raise exception using errcode = '22023', message = 'GD_ORDER_INVALID_QUANTITY';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lines) as line(value)
    where (line.value ->> 'quantity')::numeric > maximum_quantity
  ) then
    raise exception using errcode = '22023', message = 'GD_ORDER_QUANTITY_LIMIT';
  end if;
  -- The private implementation reloads every price from the catalogue and reads the
  -- buyer from auth.uid(); nothing the caller sends can influence either.
  order_id := private.create_order_unchecked(
    p_email, p_phone, p_shipping_address, p_billing_address, p_lines,
    p_coupon_code, p_shipping_code, p_idempotency_key
  );
  return order_id;
end;
$$;

commit;
