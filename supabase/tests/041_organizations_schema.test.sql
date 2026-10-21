-- Companies, memberships and the helpers every policy and RPC relies on to decide who
-- works for which company.
begin;
select plan(33);

select has_table('public', 'organizations', 'organizations table exists');
select has_table('public', 'organization_members', 'organization_members table exists');

select results_eq(
  $$select slug, name, order_number_prefix, storefront_public, currency from public.organizations order by id$$,
  $$values ('geardrop'::text, 'Gear Drop'::text, 'GD'::text, true, 'EUR'::text),
           ('oryvenne'::text, 'Oryvenne'::text, 'OV'::text, false, 'EUR'::text)$$,
  'Gear Drop has the public shop; Oryvenne starts with none'
);

select throws_ok(
  $$insert into public.organizations (slug, name, order_number_prefix) values ('Upper', 'X', 'XX')$$,
  '23514', null, 'company slugs are lower case'
);
select throws_ok(
  $$insert into public.organizations (slug, name, order_number_prefix) values ('altra', 'Altra', 'GD')$$,
  '23505', null, 'order number prefixes are unique across companies'
);
select throws_ok(
  $$insert into public.organizations (slug, name, order_number_prefix, currency) values ('usd', 'Usd', 'US', 'USD')$$,
  '23514', null, 'every company books in euro'
);

-- Fixture people.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email, '', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
from (values
  ('00000000-0000-0000-0000-000000004101'::uuid, 'owner-both@example.com'),
  ('00000000-0000-0000-0000-000000004102'::uuid, 'owner-oryvenne@example.com'),
  ('00000000-0000-0000-0000-000000004103'::uuid, 'editor-geardrop@example.com'),
  ('00000000-0000-0000-0000-000000004104'::uuid, 'inactive-member@example.com'),
  ('00000000-0000-0000-0000-000000004105'::uuid, 'inactive-staff@example.com'),
  ('00000000-0000-0000-0000-000000004106'::uuid, 'outsider@example.com')
) as people(id, email);

insert into public.staff_profiles (user_id, role, display_name, active) values
  ('00000000-0000-0000-0000-000000004101', 'owner', 'Owner both', true),
  ('00000000-0000-0000-0000-000000004102', 'owner', 'Owner Oryvenne', true),
  ('00000000-0000-0000-0000-000000004103', 'editor', 'Editor Gear Drop', true),
  ('00000000-0000-0000-0000-000000004104', 'admin', 'Inactive member', true),
  ('00000000-0000-0000-0000-000000004105', 'owner', 'Inactive staff', false);

insert into public.organization_members (organization_id, user_id, role, active)
select organization.id, member.user_id, member.role::public.staff_role, member.active
from (values
  ('geardrop', '00000000-0000-0000-0000-000000004101'::uuid, 'owner', true),
  ('oryvenne', '00000000-0000-0000-0000-000000004101'::uuid, 'owner', true),
  ('oryvenne', '00000000-0000-0000-0000-000000004102'::uuid, 'owner', true),
  ('geardrop', '00000000-0000-0000-0000-000000004103'::uuid, 'editor', true),
  ('geardrop', '00000000-0000-0000-0000-000000004104'::uuid, 'admin', false),
  ('geardrop', '00000000-0000-0000-0000-000000004105'::uuid, 'owner', true)
) as member(slug, user_id, role, active)
join public.organizations as organization on organization.slug = member.slug;

create temporary table org (slug text primary key, id bigint not null) on commit drop;
insert into org select slug, id from public.organizations;
grant select on org to anon, authenticated;

select results_eq(
  $$select id from org where slug = 'geardrop'$$,
  $$select private.single_storefront_organization()$$,
  'the only public shop is Gear Drop'
);
select ok(private.is_storefront_organization((select id from org where slug = 'geardrop')), 'Gear Drop is a storefront');
select ok(not private.is_storefront_organization((select id from org where slug = 'oryvenne')), 'Oryvenne is not a storefront');

-- Owner of both companies.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000004101","role":"authenticated"}', true);
select results_eq(
  $$select private.member_organization_ids(array['owner'::public.staff_role])$$,
  $$select array_agg(id order by id) from org$$,
  'an owner of both companies holds both'
);
select is(private.org_role((select id from org where slug = 'oryvenne')), 'owner'::public.staff_role, 'org_role reads the role in the company asked');
select lives_ok(
  $$select private.require_org_role((select id from org where slug = 'oryvenne'), array['owner'::public.staff_role], 'GD_TEST_DENIED')$$,
  'require_org_role lets an owner through'
);

