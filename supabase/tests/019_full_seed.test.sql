begin;
select plan(15);

select results_eq($$select count(*)::integer from public.products$$, array[6], 'seed has the six reviewed products');
select results_eq($$select count(*)::integer from public.categories$$, array[4], 'seed has the four reviewed categories');
select results_eq($$select count(*)::integer from public.product_images$$, array[6], 'seed has the six reviewed primary product images');
select results_eq($$select count(*)::integer from public.bundles$$, array[1], 'seed has the reviewed bundle');
select results_eq($$select count(*)::integer from public.homepage_sections$$, array[8], 'seed has the current homepage sections');
select results_eq($$select count(*)::integer from public.content_pages$$, array[5], 'seed has only reviewed public informational pages');
select results_eq($$select count(*)::integer from public.navigation_menus$$, array[1], 'seed has the main navigation');
select results_eq($$select count(*)::integer from public.navigation_items$$, array[7], 'seed has the current main navigation items');
select results_eq($$select count(*)::integer from public.footer_columns$$, array[4], 'seed has the current footer columns');
select results_eq($$select count(*)::integer from public.footer_items$$, array[15], 'seed has the current footer links');
select results_eq($$select count(*)::integer from public.products where stock_quantity <> 0$$, array[0], 'initial stock remains zero');
select is((select accept_orders from public.site_settings where singleton), false, 'order acceptance remains disabled');
select results_eq($$select count(*)::integer from public.orders$$, array[0], 'seed invents no orders');
select results_eq($$select count(*)::integer from public.coupons$$, array[0], 'seed invents no coupons');
select results_eq($$select count(*)::integer from public.promotions$$, array[0], 'seed invents no promotions');

select * from finish();
rollback;
