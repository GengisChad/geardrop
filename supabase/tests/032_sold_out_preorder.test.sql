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
select plan(5);

-- A funded pre-order sells its allocation and no more (owner's rule, 2026-09-21).
insert into public.categories(slug,name,tagline,description,active,publication_status,published_at)
values('sold-out-preorder-cat','Sold out','S','S',true,'published',now());
insert into public.products(category_id,slug,sku,name,tagline,description,price_cents,publication_status,active,stock_quantity,allow_backorder,availability_override,preorder_allocation)
values
  ((select id from public.categories where slug='sold-out-preorder-cat'),'funded-last','FUNDED-LAST','Funded last','F','F',2500,'published',true,0,true,'preorder',1),
  ((select id from public.categories where slug='sold-out-preorder-cat'),'funded-shelf','FUNDED-SHELF','Funded shelf','F','F',2500,'published',true,2,true,'preorder',0),
  ((select id from public.categories where slug='sold-out-preorder-cat'),'open-pre','OPEN-PRE','Open pre','O','O',2500,'published',true,0,true,null,0);

select results_eq($$select stock_status::text, is_purchasable from public.products where slug = 'funded-last'$$,
  $$values ('pre-ordine'::text, true)$$, 'a funded pre-order with pieces left sells as a pre-order');
update public.products set preorder_allocation = 0 where slug = 'funded-last';
select results_eq($$select stock_status::text, is_purchasable from public.products where slug = 'funded-last'$$,
  $$values ('esaurito'::text, false)$$, 'at zero allocation it is sold out, backorder switch or not');
update public.products set preorder_allocation = 5 where slug = 'funded-last';
select results_eq($$select stock_status::text, is_purchasable from public.products where slug = 'funded-last'$$,
  $$values ('pre-ordine'::text, true)$$, 'new pieces from the owner reopen it');
select results_eq($$select stock_status::text, is_purchasable from public.products where slug = 'funded-shelf'$$,
  $$values ('pre-ordine'::text, true)$$, 'a pre-order with stock on the shelf still sells');
select results_eq($$select stock_status::text, is_purchasable from public.products where slug = 'open-pre'$$,
  $$values ('pre-ordine'::text, true)$$, 'an open pre-order keeps selling without a limit');

select * from finish();
rollback;
