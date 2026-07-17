begin;
select plan(8);

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
        'order_enablement_checks'
      ])
  $$,
  array[0::bigint],
  'every exposed table has RLS enabled'
);

select results_eq(
  $$
    select stock_status::text
    from public.products
    where stock_quantity = 0 and availability_override is null
    limit 1
  $$,
  array['esaurito'::text],
  'zero stock resolves to sold out without an override'
);

select results_eq(
  $$select count(*)::bigint from public.products where stock_quantity = 0 and is_purchasable$$,
  array[0::bigint],
  'zero-stock products do not become automatically purchasable'
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
