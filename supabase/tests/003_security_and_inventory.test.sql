begin;
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
      and (
        availability_override is distinct from 'preorder'::public.availability_override
        or preorder_allocation = 0
      )
  $$,
  array[0::bigint],
  'zero-stock products without funded preorder allocation are not purchasable'
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
