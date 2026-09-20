begin;
select plan(17);

select results_eq($$select count(*)::integer from public.products$$, array[14], 'seed has the fourteen reviewed products');
select results_eq($$select count(*)::integer from public.categories$$, array[4], 'seed has the four reviewed categories');
select results_eq($$select count(*)::integer from public.product_images where is_primary and published$$, array[14], 'seed has one reviewed primary image per product');
select results_eq($$select count(*)::integer from public.bundles$$, array[1], 'seed has the reviewed bundle');
select results_eq($$select count(*)::integer from public.homepage_sections$$, array[8], 'seed has the current homepage sections');
select results_eq($$select count(*)::integer from public.content_pages$$, array[5], 'seed has only reviewed public informational pages');
select results_eq($$select count(*)::integer from public.navigation_menus$$, array[1], 'seed has the main navigation');
select results_eq($$select count(*)::integer from public.navigation_items$$, array[7], 'seed has the current main navigation items');
select results_eq($$select count(*)::integer from public.footer_columns$$, array[4], 'seed has the current footer columns');
select results_eq($$select count(*)::integer from public.footer_items$$, array[16], 'seed has the current footer links');
-- Every published product is sellable the day the seed runs, in one of the three honest ways:
-- from a shelf, from a funded pre-order allocation (the 2026-09-21 drop), or as an open
-- pre-order with no shelf at all (allow_backorder).
select results_eq($$select count(*)::integer from public.products where publication_status = 'published'
  and not (
    (availability_override is null and stock_quantity > 0 and preorder_allocation = 0)
    or (availability_override = 'preorder'::public.availability_override and preorder_allocation > 0 and stock_quantity = 0)
    or (availability_override is null and stock_quantity = 0 and preorder_allocation = 0 and allow_backorder)
  )$$, array[0], 'every published product sells from stock, from an allocation, or as an open pre-order');
select results_eq($$select count(*)::integer from public.products
  where publication_status = 'published' and availability_override is null and stock_quantity = 0 and allow_backorder$$,
  array[7], 'the seven older pieces sell as open pre-orders');
select results_eq($$select count(*)::integer from public.products where availability_override = 'preorder'::public.availability_override and preorder_allocation = 9$$, array[5], 'the pre-order drop carries nine allocations each');
select is((select accept_orders from public.site_settings where singleton), false, 'order acceptance remains disabled');
select results_eq($$select count(*)::integer from public.orders$$, array[0], 'seed invents no orders');
select results_eq($$select count(*)::integer from public.coupons$$, array[0], 'seed invents no coupons');
select results_eq($$select count(*)::integer from public.promotions$$, array[0], 'seed invents no promotions');

select * from finish();
rollback;
