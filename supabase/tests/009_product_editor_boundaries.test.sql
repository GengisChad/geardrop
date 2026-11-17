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
select plan(8);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, raw_app_meta_data, raw_user_meta_data, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000601', 'authenticated', 'authenticated', 'product-owner@example.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000603', 'authenticated', 'authenticated', 'product-editor@example.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), '', '', '', '');

insert into public.staff_profiles (user_id, role, display_name)
values
  ('00000000-0000-0000-0000-000000000601', 'owner', 'Product Owner'),
  ('00000000-0000-0000-0000-000000000603', 'editor', 'Product Editor');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000603', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$insert into public.products (category_id, slug, sku, name, tagline, description, price_cents, publication_status, active)
    values ((select id from public.categories order by id limit 1), 'editor-safe-draft', 'editor-safe-draft', 'Editor safe draft', 'Draft', 'Draft editoriale', 0, 'draft', false)$$,
  'editor can create only a safe zero-stock draft'
);

select throws_ok(
  $$update public.products set price_cents = 1299 where sku = 'editor-safe-draft'$$,
  '42501', 'GD_EDITOR_COMMERCE_FIELDS_FORBIDDEN',
  'editor cannot update price directly'
);

select throws_ok(
  $$update public.products set availability_override = 'incoming' where sku = 'editor-safe-draft'$$,
  '42501', 'GD_EDITOR_COMMERCE_FIELDS_FORBIDDEN',
  'editor cannot update availability directly'
);

select throws_ok(
  $$update public.products set publication_status = 'published', active = true where sku = 'editor-safe-draft'$$,
  '23514', 'GD_ZERO_PRICE_PRODUCT_CANNOT_PUBLISH',
  'editor cannot publish a zero-price draft'
);

select throws_ok(
  $$insert into public.products (category_id, slug, sku, name, tagline, description, price_cents)
    values ((select id from public.categories order by id limit 1), 'editor-priced-draft', 'editor-priced-draft', 'Priced', 'Draft', 'Draft', 100)$$,
  '42501', 'GD_EDITOR_DRAFT_DEFAULTS_REQUIRED',
  'editor cannot inject sensitive values during insert'
);

select lives_ok(
  $$update public.products set name = 'Editor renamed draft', tagline = 'Contenuto aggiornato' where sku = 'editor-safe-draft'$$,
  'editor can update content fields'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000601', true);
select lives_ok(
  $$update public.products set price_cents = 1299 where sku = 'editor-safe-draft'$$,
  'owner can set sensitive commerce fields'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000603', true);
select lives_ok(
  $$update public.products set publication_status = 'published', active = true where sku = 'editor-safe-draft'$$,
  'editor can publish after a manager sets a valid price'
);

select * from finish();
rollback;
