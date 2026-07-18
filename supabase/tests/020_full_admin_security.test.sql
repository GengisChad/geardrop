begin;
select plan(20);

select has_table('public','products','products table exists');
select has_table('public','media_assets','media library exists');
select has_table('public','homepage_sections','homepage CMS exists');
select has_table('public','promotions','promotions table exists');
select has_table('public','orders','orders table exists');
select has_table('public','staff_profiles','staff table exists');
select has_table('public','audit_events','audit table exists');

select ok(not exists(
  select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname=any(array[
    'products','media_assets','homepage_sections','content_pages','navigation_menus','footer_columns',
    'promotions','coupons','orders','shipping_methods','site_settings','staff_profiles','audit_events'
  ]) and not c.relrowsecurity
), 'every admin module table has RLS enabled');

select results_eq($$
  select count(*)::integer from pg_policies
  where schemaname='public' and 'anon'=any(roles) and cmd in ('INSERT','UPDATE','DELETE','ALL')
$$, array[0], 'anon has no public-schema mutation policy');

select ok(not has_table_privilege('anon','public.staff_profiles','SELECT'), 'anon cannot read staff');
select ok(not has_table_privilege('anon','public.audit_events','SELECT'), 'anon cannot read audit');
select ok(not has_table_privilege('anon','public.orders','SELECT'), 'anon cannot read orders');

select ok(not has_function_privilege('anon','public.adjust_inventory(text,integer,public.inventory_reason,text)','EXECUTE'), 'anon cannot adjust inventory');
select ok(not has_function_privilege('anon','public.save_homepage_section(jsonb,bigint[])','EXECUTE'), 'anon cannot mutate homepage');
select ok(not has_function_privilege('anon','public.save_navigation_tree(jsonb)','EXECUTE'), 'anon cannot mutate navigation');
select ok(not has_function_privilege('anon','public.save_bundle_with_items(jsonb,jsonb)','EXECUTE'), 'anon cannot mutate bundles');
select ok(not has_function_privilege('anon','public.transition_order_status(bigint,public.order_status,text)','EXECUTE'), 'anon cannot transition orders');
select ok(not has_function_privilege('anon','public.set_order_acceptance(boolean,text)','EXECUTE'), 'anon cannot enable orders');
select ok(not has_function_privilege('anon','public.change_staff_role(uuid,public.staff_role)','EXECUTE'), 'anon cannot change staff roles');

select results_eq($$
  select count(*)::integer
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and p.prosecdef
    and not coalesce(array_to_string(p.proconfig,','),'') like '%search_path=""%'
$$, array[0], 'all security-definer functions pin an empty search_path');

select * from finish();
rollback;
