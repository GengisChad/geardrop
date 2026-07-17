begin;
select plan(15);

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
  $$select count(*)::bigint from public.products where stock_quantity <> 0$$,
  array[0::bigint],
  'seed never introduces real stock'
);

select * from finish();
rollback;
