-- Staff are managed per company.
--
-- - An invitation adds a membership in one company; the person's global profile is created on
--   their first invitation.
-- - Role changes and (de)activation act on one membership, with the last active owner of each
--   company protected and nobody changing themselves.
-- - Revoking access stays global: it switches off the profile and every membership, and only an
--   owner of a company the person works for may do it.
-- - staff_profiles.role is kept as a convenience copy of the person's highest active role; it no
--   longer authorizes anything.
-- - Staff identity events (login, revocation) belong to no company; membership events belong to
--   the company they change.
begin;

create or replace function private.sync_staff_role(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.staff_profiles as staff
  set role = highest.role
  from (
    select case
      when bool_or(member.role = 'owner') then 'owner'::public.staff_role
      when bool_or(member.role = 'admin') then 'admin'::public.staff_role
      else 'editor'::public.staff_role
    end as role
    from public.organization_members as member
    where member.user_id = p_user_id and member.active
    having count(*) > 0
  ) as highest
  where staff.user_id = p_user_id and staff.role is distinct from highest.role;
$$;
revoke all on function private.sync_staff_role(uuid) from public;

-- Active owners left in a company, not counting disabled accounts.
create or replace function private.active_owner_count(p_organization_id bigint)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)
  from public.organization_members as member
  join public.staff_profiles as staff on staff.user_id = member.user_id
  where member.organization_id = p_organization_id and member.role = 'owner' and member.active and staff.active;
$$;
revoke all on function private.active_owner_count(bigint) from public;

drop function public.record_staff_invite(uuid, text, text, public.staff_role);
create function public.record_staff_invite(
  p_organization_id bigint,
  p_user_id uuid,
  p_email text,
  p_display_name text,
  p_role public.staff_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  perform private.require_org_role(p_organization_id, array['owner'::public.staff_role], 'GD_STAFF_OWNER_REQUIRED');
  if p_organization_id is null then
    raise exception using errcode = '22023', message = 'GD_ORGANIZATION_REQUIRED';
  end if;
  if exists (
    select 1 from public.organization_members where organization_id = p_organization_id and user_id = p_user_id
  ) then
    raise exception using errcode = '23505', message = 'GD_STAFF_ALREADY_MEMBER';
  end if;
  insert into public.staff_profiles (
    user_id, display_name, role, invite_email, invite_status, invited_at, active, created_by, updated_by
  ) values (
    p_user_id, trim(p_display_name), p_role, lower(trim(p_email)), 'invited', now(), true, actor_id, actor_id
  )
  on conflict (user_id) do nothing;
  insert into public.organization_members (organization_id, user_id, role, active, created_by, updated_by)
  values (p_organization_id, p_user_id, p_role, true, actor_id, actor_id)
  on conflict (organization_id, user_id) do update set role = excluded.role, active = true, updated_by = excluded.updated_by;
  perform private.sync_staff_role(p_user_id);
  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, after_state)
  values (p_organization_id, actor_id, 'staff.invited', 'staff_profiles', p_user_id::text,
    jsonb_build_object('role', p_role, 'invite_email', lower(trim(p_email))));
end;
$$;
revoke all on function public.record_staff_invite(bigint, uuid, text, text, public.staff_role) from public, anon, authenticated;
grant execute on function public.record_staff_invite(bigint, uuid, text, text, public.staff_role) to authenticated;

create or replace function public.record_staff_login()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  previous_status public.staff_invite_status;
begin
  if cardinality(private.member_organization_ids(
    array['owner'::public.staff_role, 'admin'::public.staff_role, 'editor'::public.staff_role]
  )) = 0 then
    raise exception using errcode = '42501', message = 'GD_STAFF_REQUIRED';
  end if;
  select invite_status into previous_status from public.staff_profiles where user_id = actor_id for update;
  update public.staff_profiles
  set invite_status = 'active', accepted_at = coalesce(accepted_at, now()), last_login_at = now(), updated_by = actor_id
  where user_id = actor_id;
  if previous_status = 'invited' then
    insert into public.audit_events (actor_user_id, action, entity_type, entity_id, after_state)
    values (actor_id, 'staff.invite_accepted', 'staff_profiles', actor_id::text, jsonb_build_object('status', 'active'));
  end if;
end;
$$;

