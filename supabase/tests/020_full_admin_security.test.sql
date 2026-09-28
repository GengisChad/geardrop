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
select plan(21);

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
select ok(not has_function_privilege('anon','public.save_navigation_tree(bigint,jsonb)','EXECUTE'), 'anon cannot mutate navigation');
select ok(not has_function_privilege('anon','public.save_bundle_with_items(jsonb,jsonb)','EXECUTE'), 'anon cannot mutate bundles');
select ok(not has_function_privilege('anon','public.transition_order_status(bigint,public.order_status,text)','EXECUTE'), 'anon cannot transition orders');
select ok(not has_function_privilege('anon','private.create_order_unchecked(text,text,jsonb,jsonb,jsonb,text,text,uuid)','EXECUTE'), 'anon cannot bypass order intake validation');
select ok(not has_function_privilege('anon','public.set_order_acceptance(bigint,boolean,text)','EXECUTE'), 'anon cannot enable orders');
select ok(not has_function_privilege('anon','public.change_staff_role(uuid,public.staff_role)','EXECUTE'), 'anon cannot change staff roles');

select results_eq($$
  select count(*)::integer
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and p.prosecdef
    and not coalesce(array_to_string(p.proconfig,','),'') like '%search_path=""%'
$$, array[0], 'all security-definer functions pin an empty search_path');

select * from finish();
rollback;
