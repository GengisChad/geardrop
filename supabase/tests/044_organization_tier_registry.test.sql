-- The organization tier registry: every table in `public` is classified, and the schema
-- must match its class. A new table that is not registered here fails this test, which
-- is what keeps "every row belongs to one company" true as the schema grows.
--
--   A  root: carries organization_id, and exposes (id, organization_id) for composite keys
--   B  junction: carries organization_id and ties every organization-scoped parent to it
--   C  child of one parent: no column, it inherits the parent's organization
--   G  global: identity and the organizations themselves
begin;
select plan(8);

create temporary table expected_tiers (
  table_name text primary key,
  tier text not null check (tier in ('A', 'B', 'C', 'G'))
) on commit drop;

insert into expected_tiers (table_name, tier) values
  ('site_settings', 'A'), ('categories', 'A'), ('products', 'A'), ('bundles', 'A'),
  ('coupons', 'A'), ('promotions', 'A'), ('orders', 'A'), ('customer_profiles', 'A'),
  ('inventory_movements', 'A'), ('restock_requests', 'A'), ('shipping_methods', 'A'),
  ('media_assets', 'A'), ('content_pages', 'A'), ('homepage_sections', 'A'),
  ('navigation_menus', 'A'), ('footer_columns', 'A'), ('social_links', 'A'),
  ('storefront_daily_events', 'A'), ('order_enablement_checks', 'A'),
  ('coupon_redemptions', 'A'), ('audit_events', 'A'),
  ('suppliers', 'A'), ('supplier_receipts', 'A'), ('inventory_cost_state', 'A'),
  ('market_sources', 'A'), ('pricing_policies', 'A'), ('agent_runs', 'A'), ('market_observations', 'A'),
  ('pricing_proposals', 'A'), ('organization_management_features', 'A'),
  ('supplier_receipt_lines', 'B'), ('inventory_movement_costs', 'C'),
  ('order_items', 'B'), ('bundle_items', 'B'), ('product_relations', 'B'), ('product_images', 'B'),
  ('coupon_products', 'B'), ('coupon_categories', 'B'), ('coupon_bundles', 'B'),
  ('promotion_products', 'B'), ('promotion_categories', 'B'), ('promotion_bundles', 'B'),
  ('homepage_section_products', 'B'), ('homepage_section_categories', 'B'),
  ('homepage_section_bundles', 'B'),
  ('product_specs', 'C'), ('product_features', 'C'), ('product_box_contents', 'C'),
  ('product_tags', 'C'), ('order_notes', 'C'), ('order_status_events', 'C'),
  ('footer_items', 'C'), ('navigation_items', 'C'), ('customer_addresses', 'C'),
  ('staff_profiles', 'G'), ('organizations', 'G'), ('organization_members', 'G'),
  -- meta tier-list tables added by 20261005090000_meta_attuale_tier_lists.sql (main branch)
  -- and scoped by 20261006230000_scope_the_meta_tables.sql
  ('meta_snapshots', 'A'), ('meta_videos', 'A'),
  ('meta_rankings', 'C');

select set_eq(
  $$select c.relname::text from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'$$,
  $$select table_name from expected_tiers$$,
  'every public table is registered in the organization tier registry'
);

select is_empty(
  $$
    select t.table_name
    from expected_tiers t
    where t.tier in ('A', 'B') and not exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = t.table_name
        and c.column_name = 'organization_id' and c.data_type = 'bigint'
        and c.column_default is null
        -- Staff identity events (invites, logins) belong to no company.
        and c.is_nullable = case when t.table_name = 'audit_events' then 'YES' else 'NO' end
    )
  $$,
  'tier A and B tables carry organization_id bigint, not null, without a default'
);

select is_empty(
  $$
    select t.table_name
    from expected_tiers t
    join information_schema.columns c
      on c.table_schema = 'public' and c.table_name = t.table_name and c.column_name = 'organization_id'
    where t.tier in ('C', 'G') and t.table_name <> 'organization_members'
  $$,
  'tier C tables inherit their organization and tier G tables have none'
);

select is_empty(
  $$
    select t.table_name
    from expected_tiers t
    where t.tier = 'A'
      and t.table_name <> 'audit_events'
      and exists (
        select 1 from information_schema.columns c
        where c.table_schema = 'public' and c.table_name = t.table_name and c.column_name = 'id'
      )
      and not exists (
        select 1
        from pg_constraint k
        join pg_class c on c.oid = k.conrelid
        where c.relnamespace = 'public'::regnamespace and c.relname = t.table_name and k.contype in ('u', 'p')
          and (
            select array_agg(a.attname::text order by a.attname)
            from unnest(k.conkey) as u(attnum)
            join pg_attribute a on a.attrelid = k.conrelid and a.attnum = u.attnum
          ) = array['id', 'organization_id']
      )
  $$,
  'tier A roots expose (id, organization_id) for composite foreign keys'
);

select is_empty(
  $$
    select t.table_name
    from expected_tiers t
    where t.tier = 'B' and (
      select count(*)
      from pg_constraint k
      join pg_class c on c.oid = k.conrelid
      where c.relnamespace = 'public'::regnamespace and c.relname = t.table_name and k.contype = 'f'
        and exists (
          select 1 from unnest(k.conkey) as u(attnum)
          join pg_attribute a on a.attrelid = k.conrelid and a.attnum = u.attnum
          where a.attname = 'organization_id'
        )
    ) < 2
  $$,
  'tier B junctions tie both ends to the same organization'
);

select is_empty(
  $$
    select t.table_name
    from expected_tiers t
    join pg_class c on c.relname = t.table_name and c.relnamespace = 'public'::regnamespace
    where not c.relrowsecurity
  $$,
  'row level security is enabled on every public table'
);

select is_empty(
  $$
    select t.table_name
    from expected_tiers t
    where t.tier in ('A', 'B') and not exists (
      select 1
      from pg_index i
      join pg_class c on c.oid = i.indrelid
      join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
      where c.relnamespace = 'public'::regnamespace and c.relname = t.table_name
        and a.attname = 'organization_id'
    )
  $$,
  'every organization-scoped table has an index led by organization_id'
);

select is_empty(
  $$
    select t.table_name
    from expected_tiers t
    where t.tier in ('A', 'B') and not exists (
      select 1
      from pg_trigger g
      join pg_class c on c.oid = g.tgrelid
      where c.relnamespace = 'public'::regnamespace and c.relname = t.table_name
        and not g.tgisinternal
        and g.tgfoid = 'private.prevent_organization_change()'::regprocedure
    )
  $$,
  'no row can move from one organization to another'
);

select * from finish();
rollback;