drop function public.change_staff_role(uuid, public.staff_role);
create function public.change_staff_role(p_organization_id bigint, p_user_id uuid, p_role public.staff_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  before_member public.organization_members%rowtype;
begin
  perform private.require_org_role(p_organization_id, array['owner'::public.staff_role], 'GD_STAFF_OWNER_REQUIRED');
  select * into before_member from public.organization_members
  where organization_id = p_organization_id and user_id = p_user_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'GD_STAFF_NOT_FOUND';
  end if;
  if before_member.role = 'owner' and before_member.active and p_role <> 'owner'
    and private.active_owner_count(p_organization_id) <= 1 then
    raise exception using errcode = '55000', message = 'GD_STAFF_LAST_OWNER';
  end if;
  if p_user_id = actor_id then
    raise exception using errcode = '22023', message = 'GD_STAFF_SELF_CHANGE';
  end if;
  update public.organization_members set role = p_role, updated_by = actor_id
  where organization_id = p_organization_id and user_id = p_user_id;
  perform private.sync_staff_role(p_user_id);
  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, before_state, after_state)
  values (p_organization_id, actor_id, 'staff.role_changed', 'staff_profiles', p_user_id::text,
    jsonb_build_object('role', before_member.role, 'active', before_member.active),
    jsonb_build_object('role', p_role, 'active', before_member.active));
end;
$$;
revoke all on function public.change_staff_role(bigint, uuid, public.staff_role) from public, anon, authenticated;
grant execute on function public.change_staff_role(bigint, uuid, public.staff_role) to authenticated;

drop function public.set_staff_active(uuid, boolean);
create function public.set_staff_active(p_organization_id bigint, p_user_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  before_member public.organization_members%rowtype;
begin
  perform private.require_org_role(p_organization_id, array['owner'::public.staff_role], 'GD_STAFF_OWNER_REQUIRED');
  select * into before_member from public.organization_members
  where organization_id = p_organization_id and user_id = p_user_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'GD_STAFF_NOT_FOUND';
  end if;
  if not p_active and before_member.role = 'owner' and before_member.active
    and private.active_owner_count(p_organization_id) <= 1 then
    raise exception using errcode = '55000', message = 'GD_STAFF_LAST_OWNER';
  end if;
  if p_user_id = actor_id then
    raise exception using errcode = '22023', message = 'GD_STAFF_SELF_CHANGE';
  end if;
  update public.organization_members set active = p_active, updated_by = actor_id
  where organization_id = p_organization_id and user_id = p_user_id;
  -- Re-enabling someone at a company also re-enables an account that was switched off.
  if p_active then
    update public.staff_profiles
    set active = true, invite_status = 'active', accepted_at = coalesce(accepted_at, now()), revoked_at = null, updated_by = actor_id
    where user_id = p_user_id and not active;
  end if;
  perform private.sync_staff_role(p_user_id);
  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, before_state, after_state)
  values (p_organization_id, actor_id, 'staff.active_changed', 'staff_profiles', p_user_id::text,
    jsonb_build_object('active', before_member.active), jsonb_build_object('active', p_active));
end;
$$;
revoke all on function public.set_staff_active(bigint, uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_staff_active(bigint, uuid, boolean) to authenticated;

create or replace function public.revoke_staff_access(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  before_profile public.staff_profiles%rowtype;
  owned bigint[] := private.member_organization_ids(array['owner'::public.staff_role]);
begin
  if cardinality(owned) = 0 then
    raise exception using errcode = '42501', message = 'GD_STAFF_OWNER_REQUIRED';
  end if;
  select * into before_profile from public.staff_profiles where user_id = p_user_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'GD_STAFF_NOT_FOUND';
  end if;
  -- Only an owner of a company the person works for may switch them off.
  if not exists (
    select 1 from public.organization_members where user_id = p_user_id and organization_id = any (owned)
  ) then
    raise exception using errcode = '42501', message = 'GD_STAFF_OWNER_REQUIRED';
  end if;
  if before_profile.active and exists (
    select 1 from public.organization_members as member
    where member.user_id = p_user_id and member.role = 'owner' and member.active
      and private.active_owner_count(member.organization_id) <= 1
  ) then
    raise exception using errcode = '55000', message = 'GD_STAFF_LAST_OWNER';
  end if;
  if p_user_id = actor_id then
    raise exception using errcode = '22023', message = 'GD_STAFF_SELF_CHANGE';
  end if;
  update public.staff_profiles
  set active = false, invite_status = 'revoked', revoked_at = now(), updated_by = actor_id
  where user_id = p_user_id;
  update public.organization_members set active = false, updated_by = actor_id where user_id = p_user_id;
  insert into public.audit_events (actor_user_id, action, entity_type, entity_id, before_state, after_state)
  values (actor_id, 'staff.revoked', 'staff_profiles', p_user_id::text,
    jsonb_build_object('active', before_profile.active, 'status', before_profile.invite_status),
    jsonb_build_object('active', false, 'status', 'revoked'));
end;
$$;

commit;
