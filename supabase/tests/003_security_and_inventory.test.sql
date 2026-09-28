begin;
-- Organization compatibility for fixtures written before organizations existed (see
-- supabase/tests/044). Inside this rolled-back transaction every organization-scoped table
-- defaults to Gear Drop, and every staff profile is mirrored as a Gear Drop member with the
-- same role and state. Company isolation itself is tested without these shortcuts in 041-044.
do $legacy_organization$
declare
  geardrop bigint := (select id from public.organizations where slug = 'geardrop');
  target text;
begin
  for target in
    select c.table_name
    from information_schema.columns as c
    join information_schema.tables as t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'organization_id'
      and t.table_type = 'BASE TABLE' and c.table_name <> 'organization_members'
  loop
    execute format('alter table public.%I alter column organization_id set default %s', target, geardrop);
  end loop;
end
$legacy_organization$;
create function private.legacy_mirror_staff_membership() returns trigger language plpgsql set search_path = '' as $legacy_mirror$
begin
  insert into public.organization_members (organization_id, user_id, role, active)
  values ((select id from public.organizations where slug = 'geardrop'), new.user_id, new.role, new.active)
  on conflict (organization_id, user_id) do update set role = excluded.role, active = excluded.active;
  return new;
end
$legacy_mirror$;
create trigger legacy_mirror_staff_membership after insert or update of role, active on public.staff_profiles
  for each row execute function private.legacy_mirror_staff_membership();
select plan(8);

-- The production seed is intentionally preorder-only: physical stock is zero while
-- funded preorder allocation keeps those products purchasable. Add an explicit
-- rollback-only control row so the ordinary zero-stock behavior stays covered.
insert into public.products (
  category_id, slug, sku, name, tagline, description, price_cents,
  publication_status, active, stock_quantity, availability_override, preorder_allocation
)
select
  id, 'pgtap-zero-stock-control', 'PGTAP-ZERO-STOCK-CONTROL',
  'pgTAP zero-stock control', 'Test fixture', 'Rollback-only test fixture.', 100,
  'published'::public.publication_status, true, 0, null, 0
from public.categories
order by id
limit 1;

select results_eq(
  $$
    select count(*)::bigint
    from pg_class
    where relnamespace = 'public'::regnamespace
      and relkind = 'r'
      and not relrowsecurity
      and relname = any (array[
        'site_settings', 'categories', 'products', 'product_images',
        'product_specs', 'product_features', 'product_box_contents',
        'product_tags', 'product_relations', 'bundles', 'bundle_items',
        'shipping_methods', 'coupons', 'customer_profiles',
        'customer_addresses', 'staff_profiles', 'orders', 'order_items',
        'coupon_redemptions', 'inventory_movements', 'audit_events',
        'order_enablement_checks', 'media_assets'
      ])
  $$,
  array[0::bigint],
  'every exposed table has RLS enabled'
);

select results_eq(
  $$
    select stock_status::text
    from public.products
    where sku = 'PGTAP-ZERO-STOCK-CONTROL'
  $$,
  array['esaurito'::text],
  'zero stock resolves to sold out without an override'
);

select results_eq(
  $$
    select count(*)::bigint
    from public.products
    where stock_quantity = 0
      and is_purchasable
      and not (availability_override is null and allow_backorder)
      and (
        availability_override is distinct from 'preorder'::public.availability_override
        or preorder_allocation = 0
      )
  $$,
  array[0::bigint],
  'zero-stock products sell only as a funded or automatic pre-order'
);

select function_returns(
  'public',
  'adjust_inventory',
  array['text', 'integer', 'public.inventory_reason', 'text'],
  'integer',
  'inventory adjustment returns authoritative stock'
);

select is(
  has_table_privilege('anon', 'public.orders', 'select'),
  false,
  'anonymous users cannot select orders'
);
select is(
  has_table_privilege('anon', 'public.orders', 'insert'),
  false,
  'anonymous users cannot insert orders directly'
);
select is(
  has_table_privilege('authenticated', 'public.orders', 'insert'),
  false,
  'authenticated users cannot insert orders directly'
);
select is(
  has_column_privilege('authenticated', 'public.products', 'stock_quantity', 'update'),
  false,
  'application users cannot update stock directly'
);

select * from finish();
rollback;
