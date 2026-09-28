-- One back office for two companies. Gear Drop and Oryvenne are rows of `organizations`;
-- people reach a company through `organization_members`, never through user-editable
-- metadata. The two owners are owners of both companies; every other existing staff
-- member keeps their role at Gear Drop, where all the data is today.
--
-- This migration only adds the companies, the memberships and the authorization helpers.
-- Business tables gain organization_id in the next one.
begin;

create table public.organizations (
  id bigint generated always as identity primary key,
  slug text not null unique check (slug = lower(slug) and slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (char_length(trim(name)) between 1 and 120),
  legal_name text check (legal_name is null or char_length(legal_name) <= 200),
  order_number_prefix text not null unique check (order_number_prefix ~ '^[A-Z]{2,4}$'),
  currency text not null default 'EUR' check (currency = 'EUR'),
  storefront_public boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id bigint not null references public.organizations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.staff_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  primary key (organization_id, user_id)
);

create index organization_members_user_idx on public.organization_members (user_id) where active;

create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function private.set_updated_at();

create trigger organization_members_set_updated_at
before update on public.organization_members
for each row execute function private.set_updated_at();

insert into public.organizations (slug, name, order_number_prefix, storefront_public)
values
  ('geardrop', 'Gear Drop', 'GD', true),
  ('oryvenne', 'Oryvenne', 'OV', false)
on conflict (slug) do nothing;

-- Every staff member keeps the role they have today, at Gear Drop.
insert into public.organization_members (organization_id, user_id, role, active, created_by, updated_by)
select organization.id, staff.user_id, staff.role, staff.active, staff.created_by, staff.updated_by
from public.staff_profiles as staff
cross join public.organizations as organization
where organization.slug = 'geardrop'
on conflict (organization_id, user_id) do nothing;

-- The owners run both companies (decision 6 of the design: both partners have full powers).
insert into public.organization_members (organization_id, user_id, role, active, created_by, updated_by)
select organization.id, staff.user_id, 'owner', true, staff.created_by, staff.updated_by
from public.staff_profiles as staff
cross join public.organizations as organization
where organization.slug = 'oryvenne' and staff.role = 'owner' and staff.active
on conflict (organization_id, user_id) do nothing;

-- ---------------------------------------------------------------------------------------
-- Authorization helpers. All of them read the caller from auth.uid(); none trusts a value
-- the caller can edit. `staff_profiles.active` stays the global kill switch: an inactive
-- staff member loses every company at once.
-- ---------------------------------------------------------------------------------------

create or replace function private.member_organization_ids(allowed_roles public.staff_role[])
returns bigint[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(member.organization_id order by member.organization_id), array[]::bigint[])
  from public.organization_members as member
  join public.staff_profiles as staff on staff.user_id = member.user_id
  join public.organizations as organization on organization.id = member.organization_id
  where member.user_id = (select auth.uid())
    and member.active
    and staff.active
    and organization.active
    and member.role = any (allowed_roles);
$$;

create or replace function private.is_org_member(p_organization_id bigint, allowed_roles public.staff_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_organization_id is not null
    and p_organization_id = any (private.member_organization_ids(allowed_roles));
$$;

-- The caller's role in one company, or null when they are not an active member of it.
create or replace function private.org_role(p_organization_id bigint)
returns public.staff_role
language sql
stable
security definer
set search_path = ''
as $$
  select member.role
  from public.organization_members as member
  join public.staff_profiles as staff on staff.user_id = member.user_id
  join public.organizations as organization on organization.id = member.organization_id
  where member.organization_id = p_organization_id
    and member.user_id = (select auth.uid())
    and member.active
    and staff.active
    and organization.active;
$$;

-- Raises 42501 with the caller's own message unless they hold one of the roles in the
-- company. A null company means the target row does not exist: the caller must still hold
-- the role somewhere, so an outsider learns nothing and a manager gets the function's own
-- not-found error.
create or replace function private.require_org_role(
  p_organization_id bigint,
  allowed_roles public.staff_role[],
  p_message text
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_organization_id is null then
    if cardinality(private.member_organization_ids(allowed_roles)) = 0 then
      raise exception using errcode = '42501', message = p_message;
    end if;
    return;
  end if;
  if not private.is_org_member(p_organization_id, allowed_roles) then
    raise exception using errcode = '42501', message = p_message;
  end if;
end;
$$;

-- True for companies whose public shop anyone may read. Oryvenne has none.
create or replace function private.is_storefront_organization(p_organization_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organizations
    where id = p_organization_id and storefront_public and active
  );
$$;

-- The one company with a public shop. Storefront RPCs that are not told which shop they
-- serve fall back to it; with two public shops the caller must name one.
create or replace function private.single_storefront_organization()
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  shop_ids bigint[];
begin
  select array_agg(id order by id) into shop_ids
  from public.organizations
  where storefront_public and active;
  if coalesce(cardinality(shop_ids), 0) <> 1 then
    raise exception using errcode = '22023', message = 'GD_STOREFRONT_ORGANIZATION_AMBIGUOUS';
  end if;
  return shop_ids[1];
end;
$$;

revoke all on function private.member_organization_ids(public.staff_role[]) from public;
revoke all on function private.is_org_member(bigint, public.staff_role[]) from public;
revoke all on function private.org_role(bigint) from public;
revoke all on function private.require_org_role(bigint, public.staff_role[], text) from public;
revoke all on function private.is_storefront_organization(bigint) from public;
revoke all on function private.single_storefront_organization() from public;
grant execute on function private.member_organization_ids(public.staff_role[]) to authenticated;
grant execute on function private.is_org_member(bigint, public.staff_role[]) to authenticated;
grant execute on function private.org_role(bigint) to authenticated;
grant execute on function private.is_storefront_organization(bigint) to anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- Row level security. Nobody writes these tables directly: memberships change through the
-- staff RPCs, companies through reviewed migrations.
-- ---------------------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;

revoke all on table public.organizations from anon, authenticated;
revoke all on table public.organization_members from anon, authenticated;
grant select (id, slug, name, storefront_public) on table public.organizations to anon;
grant select on table public.organizations to authenticated;
grant select on table public.organization_members to authenticated;

create policy organizations_public_read on public.organizations
for select to anon, authenticated
using (storefront_public and active);

create policy organizations_member_read on public.organizations
for select to authenticated
using (
  id = any ((select private.member_organization_ids(
    array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role]
  ))::bigint[])
);

create policy organization_members_self_read on public.organization_members
for select to authenticated
using (user_id = (select auth.uid()));

create policy organization_members_member_read on public.organization_members
for select to authenticated
using (
  organization_id = any ((select private.member_organization_ids(
    array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role]
  ))::bigint[])
);

commit;