-- Owner of Oryvenne only.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000004102","role":"authenticated"}', true);
select results_eq(
  $$select private.member_organization_ids(array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role])$$,
  $$select array[id] from org where slug = 'oryvenne'$$,
  'an Oryvenne owner holds Oryvenne only'
);
select ok(not private.is_org_member((select id from org where slug = 'geardrop'), array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role]),
  'an Oryvenne owner is nobody at Gear Drop');
select throws_ok(
  $$select private.require_org_role((select id from org where slug = 'geardrop'), array['owner'::public.staff_role], 'GD_TEST_DENIED')$$,
  '42501', 'GD_TEST_DENIED', 'require_org_role refuses another company with the caller message'
);
select lives_ok(
  $$select private.require_org_role(null, array['owner'::public.staff_role], 'GD_TEST_DENIED')$$,
  'a missing row is left to the function own not-found error for a real owner'
);

-- Editor at Gear Drop.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000004103","role":"authenticated"}', true);
select is(cardinality(private.member_organization_ids(array['owner'::public.staff_role, 'admin'::public.staff_role])), 0, 'an editor holds no manager role');
select is(private.org_role((select id from org where slug = 'geardrop')), 'editor'::public.staff_role, 'the editor role is read as editor');

-- Inactive membership and inactive staff.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000004104","role":"authenticated"}', true);
select is(cardinality(private.member_organization_ids(array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role])), 0, 'an inactive membership grants nothing');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000004105","role":"authenticated"}', true);
select is(private.org_role((select id from org where slug = 'geardrop')), null::public.staff_role, 'an inactive staff profile switches every company off');

-- Outsider.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000004106","role":"authenticated"}', true);
select throws_ok(
  $$select private.require_org_role(null, array['owner'::public.staff_role], 'GD_TEST_DENIED')$$,
  '42501', 'GD_TEST_DENIED', 'an outsider learns nothing about a missing row'
);

-- Row level security.
set local role anon;
select results_eq($$select slug from public.organizations order by id$$, $$values ('geardrop'::text)$$, 'anonymous visitors see only the public shop');
select throws_ok($$select order_number_prefix from public.organizations$$, '42501', null, 'anonymous visitors read only the public columns');
select throws_ok($$select 1 from public.organization_members$$, '42501', null, 'anonymous visitors cannot read memberships at all');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000004102","role":"authenticated"}', true);
set local role authenticated;
select results_eq($$select slug from public.organizations order by id$$, $$values ('geardrop'::text), ('oryvenne'::text)$$,
  'an Oryvenne owner sees Oryvenne and the public Gear Drop shop');
select results_eq(
  $$select count(*)::integer from public.organization_members where organization_id = (select id from org where slug = 'geardrop')$$,
  array[0], 'an Oryvenne owner sees no Gear Drop membership'
);
select throws_ok(
  $$insert into public.organization_members (organization_id, user_id, role) select id, '00000000-0000-0000-0000-000000004102', 'owner' from org where slug = 'geardrop'$$,
  '42501', null, 'nobody grants themselves a company by writing the table'
);
select throws_ok(
  $$update public.organizations set storefront_public = true$$,
  '42501', null, 'companies change only through reviewed migrations'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000004103","role":"authenticated"}', true);
set local role authenticated;
select results_eq(
  $$select count(*)::integer from public.organization_members where organization_id = (select id from org where slug = 'geardrop')$$,
  array[4], 'a Gear Drop editor sees the Gear Drop team'
);
select results_eq(
  $$select count(*)::integer from public.organization_members where organization_id = (select id from org where slug = 'oryvenne')$$,
  array[0], 'a Gear Drop editor sees nothing of the Oryvenne team'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000004106","role":"authenticated"}', true);
set local role authenticated;
select is_empty($$select 1 from public.organization_members$$, 'an outsider sees no membership');
select results_eq($$select slug from public.organizations$$, $$values ('geardrop'::text)$$, 'an outsider sees only the public shop');
reset role;

-- Two public shops make the implicit storefront ambiguous.
update public.organizations set storefront_public = true where slug = 'oryvenne';
select throws_ok(
  $$select private.single_storefront_organization()$$,
  '22023', 'GD_STOREFRONT_ORGANIZATION_AMBIGUOUS', 'two public shops must be named explicitly'
);

select * from finish();
rollback;
