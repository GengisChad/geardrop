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
select plan(6);

-- 1. faq gains the authenticity FAQ entry
select ok(
  (select markdown_source from public.content_pages where slug = 'faq') like '%I prodotti sono originali?%',
  'faq page mentions product authenticity');

-- 2. faq states shipping is Italy-only
select ok(
  (select markdown_source from public.content_pages where slug = 'faq') like '%Spediamo solo in Italia%',
  'faq page mentions Italy-only shipping');

-- 3. spedizioni shows 1-5 giorni delivery window, not the old 14-day promise
select ok(
  (select markdown_source from public.content_pages where slug = 'spedizioni') like '%1-5 giorni lavorativi%',
  'spedizioni page states 1-5 working day delivery');

select ok(
  (select markdown_source from public.content_pages where slug = 'spedizioni') not like '%entro 14 giorni dalla conferma%',
  'spedizioni page does not show the old 14-day dispatch promise');

-- 4. spedizioni explicitly restricts to Italy
select ok(
  (select markdown_source from public.content_pages where slug = 'spedizioni') like '%Spediamo solo in Italia%',
  'spedizioni page states Italy-only shipping');

-- 5. contatti does not refer to non-existent social channels
select ok(
  (select markdown_source from public.content_pages where slug = 'contatti') not like '%canali social%',
  'contatti page does not reference social channels');

select * from finish();
rollback;
