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
select plan(18);

select results_eq($$select count(*)::integer from public.products$$, array[30], 'seed has the reviewed products');
select results_eq($$select count(*)::integer from public.categories$$, array[4], 'seed has the four reviewed categories');
select results_eq($$select count(*)::integer from public.product_images where is_primary and published$$, array[30], 'seed has one reviewed primary image per product');
select results_eq($$select count(*)::integer from public.bundles$$, array[1], 'seed has the reviewed bundle');
select results_eq($$select count(*)::integer from public.homepage_sections$$, array[8], 'seed has the current homepage sections');
select results_eq($$select count(*)::integer from public.content_pages$$, array[5], 'seed has only reviewed public informational pages');
select results_eq($$select count(*)::integer from public.navigation_menus$$, array[1], 'seed has the main navigation');
select results_eq($$select count(*)::integer from public.navigation_items$$, array[8], 'seed has the current main navigation items');
select results_eq($$select count(*)::integer from public.footer_columns$$, array[4], 'seed has the current footer columns');
select results_eq($$select count(*)::integer from public.footer_items$$, array[17], 'seed has the current footer links');
-- Every published product is in one of the three honest states the day the seed runs: on a
-- shelf, a funded pre-order allocation (the 2026-09-21 drop), or sold out with an empty shelf
-- (no open pre-orders since 2026-10-08: the page offers "Avvisami").
select results_eq($$select count(*)::integer from public.products where publication_status = 'published'
  and not (
    (availability_override is null and stock_quantity > 0 and preorder_allocation = 0)
    or (availability_override = 'preorder'::public.availability_override and preorder_allocation > 0 and stock_quantity = 0)
    or (availability_override is null and stock_quantity = 0 and preorder_allocation = 0 and not allow_backorder)
  )$$, array[0], 'every published product sells from stock or an allocation, or is honestly sold out');
select results_eq($$select slug from public.products
  where publication_status = 'published' and stock_status = 'esaurito'::public.stock_status order by slug$$,
  $$values ('blast-pegasus-a-tr'::text)$$,
  'only Blast Pegasus opens sold out: the owner has none on the shelf (2026-10-09)');
select results_eq($$select slug, preorder_allocation from public.products where availability_override = 'preorder'::public.availability_override order by sort_order$$,
  $$values ('cobalt-drake-4-60f',9),('mirage-clock-9-65b',9),('suppress-superion-0-70lp',5),('strike-dran-4-50ff',9),('tread-croc-tq-5-50gn',9)$$,
  'the pre-order drop carries the allocations the owner set');
select results_eq($$select count(*)::integer from public.products where allow_backorder$$,
  array[0], 'no product sells past its shelf: an empty shelf is sold out, never an open pre-order (2026-10-08)');
select is((select accept_orders from public.site_settings where organization_id = (select id from public.organizations where slug = 'geardrop')), false, 'order acceptance remains disabled');
select results_eq($$select count(*)::integer from public.orders$$, array[0], 'seed invents no orders');
select results_eq($$select count(*)::integer from public.coupons$$, array[0], 'seed invents no coupons');
select results_eq($$select count(*)::integer from public.promotions$$, array[0], 'seed invents no promotions');

select * from finish();
rollback;
