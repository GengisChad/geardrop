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
select plan(4);

-- An order can hold both kinds of pre-order at once: a piece bought beyond the shelf, which may
-- take 10/15 working days, and an unreleased drop, which only lands with the Hasbro release.
insert into public.categories(slug,name,tagline,description,active,publication_status,published_at)
values('note-wait-cat','Note','N','N',true,'published',now());
insert into public.products(category_id,slug,sku,name,tagline,description,price_cents,publication_status,active,stock_quantity,allow_backorder,availability_override,preorder_allocation)
values
  ((select id from public.categories where slug='note-wait-cat'),'note-release','NOTE-RELEASE','Note release','N','N',2500,'published',true,0,true,'preorder',3),
  ((select id from public.categories where slug='note-wait-cat'),'note-shelf','NOTE-SHELF','Note shelf','N','N',2000,'published',true,1,true,null,0);

create temporary table note_call on commit drop as
select * from public.record_stripe_checkout_order(
  'cs_test_notewait000000001', 'pi_test_notewait', 'GD-NOTEWAIT', 'note@example.com', '3330000000',
  '{"name":"Note Buyer","address":"Via Nota 1"}',
  '[{"slug":"note-release","name":"Note release","quantity":1,"unit_price_cents":2500},
    {"slug":"note-shelf","name":"Note shelf","quantity":2,"unit_price_cents":2000}]', 0, null);

select results_eq(
  $$select count(*)::bigint from public.order_notes where order_id = (select order_id from note_call) and note like 'Pre-ordine%'$$,
  array[2::bigint],
  'each kind of pre-order gets its own note');
select is(
  (select note from public.order_notes where order_id = (select order_id from note_call) and note like 'Pre-ordine nuova uscita:%'),
  'Pre-ordine nuova uscita: 1 × Note release. Non ancora distribuita: arriva con l''uscita Hasbro, circa 20 giorni lavorativi.',
  'an unreleased drop names the Hasbro release');
select is(
  (select note from public.order_notes where order_id = (select order_id from note_call) and note like 'Pre-ordine: %'),
  'Pre-ordine: 1 × Note shelf. Non erano a magazzino: potrebbero arrivare tra 10/15 giorni lavorativi.',
  'a piece bought beyond the shelf keeps the 10/15 days');
select results_eq(
  $$select preorder_quantity from public.order_items where order_id = (select order_id from note_call) order by id$$,
  $$values (1), (1)$$,
  'the release sells from its allocation and the shelf line splits at the last piece');

select * from finish();
rollback;
