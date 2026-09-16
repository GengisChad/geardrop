begin;
select plan(26);

select has_table('public', 'customer_profiles', 'customer profiles exist');
select has_table('public', 'staff_profiles', 'staff profiles exist separately');
select has_table('public', 'categories', 'categories exist');
select has_table('public', 'products', 'products exist');
select has_table('public', 'product_images', 'product images exist');
select has_table('public', 'orders', 'orders exist');
select has_table('public', 'order_items', 'order lines exist');
select has_table('public', 'inventory_movements', 'inventory ledger exists');
select has_table('public', 'site_settings', 'site settings exist');
select has_type('public', 'staff_role', 'staff role enum exists');
select has_type('public', 'availability_override', 'availability override enum exists');
select col_not_null('public', 'products', 'stock_quantity', 'stock is required');
select col_not_null('public', 'products', 'stock_status', 'computed stock status is required');

select results_eq(
  $$select accept_orders from public.site_settings where singleton$$,
  array[false],
  'order intake starts disabled'
);
select results_eq(
  $$select count(*)::bigint from public.products
    where stock_quantity <> 0
      and slug not in ('cobalt-dragoon-2-60c', 'soar-phoenix-9-60gf', 'saber-samurai-2-70l', 'blast-pegasus-a-tr', 'drop-attack-battle-set', 'sneak-attack-battle-set', 'glory-valkerion-lf', 'hurricane-enlil-is-7-55t', 'shatter-horus-9-65gb')$$,
  array[0::bigint],
  'only the owner-reviewed catalogue carries stock'
);
select results_eq(
  $$
    select version
    from supabase_migrations.schema_migrations
    where version in (
      '20260717185534',
      '20260717185535',
      '20260717185536',
      '20260717185537',
      '20260717190612',
      '20260717214105',
      '20260717214107'
    )
    order by version
  $$,
  array[
    '20260717185534',
    '20260717185535',
    '20260717185536',
    '20260717185537',
    '20260717190612',
    '20260717214105',
    '20260717214107'
  ]::text[],
  'all seven additive migrations are applied in order'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_catalog.pg_tables
    where schemaname = 'public'
      and tablename = any (array[
        'site_settings', 'categories', 'products', 'product_images',
        'product_specs', 'product_features', 'product_box_contents',
        'product_tags', 'product_relations', 'bundles', 'bundle_items',
        'shipping_methods', 'coupons', 'customer_profiles',
        'customer_addresses', 'staff_profiles', 'orders', 'order_items',
        'coupon_redemptions', 'inventory_movements', 'audit_events',
        'order_enablement_checks', 'media_assets', 'promotions',
        'promotion_products', 'promotion_categories', 'promotion_bundles',
        'coupon_products', 'coupon_categories', 'coupon_bundles',
        'order_notes', 'order_status_events'
      ])
  $$,
  array[32::bigint],
  'exactly 32 commerce tables exist'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_catalog.pg_type as type
    join pg_catalog.pg_namespace as namespace on namespace.oid = type.typnamespace
    where namespace.nspname = 'public'
      and type.typtype = 'e'
      and type.typname = any (array[
        'publication_status', 'availability_override', 'stock_status',
        'blade_type', 'promo_tag', 'staff_role', 'discount_kind',
        'order_status', 'payment_status', 'inventory_reason',
        'enablement_check_status', 'product_relation_type', 'promotion_discount_kind',
        'staff_invite_status'
      ])
  $$,
  array[14::bigint],
  'exactly 14 commerce enums exist'
);
select results_eq(
  $$select count(*)::bigint from pg_catalog.pg_policies where schemaname = 'public'$$,
  array[89::bigint],
  'exactly 89 public RLS policies exist'
);
select results_eq(
  $$select count(*)::bigint from public.categories$$,
  array[4::bigint],
  'double seed keeps four categories'
);
select results_eq(
  $$select count(*)::bigint from public.products$$,
  array[9::bigint],
  'double seed keeps nine products'
);
select results_eq(
  $$select count(*)::bigint from public.product_images$$,
  array[9::bigint],
  'double seed keeps nine primary product images'
);
select results_eq(
  $$select count(*)::bigint from public.site_settings$$,
  array[1::bigint],
  'double seed keeps one settings row'
);
select results_eq(
  $$select count(*)::bigint from (select slug from public.categories group by slug having count(*) > 1) duplicates$$,
  array[0::bigint],
  'double seed creates no duplicate category slug'
);
select results_eq(
  $$select count(*)::bigint from (select slug from public.products group by slug having count(*) > 1) duplicates$$,
  array[0::bigint],
  'double seed creates no duplicate product slug'
);
select results_eq(
  $$select count(*)::bigint from public.staff_profiles$$,
  array[0::bigint],
  'migrations and seed create no staff privilege automatically'
);

select * from finish();
rollback;
